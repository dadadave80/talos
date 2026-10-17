"use client";

import { useEffect } from "react";

type Theme = "light" | "dark";
const KEY = "talos.theme.v1";
const COLOR = { dark: "#14120f", light: "#f4f0e8" };

// Stands in for the pre-paint script in app/layout.tsx when it never ran: Next's error shell renders the page on the
// client, where inline scripts don't execute. Same key, attribute, theme-color, labels, click delegation and API.
function installTheme() {
  const root = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: light)");
  let memory: Theme | null = null;
  const stored = (): Theme | null => {
    let v: string | null;
    try {
      v = localStorage.getItem(KEY);
    } catch {
      v = memory;
    }
    return v === "light" || v === "dark" ? v : null;
  };
  const store = (v: Theme | null) => {
    memory = v;
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {}
  };
  const apply = (changed: boolean) => {
    const t = stored() ?? (media.matches ? "light" : "dark");
    root.setAttribute("data-theme", t);
    if (!document.querySelector('meta[name="theme-color"]')) {
      const m = document.createElement("meta");
      m.setAttribute("name", "theme-color");
      document.head.append(m);
    }
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", COLOR[t]);
    for (const b of document.querySelectorAll("[data-theme-toggle]")) b.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
    if (changed) dispatchEvent(new Event("talos-theme"));
  };
  apply(false);
  window.__talosTheme = {
    get: () => stored() ?? "system",
    set: (mode) => {
      store(mode === "light" || mode === "dark" ? mode : null);
      apply(true);
    },
  };
  document.addEventListener("click", (e) => {
    if (!(e.target as Element | null)?.closest?.("[data-theme-toggle]")) return;
    store(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    apply(true);
  });
  media.addEventListener("change", () => {
    if (!stored()) apply(true);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) apply(true);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("theme-anim")));
}

/// The light/dark switch. The pre-paint script in app/layout.tsx handles the click (by delegation, so it works before
/// React loads), stores the choice and rewrites aria-label, hence suppressHydrationWarning; if that script never ran,
/// the first toggle to mount installs the same behaviour. A sun shows in dark (go light) and a moon in light;
/// globals.css swaps them on :root[data-theme].
export function ThemeToggle() {
  useEffect(() => {
    const t = window.__talosTheme;
    if (!t) installTheme();
    // A client render of <html> (React's recovery from a failed hydration) drops every attribute the script set.
    else if (!document.documentElement.hasAttribute("data-theme")) t.set(t.get());
  }, []);
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label="Switch to light theme"
      suppressHydrationWarning
      className="flex size-11 flex-none cursor-pointer items-center justify-center border border-rule text-ink-2 hover:border-bronze hover:text-ink lg:size-9"
    >
      <svg className="theme-sun" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
      </svg>
      <svg className="theme-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
