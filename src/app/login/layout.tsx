import { quickLoginEnabled, quickLoginAllowlist } from "@/lib/sandbox";
import SandboxQuickLogin from "./sandbox-quick-login";

// A layout rather than a change to page.tsx: that page is a client component
// (useSearchParams/useState), so it can't read the server-only env vars the
// gate depends on. Keeping the decision here means the panel's markup is
// never sent to a browser in production — not hidden with CSS, not rendered
// and conditionally dropped. It simply doesn't exist.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const enabled = quickLoginEnabled();
  return (
    <>
      {children}
      {enabled ? (
        <div className="pointer-events-none fixed inset-x-0 top-10 z-50 flex justify-center p-4 sm:justify-end">
          <div className="pointer-events-auto w-full max-w-xs rounded-lg bg-white shadow-lg dark:bg-zinc-950">
            <SandboxQuickLogin emails={quickLoginAllowlist()} />
          </div>
        </div>
      ) : null}
    </>
  );
}
