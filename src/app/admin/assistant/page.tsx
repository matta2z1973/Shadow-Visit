import { requireAdmin } from "@/lib/auth";
import { getLlmSettingsMasked } from "@/lib/llm/settings";
import AssistantChat from "./chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireAdmin();

  let hasKey = false;
  try {
    const llm = await getLlmSettingsMasked();
    hasKey = llm.anthropicKeySet || !!process.env.ANTHROPIC_API_KEY;
  } catch {
    // A settings read failure shouldn't block the page — the route gives a
    // clearer error than a dead page would.
    hasKey = !!process.env.ANTHROPIC_API_KEY;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <span className="text-sm text-zinc-500">Make changes by describing them</span>
      </div>

      {!hasKey ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">No AI key configured yet.</p>
          <p className="mt-1">
            Add an Anthropic API key under <strong>Settings → AI</strong> and the
            assistant will start working. Nothing else needs setting up.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <AssistantChat />
        </div>
      )}
    </main>
  );
}
