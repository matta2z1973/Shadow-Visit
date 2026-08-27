"use client";

import { useActionState } from "react";
import { saveLlmSettingsAction, type SaveLlmSettingsResult } from "./actions";
import type { LlmSettingsMasked } from "@/lib/llm/settings";

const initial: SaveLlmSettingsResult = { ok: false, message: "" };

export default function LlmSettingsForm({ settings }: { settings: LlmSettingsMasked }) {
  const [state, action, pending] = useActionState(saveLlmSettingsAction, initial);

  return (
    <form action={action} className="mt-4 space-y-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Reasoning provider</span>
        <select
          name="chatProvider"
          defaultValue={settings.chatProvider}
          className="w-fit rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Anthropic API key</span>
          <input
            name="anthropicApiKey"
            type="password"
            autoComplete="off"
            placeholder={settings.anthropicKeyMasked ?? "sk-ant-…"}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {settings.anthropicKeySet ? (
            <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <input type="checkbox" name="clearAnthropicKey" className="h-3.5 w-3.5" />
              Remove saved key
            </label>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">OpenAI API key</span>
          <input
            name="openaiApiKey"
            type="password"
            autoComplete="off"
            placeholder={settings.openaiKeyMasked ?? "sk-…"}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {settings.openaiKeySet ? (
            <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <input type="checkbox" name="clearOpenaiKey" className="h-3.5 w-3.5" />
              Remove saved key
            </label>
          ) : null}
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Leave a field blank to keep the currently saved key. OpenAI powers the course-catalog
        embeddings below regardless of which reasoning provider you pick, since Claude doesn&rsquo;t
        offer a public embeddings API. PDF course-catalog parsing uses whichever provider is
        selected above if its key is saved, otherwise it automatically falls back to whichever
        key you do have — you only need one of the two.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-forest dark:text-white"
      >
        {pending ? "Saving…" : "Save"}
      </button>

      {state.message ? (
        <p
          className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
