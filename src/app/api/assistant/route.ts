import Anthropic from "@anthropic-ai/sdk";
import { eq, asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentConversations, agentMessages, agentActions } from "@/lib/db/schema";
import { getLlmSettings } from "@/lib/llm/settings";
import { isSandbox } from "@/lib/sandbox";
import { systemPrompt } from "@/lib/agent/system-prompt";
import { TOOLS, anthropicToolSpecs, isWriteTool, previewFor } from "@/lib/agent/tools";

// Vercel Hobby caps a function at 60s. The loop below streams so the admin
// sees progress immediately rather than staring at a spinner, and so the
// connection isn't idle long enough to look hung — but the ceiling is real,
// which is why MAX_TURNS is low and tools are quick single queries.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 6;

type SsePayload = Record<string, unknown>;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { conversationId, message } = (await req.json()) as {
    conversationId?: string;
    message?: string;
  };
  if (!message?.trim()) return new Response("Empty message", { status: 400 });

  const { anthropicApiKey } = await getLlmSettings();
  const apiKey = anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
  if (!apiKey) {
    return new Response(
      "No Anthropic API key is configured. Add one under Settings → AI, then try again.",
      { status: 503 },
    );
  }

  // Resume or start a thread.
  let convId = conversationId;
  if (!convId) {
    const [created] = await db
      .insert(agentConversations)
      .values({ createdBy: user.id, title: message.slice(0, 80) })
      .returning({ id: agentConversations.id });
    convId = created.id;
  }

  const prior = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, convId))
    .orderBy(asc(agentMessages.createdAt));

  const messages: Anthropic.MessageParam[] = prior.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as Anthropic.ContentBlockParam[],
  }));
  messages.push({ role: "user", content: [{ type: "text", text: message }] });

  await db.insert(agentMessages).values({
    conversationId: convId,
    role: "user",
    content: [{ type: "text", text: message }],
  });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: SsePayload) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("meta", { conversationId: convId });

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await client.messages
            .stream({
              model: MODEL,
              max_tokens: 8000,
              // Adaptive thinking: the triage decision and the consequence
              // checks are exactly the kind of reasoning worth paying for.
              // Effort defaults to medium on this model; "high" is worth it
              // here because a wrong call changes production config.
              thinking: { type: "adaptive" },
              output_config: { effort: "high" },
              system: systemPrompt({
                adminName: user.firstName || user.fullName || "an administrator",
                isSandbox: isSandbox(),
              }),
              messages,
              tools: anthropicToolSpecs() as Anthropic.Tool[],
            })
            .on("text", (delta) => send("text", { delta }))
            .finalMessage();

          messages.push({ role: "assistant", content: response.content });
          await db.insert(agentMessages).values({
            conversationId: convId!,
            role: "assistant",
            content: response.content,
          });

          if (response.stop_reason === "refusal") {
            send("error", { message: "The model declined to answer that." });
            break;
          }

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          if (toolUses.length === 0) break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const call of toolUses) {
            const def = TOOLS.get(call.name);
            if (!def) {
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content: `Unknown tool ${call.name}`,
              });
              continue;
            }

            // Validate before running. The model's arguments are untrusted
            // input like any other — a tolerant parser can hand back a
            // silently truncated object.
            const parsed = def.schema.safeParse(call.input);
            if (!parsed.success) {
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
              });
              continue;
            }

            send("tool", {
              name: call.name,
              write: isWriteTool(call.name),
              preview: previewFor(call.name, parsed.data),
            });

            try {
              const outcome = await (
                def.run as (i: unknown, c: { conversationId: string; profileId: string }) => Promise<{
                  result: unknown;
                  before?: unknown;
                  after?: unknown;
                  status: "ok" | "error" | "refused";
                  message?: string;
                }>
              )(parsed.data, { conversationId: convId!, profileId: user.id });

              if (def.write) {
                await db.insert(agentActions).values({
                  conversationId: convId!,
                  tool: call.name,
                  input: parsed.data as object,
                  before: (outcome.before ?? null) as object | null,
                  after: (outcome.after ?? null) as object | null,
                  status: outcome.status,
                  message: outcome.message ?? null,
                  createdBy: user.id,
                });
                send("applied", {
                  name: call.name,
                  status: outcome.status,
                  summary: previewFor(call.name, parsed.data),
                  message: outcome.message ?? null,
                });
              }

              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: JSON.stringify(outcome.result),
                is_error: outcome.status === "error",
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Tool failed.";
              console.error(`assistant tool ${call.name} failed`, err);
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content: msg,
              });
            }
          }

          messages.push({ role: "user", content: results });
          await db.insert(agentMessages).values({
            conversationId: convId!,
            role: "user",
            content: results,
          });
        }

        await db
          .update(agentConversations)
          .set({ updatedAt: new Date() })
          .where(eq(agentConversations.id, convId!));
        send("done", {});
      } catch (err) {
        console.error("assistant run failed", err);
        const message =
          err instanceof Anthropic.AuthenticationError
            ? "The Anthropic API key was rejected. Check it under Settings → AI."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limited by the API — try again in a moment."
              : err instanceof Error
                ? err.message
                : "Something went wrong.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
