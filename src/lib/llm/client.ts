import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type KeyTestResult = { ok: boolean; message: string };

// Used right after an admin saves a key, so a typo is caught immediately
// instead of surfacing later mid-match-run.
export async function testAnthropicKey(apiKey: string): Promise<KeyTestResult> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    return { ok: true, message: "Anthropic key verified." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unknown error." };
  }
}

export async function testOpenAiKey(apiKey: string): Promise<KeyTestResult> {
  try {
    const client = new OpenAI({ apiKey });
    await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "test",
    });
    return { ok: true, message: "OpenAI key verified." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unknown error." };
  }
}
