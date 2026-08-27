import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Provider-agnostic LLM config, stored in the existing app_settings key/value
// table. Anthropic has no public embeddings endpoint, so the OpenAI key (if
// set) powers course-catalog embeddings regardless of which provider is
// chosen for reasoning/chat.
const KEY_CHAT_PROVIDER = "llm_chat_provider";
const KEY_ANTHROPIC_API_KEY = "llm_anthropic_api_key";
const KEY_OPENAI_API_KEY = "llm_openai_api_key";

export type ChatProvider = "anthropic" | "openai";

export type LlmSettings = {
  chatProvider: ChatProvider;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
};

export async function getLlmSettings(): Promise<LlmSettings> {
  // Read all rows in one round trip rather than one query per key.
  const all = await db.select().from(appSettings);
  const map = new Map(all.map((r) => [r.key, r.value]));
  const chatProvider = map.get(KEY_CHAT_PROVIDER);
  return {
    chatProvider: chatProvider === "openai" ? "openai" : "anthropic",
    anthropicApiKey: map.get(KEY_ANTHROPIC_API_KEY) || null,
    openaiApiKey: map.get(KEY_OPENAI_API_KEY) || null,
  };
}

function mask(key: string | null): string | null {
  if (!key) return null;
  const tail = key.slice(-4);
  return `•••• saved (…${tail})`;
}

export type LlmSettingsMasked = {
  chatProvider: ChatProvider;
  anthropicKeySet: boolean;
  anthropicKeyMasked: string | null;
  openaiKeySet: boolean;
  openaiKeyMasked: string | null;
};

export async function getLlmSettingsMasked(): Promise<LlmSettingsMasked> {
  const s = await getLlmSettings();
  return {
    chatProvider: s.chatProvider,
    anthropicKeySet: !!s.anthropicApiKey,
    anthropicKeyMasked: mask(s.anthropicApiKey),
    openaiKeySet: !!s.openaiApiKey,
    openaiKeyMasked: mask(s.openaiApiKey),
  };
}

async function upsert(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function remove(key: string) {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

export async function saveLlmSettings(args: {
  chatProvider: ChatProvider;
  anthropicApiKey?: string | null; // undefined = leave unchanged, null/"" = clear, string = set
  openaiApiKey?: string | null;
}) {
  await upsert(KEY_CHAT_PROVIDER, args.chatProvider);
  if (args.anthropicApiKey !== undefined) {
    if (args.anthropicApiKey) await upsert(KEY_ANTHROPIC_API_KEY, args.anthropicApiKey);
    else await remove(KEY_ANTHROPIC_API_KEY);
  }
  if (args.openaiApiKey !== undefined) {
    if (args.openaiApiKey) await upsert(KEY_OPENAI_API_KEY, args.openaiApiKey);
    else await remove(KEY_OPENAI_API_KEY);
  }
}
