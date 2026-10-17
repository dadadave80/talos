"use client";

import { useEffect, useRef, useState } from "react";

// "The path of a message": one token travels You → Talos decides → Arc (commit first) → the contract gate, and plays
// the three outcomes in order: through the gate (PAY), bounced (REFUSE), diverted to the owner's signature (QUEUE).
// Routes draw on when the figure enters the viewport, play once, and replay on hover or tap. Reduced motion shows the
// finished figure. CSS motion path + WAAPI; no library.

type Props = {
  perTx: string; // most one message can take, from the vault
  cap: string; // rolling-day budget
  delayHours: number; // timelock on any change
  commitUrl: string | null; // a real commit tx
  payUrl: string | null; // a real settlement tx
  refuseUrl: string | null; // a real refusal receipt
};

type P = [number, number];
type Layout = {
  box: string;
  you: P; talos: P; arc: P; gate: P; pay: P; queue: P; refuse: P;
  gateLine: [P, P];
  gateLabel: { at: P; anchor: "start" | "middle" };
  routes: { pay: string; queue: string; refuse: string };
  labelBelow: boolean;
};

const WIDE: Layout = {
  box: "0 0 760 290",
  you: [70, 130], talos: [228, 130], arc: [386, 130], gate: [546, 130], pay: [704, 130], queue: [704, 52], refuse: [400, 238],
  gateLine: [[546, 80], [546, 180]],
  gateLabel: { at: [566, 206], anchor: "start" },
  routes: {
    pay: "M70,130 H704",
    queue: "M70,130 H546 C 610,130 650,52 704,52",
    refuse: "M70,130 H540 C 540,170 480,208 400,238",
  },
  labelBelow: true,
};

const TALL: Layout = {
  box: "0 0 380 600",
  you: [60, 40], talos: [60, 180], arc: [60, 320], gate: [60, 460], pay: [60, 570], queue: [270, 570], refuse: [250, 390],
  gateLine: [[20, 460], [100, 460]],
  gateLabel: { at: [150, 440], anchor: "start" },
  routes: {
    pay: "M60,40 V570",
    queue: "M60,40 V460 C 60,530 180,570 270,570",
    refuse: "M60,40 V452 C 60,440 120,400 250,390",
  },
  labelBelow: false,
};

const EASE = "cubic-bezier(0.77, 0, 0.175, 1)";

export function PathOfAMessage(p: Props) {
  return (
    <>
      <Figure layout={WIDE} {...p} className="max-lg:hidden" />
      <Figure layout={TALL} {...p} className="lg:hidden" />
    </>
  );
}

function Figure({ layout: L, className, ...p }: Props & { layout: Layout; className: string }) {
  const root = useRef<SVGSVGElement>(null);
  const token = useRef<SVGCircleElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [lit, setLit] = useState<"pay" | "refuse" | "queue" | null>(null);
  const [done, setDone] = useState(false);
  const playing = useRef(false);
  const reduce = useRef(false);

  const play = async () => {
    const t = token.current;
    if (!t || playing.current || reduce.current) return;
    playing.current = true;
    setDone(false);
    setDrawn(true);
    await wait(900);
    for (const k of ["pay", "refuse", "queue"] as const) {
      setLit(null);
      t.style.offsetPath = `path("${L.routes[k]}")`;
      t.style.opacity = "1";
      const a = t.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], { duration: 1300, easing: EASE, fill: "forwards" });
      await a.finished.catch(() => {});
      setLit(k);
      await wait(550);
      t.style.opacity = "0";
      await wait(150);
    }
    setLit(null);
    setDone(true);
    playing.current = false;
  };

  useEffect(() => {
    reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) {
      setDrawn(true);
      setDone(true);
      return;
    }
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stroke = (k: "pay" | "refuse" | "queue") => `${drawn ? "draw drawn" : "draw"} ${lit === k || done ? "" : "faint"}`;
  const node = (at: P, label: string, href: string | null, sub?: string, tone = "") => {
    const [x, y] = at;
    const above = L.labelBelow ? y < 100 : false;
    const body = (
      <g className={`node ${tone}`}>
        <circle cx={x} cy={y} r={6} fill="var(--bg)" stroke="currentColor" strokeWidth="1" />
        <text x={L.labelBelow ? x : x + 14} y={L.labelBelow ? (above ? y - 16 : y + 24) : y + 4} textAnchor={L.labelBelow ? "middle" : "start"} className="lbl">{label}</text>
        {sub && <text x={L.labelBelow ? x : x + 14} y={L.labelBelow ? (above ? y - 32 : y + 40) : y + 20} textAnchor={L.labelBelow ? "middle" : "start"} className="sub">{sub}</text>}
      </g>
    );
    return href ? <a href={href} aria-label={`${label}${sub ? `, ${sub}` : ""}`}>{body}</a> : body;
  };
  const [gl1, gl2] = L.gateLine;
  const [gx, gy] = L.gateLabel.at;
  const gateLines = [`cap ${p.perTx} / message`, `${p.cap} / rolling day`, "above the cap, a human signs", `${p.delayHours} h timelock on any change`];

  return (
    <svg
      ref={root}
      viewBox={L.box}
      className={`path-fig w-full ${className}`}
      role="img"
      aria-label={`The path of a message: you, Talos decides, the commit is written to Arc, then the contract gate caps it at ${p.perTx} USDC a message and ${p.cap} a rolling day; above the cap a human signs. Outcomes: paid, refused, or queued for the owner.`}
      onPointerEnter={play}
      onClick={play}
    >
      <path d={L.routes.pay} pathLength={1} className={stroke("pay")} />
      <path d={L.routes.refuse} pathLength={1} className={stroke("refuse")} />
      <path d={L.routes.queue} pathLength={1} className={stroke("queue")} />
      <line x1={gl1[0]} y1={gl1[1]} x2={gl2[0]} y2={gl2[1]} stroke="currentColor" strokeWidth="1.5" />
      {gateLines.map((t, i) => (
        <text key={t} x={gx} y={gy + i * 15} textAnchor={L.gateLabel.anchor} className="sub">{t}</text>
      ))}
      {node(L.you, "You", "/arena", "a signed message")}
      {node(L.talos, "Talos decides", "/policy#brain", "pay · queue · refuse")}
      {node(L.arc, "Arc", p.commitUrl, "commit written first")}
      <a href="/policy#caps" aria-label="The contract gate">
        <g className="node">
          <text x={L.labelBelow ? L.gate[0] : L.gateLine[0][0]} y={L.labelBelow ? L.gate[1] - 64 : L.gate[1] - 20} textAnchor={L.labelBelow ? "middle" : "start"} className="lbl">Contract gate</text>
        </g>
      </a>
      {node(L.pay, "Paid", p.payUrl, "inside the cap", `out ${lit === "pay" || done ? "lit-pay" : ""}`)}
      {node(L.refuse, "Refused", p.refuseUrl, "nothing moves", `out ${lit === "refuse" || done ? "lit-refuse" : ""}`)}
      {node(L.queue, "Queued", "/policy#queue", "owner signs", `out ${lit === "queue" || done ? "lit-queue" : ""}`)}
      <circle ref={token} r={5} fill="var(--bronze)" style={{ opacity: 0, offsetRotate: "0deg" }} aria-hidden="true" />
    </svg>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
