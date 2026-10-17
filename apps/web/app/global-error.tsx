"use client";

import { useEffect } from "react";

// The root layout itself failed, so neither globals.css nor the theme script can be relied on: the tokens are inline,
// and a stored theme choice is applied on mount.
const LIGHT = "--bg: #f4f0e8; --ink: #1e1b16; --ink-2: #555046; --ink-3: #6b655b; --bronze: #8f5b2c; --refuse: #a8432e; --focus: #a46c37; color-scheme: light;";
const CSS = `
:root { --bg: #14120f; --ink: #eae5da; --ink-2: #b0aa9f; --ink-3: #8a857b; --bronze: #c48a52; --refuse: #c56b55; --focus: #f2c79a; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${LIGHT} } }
:root[data-theme="light"] { ${LIGHT} }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, sans-serif; }
main { max-width: 40rem; padding: 4rem 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
h1 { margin: 0; font: 500 40px/44px Georgia, serif; }
p { margin: 0; color: var(--ink-2); font-size: 17px; line-height: 28px; }
.label { color: var(--refuse); font-weight: 600; font-size: 14px; }
code { color: var(--ink-3); font: 12px ui-monospace, Menlo, monospace; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.5rem; }
button { height: 48px; padding: 0 1.5rem; border: 0; border-radius: 0; background: var(--bronze); color: var(--bg); font: 600 16px Arial, sans-serif; cursor: pointer; }
a { color: var(--ink); font-weight: 500; text-underline-offset: 6px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`;

export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; reset: () => void; unstable_retry: () => void }) {
  useEffect(() => {
    try {
      const t = localStorage.getItem("talos.theme.v1");
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    } catch {}
  }, []);
  return (
    <html lang="en">
      <body>
        <title>Error · Talos</title>
        <style>{CSS}</style>
        <main id="main">
          <span className="label">Talos · error</span>
          <h1>This page didn&apos;t load.</h1>
          <p>Arc or the database didn&apos;t answer. Nothing was decided or moved.</p>
          {error.digest && <code>Reference {error.digest}</code>}
          <div className="row">
            <button type="button" onClick={() => unstable_retry()}>Try again</button>
            <a href="/arena">Back to the arena</a>
          </div>
        </main>
      </body>
    </html>
  );
}
