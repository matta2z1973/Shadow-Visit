import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getLlmSettings } from "@/lib/llm/settings";
import type { ParsedCourseRow } from "./parse-course-catalog";

export class NoLlmKeyConfiguredError extends Error {
  constructor() {
    super(
      "No Anthropic or OpenAI API key configured. Add one on the AI Settings page to enable PDF course-catalog parsing.",
    );
    this.name = "NoLlmKeyConfiguredError";
  }
}

// Base64 inflates size by ~4/3; stay well under both providers' request caps.
const MAX_PDF_BYTES = 24 * 1024 * 1024;

// A course catalog PDF is mostly *not* courses — department intros, grad
// requirements, front/back matter. Whichever model reads it decides what's
// actually a course, via structured output so the result is guaranteed to
// parse as this exact shape. `anyOf` (not the `type: ["string","null"]`
// shorthand) for nullable fields, since OpenAI's strict structured-output
// mode is documented to require it — this form works on both providers.
const COURSE_CATALOG_SCHEMA = {
  type: "object",
  properties: {
    courses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { anyOf: [{ type: "string" }, { type: "null" }] },
          title: { type: "string" },
          description: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["code", "title", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["courses"],
  additionalProperties: false,
};

const EXTRACTION_PROMPT =
  "This PDF is a school course catalog. Extract every individual course offered — " +
  "skip department overviews, graduation requirements, program philosophy, and any " +
  "front or back matter that isn't describing one specific course. For each course, " +
  "return its course code exactly as printed if one exists (else null), its full " +
  "title, and its description if the catalog includes one (else null). Include every " +
  "course you find, even in a long catalog — do not sample or summarize a subset.";

type ResolvedProvider =
  | { provider: "anthropic"; apiKey: string }
  | { provider: "openai"; apiKey: string };

// Uses whichever provider is selected as the reasoning provider on
// /admin/settings, as long as its key is actually saved; if that provider's
// key is missing, falls back to whichever key *is* saved rather than
// hard-requiring one specific provider.
async function resolveProvider(): Promise<ResolvedProvider> {
  const settings = await getLlmSettings();
  if (settings.chatProvider === "anthropic" && settings.anthropicApiKey) {
    return { provider: "anthropic", apiKey: settings.anthropicApiKey };
  }
  if (settings.chatProvider === "openai" && settings.openaiApiKey) {
    return { provider: "openai", apiKey: settings.openaiApiKey };
  }
  if (settings.anthropicApiKey) return { provider: "anthropic", apiKey: settings.anthropicApiKey };
  if (settings.openaiApiKey) return { provider: "openai", apiKey: settings.openaiApiKey };
  throw new NoLlmKeyConfiguredError();
}

function parseCoursesJson(text: string): ParsedCourseRow[] {
  let parsed: { courses: ParsedCourseRow[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The model's response wasn't valid JSON — try again.");
  }
  return parsed.courses.filter((c) => c.title && c.title.trim().length > 0);
}

async function extractViaAnthropic(apiKey: string, bytes: ArrayBuffer): Promise<ParsedCourseRow[]> {
  const client = new Anthropic({ apiKey });
  const base64 = Buffer.from(bytes).toString("base64");

  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 64000,
    output_config: { format: { type: "json_schema", schema: COURSE_CATALOG_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("Claude declined to process this PDF.");
  }
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude didn't return a parseable course list — try again.");
  }
  return parseCoursesJson(textBlock.text);
}

async function extractViaOpenAi(
  apiKey: string,
  bytes: ArrayBuffer,
  filename: string,
): Promise<ParsedCourseRow[]> {
  const client = new OpenAI({ apiKey });
  const base64 = Buffer.from(bytes).toString("base64");

  const response = await client.responses.create({
    model: "gpt-4o",
    max_output_tokens: 16384,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename,
            file_data: `data:application/pdf;base64,${base64}`,
          },
          { type: "input_text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "course_catalog",
        schema: COURSE_CATALOG_SCHEMA,
        strict: true,
      },
    },
  });

  return parseCoursesJson(response.output_text);
}

export async function extractCoursesFromPdf(
  bytes: ArrayBuffer,
  filename: string,
): Promise<ParsedCourseRow[]> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `PDF is too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB, max ~24MB). Try splitting it into smaller files.`,
    );
  }

  const resolved = await resolveProvider();
  return resolved.provider === "anthropic"
    ? extractViaAnthropic(resolved.apiKey, bytes)
    : extractViaOpenAi(resolved.apiKey, bytes, filename);
}
