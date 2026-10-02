"use client";

// Per-user light/dark switch. The choice lives in this browser's
// localStorage under "theme"; the inline script in layout.tsx applies it
// before first paint. The icon is chosen purely with `dark:` classes, so
// there's no React state to fall out of sync with the <html> class.
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (e.g. private mode) — toggle still works for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      <span aria-hidden className="dark:hidden">
        🌙
      </span>
      <span aria-hidden className="hidden dark:inline">
        ☀️
      </span>
    </button>
  );
}
