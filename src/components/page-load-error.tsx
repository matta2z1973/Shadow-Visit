"use client";

// Shown when a page's own data-loading queries fail or get cancelled
// (e.g. a stalled DB connection hitting statement_timeout). Without this,
// an uncaught rejection here can leave the request with no response at all
// — the header/shell already streamed, but nothing ever finishes the body,
// so the page just hangs forever from the visitor's side even though the
// server-side process itself survives. Rendering this instead guarantees
// the request always resolves to something visible.
export default function PageLoadError() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <h1 className="text-lg font-semibold tracking-tight">
        Couldn&rsquo;t load this page
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Something went wrong reaching the database. This is usually
        temporary — try reloading in a moment.
      </p>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.location.reload();
        }}
        className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 dark:bg-forest dark:text-white"
      >
        Reload
      </a>
    </main>
  );
}
