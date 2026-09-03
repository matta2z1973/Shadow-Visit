"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { eq, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses, importBatches } from "@/lib/db/schema";
import { saveLlmSettings, type ChatProvider } from "@/lib/llm/settings";
import { testAnthropicKey, testOpenAiKey } from "@/lib/llm/client";
import { embedTexts } from "@/lib/llm/embeddings";
import { parseCourseCatalogRows, type ParsedCourseRow } from "@/lib/courses/parse-course-catalog";
import { extractCoursesFromPdf } from "@/lib/courses/extract-courses-from-pdf";

export type SaveLlmSettingsResult = { ok: boolean; message: string };

const llmSchema = z.object({
  chatProvider: z.enum(["anthropic", "openai"]),
  anthropicApiKey: z.string().trim().optional(),
  openaiApiKey: z.string().trim().optional(),
  clearAnthropicKey: z.coerce.boolean().optional(),
  clearOpenaiKey: z.coerce.boolean().optional(),
});

export async function saveLlmSettingsAction(
  _prev: SaveLlmSettingsResult | undefined,
  formData: FormData,
): Promise<SaveLlmSettingsResult> {
  await requireAdmin();
  const parsed = llmSchema.safeParse({
    chatProvider: formData.get("chatProvider"),
    anthropicApiKey: formData.get("anthropicApiKey") || undefined,
    openaiApiKey: formData.get("openaiApiKey") || undefined,
    clearAnthropicKey: formData.get("clearAnthropicKey") === "on",
    clearOpenaiKey: formData.get("clearOpenaiKey") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid form submission." };
  }

  const messages: string[] = [];

  if (parsed.data.anthropicApiKey) {
    const test = await testAnthropicKey(parsed.data.anthropicApiKey);
    messages.push(test.message);
    if (!test.ok) return { ok: false, message: `Anthropic key rejected: ${test.message}` };
  }
  if (parsed.data.openaiApiKey) {
    const test = await testOpenAiKey(parsed.data.openaiApiKey);
    messages.push(test.message);
    if (!test.ok) return { ok: false, message: `OpenAI key rejected: ${test.message}` };
  }

  await saveLlmSettings({
    chatProvider: parsed.data.chatProvider as ChatProvider,
    anthropicApiKey: parsed.data.clearAnthropicKey
      ? null
      : parsed.data.anthropicApiKey || undefined,
    openaiApiKey: parsed.data.clearOpenaiKey ? null : parsed.data.openaiApiKey || undefined,
  });

  revalidatePath("/admin/settings");
  return { ok: true, message: messages.join(" ") || "Settings saved." };
}

export type CourseCatalogResult = {
  ok: boolean;
  message: string;
  courseCount: number;
};

export async function uploadCourseCatalogAction(
  _prev: CourseCatalogResult | undefined,
  formData: FormData,
): Promise<CourseCatalogResult> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file selected.", courseCount: 0 };
  }

  const bytes = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let rows: ParsedCourseRow[];
  let warnings: string[] = [];
  if (isPdf) {
    try {
      rows = await extractCoursesFromPdf(bytes, file.name);
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "PDF parsing failed.",
        courseCount: 0,
      };
    }
    if (!rows.length) {
      return {
        ok: false,
        message: "No courses were found in this PDF.",
        courseCount: 0,
      };
    }
  } else {
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });
    const parsedSheet = parseCourseCatalogRows(rawRows);
    rows = parsedSheet.rows;
    warnings = parsedSheet.warnings;
    if (!rows.length) {
      return { ok: false, message: warnings.join(" ") || "No courses found.", courseCount: 0 };
    }
  }

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(
      rows.map((r) => [r.title, r.description].filter(Boolean).join(" — ")),
    );
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Embedding failed.",
      courseCount: 0,
    };
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      kind: "course_catalog",
      fileName: file.name,
      rowCount: rows.length,
      uploadedBy: admin.id,
    })
    .returning({ id: importBatches.id });

  // Full catalog replacement — one upload = the current source of truth.
  await db.delete(courses);
  await db.insert(courses).values(
    rows.map((r, i) => ({
      code: r.code,
      title: r.title,
      description: r.description,
      embedding: embeddings[i],
      importBatchId: batch.id,
    })),
  );

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message:
      `Loaded ${rows.length} course(s).` +
      (warnings.length ? ` ${warnings.join(" ")}` : ""),
    courseCount: rows.length,
  };
}

export async function clearCourseCatalog() {
  await requireAdmin();
  await db.delete(courses);
  revalidatePath("/admin/settings");
}

export type BackfillEmbeddingsResult = { ok: boolean; message: string };

// One-time repair: courses normally get their embedding computed at upload
// time (see uploadCourseCatalogAction above), but the current catalog was
// loaded via a direct database migration that copied title/code/description
// without ever calling the embeddings API, leaving every row's embedding
// NULL. Semantic interest-to-course matching silently has nothing to work
// with until these are backfilled — this computes and stores them the same
// way a normal upload does, just for whatever's missing one.
export async function backfillCourseEmbeddings(
  _prev: BackfillEmbeddingsResult | undefined,
): Promise<BackfillEmbeddingsResult> {
  await requireAdmin();

  const missing = await db
    .select({ id: courses.id, title: courses.title, description: courses.description })
    .from(courses)
    .where(isNull(courses.embedding));
  if (!missing.length) {
    return { ok: true, message: "Every course already has an embedding." };
  }

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(
      missing.map((c) => [c.title, c.description].filter(Boolean).join(" — ")),
    );
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Embedding failed.",
    };
  }

  await Promise.all(
    missing.map((c, i) => db.update(courses).set({ embedding: embeddings[i] }).where(eq(courses.id, c.id))),
  );

  revalidatePath("/admin/settings");
  return { ok: true, message: `Embedded ${missing.length} course(s).` };
}
