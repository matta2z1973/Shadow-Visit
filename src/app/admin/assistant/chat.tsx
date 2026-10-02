"use client";

import { useEffect, useRef, useState } from "react";

type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; preview: string; write: boolean }
  | { kind: "applied"; summary: string; status: string; message: string | null }
  | { kind: "error"; text: string };

const SUGGESTIONS = [
  "How many hosts still haven't shared their calendar?",
  "Hosts are getting too many visits — can we spread them out more?",
  "I want to add Robotics as something students can pick",
  "Can you add a column to the hosts page showing their advisor?",
];

export default function AssistantChat() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setBubbles((b) => [...b, { kind: "user", text: trimmed }]);
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: trimmed }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text();
        setBubbles((b) => [...b, { kind: "error", text: detail || "Request failed." }]);
        return;
      }

      // Parse the SSE stream by hand — EventSource can't POST, and the
      // payloads here are small enough that a reader plus a buffer is less
      // machinery than pulling in a client library.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let openAssistant = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const evLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "meta") {
            setConversationId(data.conversationId);
          } else if (event === "text") {
            setBubbles((b) => {
              const next = [...b];
              const last = next[next.length - 1];
              if (openAssistant && last?.kind === "assistant") {
                next[next.length - 1] = { kind: "assistant", text: last.text + data.delta };
                return next;
              }
              openAssistant = true;
              return [...next, { kind: "assistant", text: data.delta }];
            });
          } else if (event === "tool") {
            openAssistant = false;
            setBubbles((b) => [
              ...b,
              { kind: "tool", name: data.name, preview: data.preview, write: data.write },
            ]);
          } else if (event === "applied") {
            openAssistant = false;
            setBubbles((b) => [
              ...b,
              {
                kind: "applied",
                summary: data.summary,
                status: data.status,
                message: data.message,
              },
            ]);
          } else if (event === "error") {
            openAssistant = false;
            setBubbles((b) => [...b, { kind: "error", text: data.message }]);
          }
        }
      }
    } catch (err) {
      setBubbles((b) => [
        ...b,
        { kind: "error", text: err instanceof Error ? err.message : "Connection failed." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4">
        {bubbles.length === 0 ? (
          <div className="py-6">
            <p className="text-sm text-zinc-600">
              Tell me what you want to be different. You don&rsquo;t need to know how
              anything is set up — describe the outcome and I&rsquo;ll work out
              whether it&rsquo;s something I can change, something that needs
              building, or something to hand to a developer.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {bubbles.map((b, i) => {
          if (b.kind === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-forest px-3 py-2 text-sm text-white">
                  {b.text}
                </div>
              </div>
            );
          }
          if (b.kind === "assistant") {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
                  {b.text}
                </div>
              </div>
            );
          }
          if (b.kind === "tool") {
            return (
              <div key={i} className="flex items-center gap-2 pl-1 text-xs text-zinc-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
                {b.write ? b.preview : `Checking: ${b.preview}`}
              </div>
            );
          }
          if (b.kind === "applied") {
            const ok = b.status === "ok";
            return (
              <div
                key={i}
                className={`rounded-md border px-3 py-2 text-xs ${
                  ok
                    ? "border-forest/30 bg-forest/5 text-zinc-800"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                <span className="font-semibold">{ok ? "Changed: " : "Not changed: "}</span>
                {b.summary}
                {b.message ? <span className="text-zinc-600"> — {b.message}</span> : null}
              </div>
            );
          }
          return (
            <div
              key={i}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {b.text}
            </div>
          );
        })}

        {busy ? <div className="pl-1 text-xs text-zinc-400">Thinking…</div> : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What would you like to change?"
          disabled={busy}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
