// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye app/layout.tsx (the inline theme script).
// Talos changes: Talos key and colours, [data-theme-toggle] delegation, aria-label only, a "system" mode via
// window.__talosTheme, a talos-theme event, cross-tab sync; plus the session provider and the shared page frame.
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "./session";
import { SiteFooter, SiteHeader } from "./site-header";
import "./globals.css";

// The same .woff files feed the OG images (satori cannot read woff2), so the web and the share cards match.
const brygada = localFont({
  variable: "--font-brygada",
  src: [
    { path: "../assets/fonts/brygada-1918-latin-500-normal.woff", weight: "500" },
    { path: "../assets/fonts/brygada-1918-latin-600-normal.woff", weight: "600" },
  ],
});
const schibsted = localFont({
  variable: "--font-schibsted",
  src: [
    { path: "../assets/fonts/schibsted-grotesk-latin-400-normal.woff", weight: "400" },
    { path: "../assets/fonts/schibsted-grotesk-latin-500-normal.woff", weight: "500" },
    { path: "../assets/fonts/schibsted-grotesk-latin-600-normal.woff", weight: "600" },
  ],
});
const commit = localFont({
  variable: "--font-commit",
  src: [
    { path: "../assets/fonts/commit-mono-latin-400-normal.woff", weight: "400" },
    { path: "../assets/fonts/commit-mono-latin-500-normal.woff", weight: "500" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://talos-treasury.vercel.app"),
  title: { default: "Talos — try to rob an AI treasury", template: "%s · Talos" },
  description:
    "Talos runs an open-source project's treasury on Arc. Try to rob it. The most you can take is a contract parameter.",
  openGraph: { siteName: "Talos", type: "website" },
  twitter: { card: "summary_large_image" },
};

// One theme-color meta; the pre-paint script rewrites it to match the theme.
export const viewport: Viewport = { themeColor: "#14120f" };

declare global {
  interface Window {
    __talosTheme?: { get(): "system" | "light" | "dark"; set(mode: "system" | "light" | "dark"): void };
  }
}

// Runs while the body is parsed, before first paint, so the stored or OS theme never flashes. It follows the OS until
// a [data-theme-toggle] click or __talosTheme.set() stores a choice; set("system") clears it.
const THEME_SCRIPT = `(function () {
  var KEY = "talos.theme.v1";
  var COLOR = { dark: "#14120f", light: "#f4f0e8" };
  var root = document.documentElement;
  var memory = null;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function stored() {
    var v;
    try { v = window.localStorage.getItem(KEY); } catch (e) { v = memory; }
    return v === "light" || v === "dark" ? v : null;
  }
  function store(v) {
    memory = v;
    try { if (v) window.localStorage.setItem(KEY, v); else window.localStorage.removeItem(KEY); } catch (e) {}
  }
  function sync(t) {
    var b = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  function apply(changed) {
    var t = stored() || (media && media.matches ? "light" : "dark");
    root.setAttribute("data-theme", t);
    var ms = document.querySelectorAll('meta[name="theme-color"]');
    if (!ms.length) { var m = document.createElement("meta"); m.setAttribute("name", "theme-color"); document.head.appendChild(m); ms = [m]; }
    for (var j = 0; j < ms.length; j++) ms[j].setAttribute("content", COLOR[t]);
    sync(t);
    if (changed) window.dispatchEvent(new Event("talos-theme"));
  }
  apply(false);
  window.__talosTheme = {
    get: function () { return stored() || "system"; },
    set: function (mode) { store(mode === "light" || mode === "dark" ? mode : null); apply(true); }
  };
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (!b) return;
    store(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    apply(true);
  });
  function onOs() { if (!stored()) apply(true); }
  if (media && media.addEventListener) media.addEventListener("change", onOs);
  else if (media && media.addListener) media.addListener(onOs);
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === null) apply(true); });
  function ready() {
    sync(root.getAttribute("data-theme"));
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { root.classList.add("theme-anim"); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${brygada.variable} ${schibsted.variable} ${commit.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <a href="#main" className="sr-only bg-bronze text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:px-4 focus:py-2.5">
          Skip to content
        </a>
        <SessionProvider>
          <div className="relative mx-auto w-full max-w-[1280px] overflow-x-clip">
            <SiteHeader />
            {children}
            <SiteFooter />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
