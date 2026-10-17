"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

// A diagram primitive: the nodes are ordinary HTML (so the type stays crisp and wraps at any width) and the connectors
// are an SVG overlay measured from the DOM, re-measured on resize. A run sends one token along a chain of nodes with
// the Web Animations API on a CSS motion path built from the same measurements. No library.

export type Edge = { from: string; to: string; part?: string };
export type Run = { path: string[]; light: string };
type Rect = { l: number; t: number; r: number; b: number; cx: number; cy: number };

const Ctx = createContext<{ lit: Set<string>; part: string | null }>({ lit: new Set(), part: null });
export const useFlow = () => useContext(Ctx);

const EASE = "cubic-bezier(0.77, 0, 0.175, 1)";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Right→left when the target sits to the right, bottom→top when it sits below, else centre to centre. Curves are
/// cubic with the handles halfway, so a same-row edge is a straight line and an offset one is a gentle S.
function edgePath(a: Rect, b: Rect): { d: string; a: [number, number]; b: [number, number] } {
  if (b.l >= a.r - 1) {
    const [x1, y1, x2, y2] = [a.r, a.cy, b.l, b.cy];
    const h = (x2 - x1) / 2;
    return { d: `M${x1},${y1} C${x1 + h},${y1} ${x2 - h},${y2} ${x2},${y2}`, a: [x1, y1], b: [x2, y2] };
  }
  if (b.t >= a.b - 1) {
    const [x1, y1, x2, y2] = [a.cx, a.b, b.cx, b.t];
    const v = (y2 - y1) / 2;
    return { d: `M${x1},${y1} C${x1},${y1 + v} ${x2},${y2 - v} ${x2},${y2}`, a: [x1, y1], b: [x2, y2] };
  }
  return { d: `M${a.cx},${a.cy} L${b.cx},${b.cy}`, a: [a.cx, a.cy], b: [b.cx, b.cy] };
}

export function Flow({
  edges,
  runs = [],
  autoplay = true,
  part = null,
  className = "",
  edgeClass = "",
  label,
  children,
}: {
  edges: Edge[];
  runs?: Run[];
  autoplay?: boolean;
  part?: string | null; // the highlighted part (hover/focus), lights its edges
  className?: string;
  edgeClass?: string; // e.g. "max-lg:hidden" when a stacked layout reads better without connectors
  label: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const token = useRef<HTMLSpanElement>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drawn, setDrawn] = useState(false);
  const [done, setDone] = useState(false);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [route, setRoute] = useState<string | null>(null);
  const playing = useRef(false);
  const reduce = useRef(false);
  // The observer is created once; it must see the latest measurements, not the first render's.
  const chainRef = useRef<(ids: string[]) => string | null>(() => null);

  const measure = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    for (const n of el.querySelectorAll<HTMLElement>("[data-node]")) {
      const r = n.getBoundingClientRect();
      const [l, t, rr, b] = [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top];
      next[n.dataset.node!] = { l, t, r: rr, b, cx: (l + rr) / 2, cy: (t + b) / 2 };
    }
    setRects(next);
    setSize({ w: box.width, h: box.height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (root.current) ro.observe(root.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const paths = useMemo(() => edges.map((e) => ({ ...e, ...(rects[e.from] && rects[e.to] ? edgePath(rects[e.from], rects[e.to]) : { d: "", a: [0, 0] as [number, number], b: [0, 0] as [number, number] }) })), [edges, rects]);

  /// The chain's path: each edge, joined by a straight line through the node between them.
  const chain = useCallback(
    (ids: string[]) => {
      let d = "";
      let prev: [number, number] | null = null;
      for (let i = 0; i < ids.length - 1; i++) {
        const e = paths.find((p) => p.from === ids[i] && p.to === ids[i + 1]);
        if (!e || !e.d) return null;
        d += prev ? ` L${e.a[0]},${e.a[1]} ${e.d.slice(e.d.indexOf("C"))}` : e.d;
        prev = e.b;
      }
      return d;
    },
    [paths],
  );
  chainRef.current = chain;

  const play = useCallback(async () => {
    const t = token.current;
    if (!t || playing.current || reduce.current || !runs.length) return;
    playing.current = true;
    setDone(false);
    setLit(new Set());
    setDrawn(true);
    await wait(850);
    for (const run of runs) {
      const d = chainRef.current(run.path);
      if (!d) continue;
      setRoute(run.path.join(">"));
      setLit(new Set([run.path[0]]));
      t.style.offsetPath = `path("${d}")`;
      t.style.opacity = "1";
      const ms = Math.min(2200, 450 * (run.path.length - 1));
      const a = t.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], { duration: ms, easing: EASE, fill: "forwards" });
      // Light each node as the token reaches it (even spacing is close enough for equal-length edges).
      run.path.slice(1).forEach((id, i) => setTimeout(() => setLit((s) => new Set([...s, id])), (ms * (i + 1)) / (run.path.length - 1) - 60));
      await a.finished.catch(() => {});
      await wait(600);
      t.style.opacity = "0";
      await wait(160);
    }
    setRoute(null);
    setLit(new Set(runs.map((r) => r.light)));
    setDone(true);
    playing.current = false;
  }, [runs]);

  useEffect(() => {
    reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current || !autoplay || !runs.length) {
      setDrawn(true);
      setDone(true);
      setLit(new Set(runs.map((r) => r.light)));
      return;
    }
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (io.disconnect(), play()), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRoute = (e: Edge) => route?.includes(`${e.from}>${e.to}`);
  return (
    <Ctx value={{ lit, part }}>
      <div ref={root} className={`relative ${className}`} onPointerEnter={runs.length ? play : undefined} onClick={runs.length ? play : undefined}>
        <svg className={`pointer-events-none absolute inset-0 overflow-visible ${edgeClass}`} width={size.w} height={size.h} aria-hidden="true">
          <defs>
            <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0.5 L7,4 L0,7.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </marker>
          </defs>
          {paths.map((p) => (
            <path
              key={`${p.from}>${p.to}`}
              d={p.d}
              pathLength={1}
              markerEnd="url(#flow-arrow)"
              className={`flow-edge ${drawn ? "drawn" : ""} ${onRoute(p) || (part && p.part === part) ? "on" : ""} ${done || !runs.length ? "" : "faint"}`}
            />
          ))}
        </svg>
        <span ref={token} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-10 size-2.5 rounded-full bg-bronze opacity-0" style={{ offsetRotate: "0deg" }} />
        <div role="img" aria-label={label} className="contents">{children}</div>
      </div>
    </Ctx>
  );
}

/// A node card. `tone` colours the title once lit (verdict colours for outcomes).
type Handlers = { onPointerEnter?: () => void; onFocus?: () => void; onClick?: () => void };
export function Node({ id, title, sub, href, tone = "text-bronze", part, className = "", children, ...h }: { id: string; title: string; sub?: ReactNode; href?: string | null; tone?: string; part?: string; className?: string; children?: ReactNode } & Handlers) {
  const { lit, part: cur } = useFlow();
  const on = lit.has(id) || (!!part && cur === part);
  const body = (
    <>
      <span className={`text-[15px] font-medium leading-5 ${on ? tone : "text-ink"}`}>{title}</span>
      {sub && <span className="font-mono text-xs leading-4 text-ink-3">{sub}</span>}
      {children}
    </>
  );
  const cls = `relative z-[1] flex flex-col gap-1 rounded-md border bg-raised px-3.5 py-3 text-ink hover:text-ink ${on ? "border-ink-2" : "border-rule"} ${className}`;
  const focusable = !href && (h.onClick || h.onFocus) ? { tabIndex: 0, role: "button" as const, "aria-pressed": on } : {};
  return href ? (
    <a data-node={id} href={href} className={cls} aria-label={`${title}${typeof sub === "string" ? `, ${sub}` : ""}`} {...h}>{body}</a>
  ) : (
    <div data-node={id} className={cls} {...focusable} {...h}>{body}</div>
  );
}
