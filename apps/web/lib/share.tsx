import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { arc } from "viem/chains";
import { chain } from "./chain";
import { db } from "./db";
import { evidence } from "./ledger/evidence";

// Share images (design: Talos Brand and Share, S1 OG, S2/S3 receipt, S5 closing slide). Dark tokens as hex:
// satori has no CSS variables, no font-feature-settings (so no smcp; small-caps labels fall back to Schibsted 600
// sentence case, per the design) and needs display:flex on every element with more than one child.
const C = { bg: "#14120F", rule: "#2E2B26", ink: "#EAE5DA", ink2: "#B0AA9F", bronze: "#C48A52", pay: "#66B39B", queue: "#D0A453", refuse: "#C56B55" };
const D = "Brygada", U = "Schibsted", M = "Commit";
export const HOST = "talos-treasury.vercel.app";
export const network = chain.id === arc.id ? "Arc mainnet" : "Arc testnet";

const font = (f: string) => readFile(join(process.cwd(), "assets/fonts", f));
async function fonts() {
  const spec = [
    [D, 500, "brygada-1918-latin-500-normal.woff"], [D, 600, "brygada-1918-latin-600-normal.woff"],
    [U, 400, "schibsted-grotesk-latin-400-normal.woff"], [U, 500, "schibsted-grotesk-latin-500-normal.woff"], [U, 600, "schibsted-grotesk-latin-600-normal.woff"],
    [M, 400, "commit-mono-latin-400-normal.woff"],
  ] as const;
  return Promise.all(spec.map(async ([name, weight, f]) => ({ name, weight, style: "normal" as const, data: await font(f) })));
}

const Mark = ({ size, color }: { size: number; color: string }) => (
  <svg viewBox="0 0 100 100" width={size} height={size}>
    <path d="M21,30 L46,20 L46,82 L33,77 Q21,72.5 21,60 Z M54,26 L79,36 L79,72 Q79,80.5 71,83 L54,88 Z" fill={color} />
  </svg>
);

/// The page with the bronze line: the one accent, at a tenth of the width.
const Frame = ({ w, h, children }: { w: number; h: number; children: React.ReactNode }) => (
  <div style={{ display: "flex", width: w, height: h, background: C.bg, color: C.ink, fontFamily: U, position: "relative" }}>
    <div style={{ position: "absolute", left: w / 10, top: 0, bottom: 0, width: 2, background: C.bronze }} />
    <div style={{ position: "absolute", left: w / 10 + w / 30, right: w / 10, top: h * 0.1, bottom: h * 0.11, display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>
);

/// Two-tone running text. Satori has no inline layout, so each word is a flex item in a wrapping row.
const Words = ({ parts, style }: { parts: [string, string?][]; style: React.CSSProperties }) => (
  <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.26em", ...style }}>
    {parts.flatMap(([text, color], i) => text.split(" ").filter(Boolean).map((w, j) => <span key={`${i}-${j}`} style={{ color }}>{w}</span>))}
  </div>
);

const image = async (el: React.ReactElement, size: { width: number; height: number }) => new ImageResponse(el, { ...size, fonts: await fonts() });
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const firstSentence = (s: string) => s.replace(/\s*\[contract:[^\]]*\]/, "").split(/(?<=[.!?])\s/)[0];

/// S1: the site's OG image with live external counters. Taken = DISCRETIONARY paid to external wallets.
export async function ogImage(size: { width: number; height: number }) {
  const e = await evidence();
  const taken = e.counters.payments.find((p) => p.tier === "DISCRETIONARY")?.external.usdc ?? "0";
  const counters = [["Attempts", e.counters.attempts], ["Refused", e.counters.refusals], ["Taken", `${taken} USDC`]];
  return image(
    <Frame w={1200} h={630}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: D, fontWeight: 600, fontSize: 30, letterSpacing: 2.4 }}>
        <Mark size={48} color={C.ink} />
        TALOS
      </div>
      <Words
        style={{ marginTop: 36, fontFamily: D, fontWeight: 500, fontSize: 56, lineHeight: "62px", letterSpacing: -0.6 }}
        parts={[[`Talos runs an open-source project's treasury on ${network}.`], ["Try to rob it. The most you can take is a contract parameter.", C.bronze]]}
      />
      <div style={{ marginTop: "auto", display: "flex", gap: 40, alignItems: "baseline", paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
        {counters.map(([l, v]) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 18, color: C.ink2 }}>{l}</span>
            <span style={{ fontFamily: D, fontWeight: 500, fontSize: 30 }}>{String(v)}</span>
          </div>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: M, fontSize: 18, color: C.ink2 }}>{HOST}</span>
      </div>
    </Frame>,
    size,
  );
}

export type Receipt = {
  id: string; ts: string; wallet_label: string; verdict: "PAY" | "QUEUE" | "REFUSE"; reason: string;
  message_excerpt: string | null; amount_usdc: number | null; commit_tx: string | null; index: number;
};

/// One committed attempt, numbered by its position in the attempts log. Null if missing or never decided.
export async function receipt(id: string): Promise<Receipt | null> {
  const sb = db();
  const { data } = await sb
    .from("attempts")
    .select("id,ts,wallet_label,verdict,reason,message_excerpt,amount_usdc,commit_tx")
    .eq("id", id)
    .maybeSingle();
  if (!data?.verdict) return null;
  const { count } = await sb.from("attempts").select("id", { count: "exact", head: true }).lte("ts", data.ts);
  return { ...data, index: count ?? 0 } as Receipt;
}

/// S2/S3: the receipt card. Team rows never get the "I took…" boast: they say so in the header instead.
export async function receiptImage(r: Receipt, size: { width: number; height: number }) {
  const team = r.wallet_label !== "external";
  const amount = r.amount_usdc != null ? Number(r.amount_usdc).toFixed(2) : null;
  const stamp =
    r.verdict === "PAY" ? { c: C.pay, t: amount ? `PAY ${amount} USDC` : "PAY" }
    : r.verdict === "QUEUE" ? { c: C.queue, t: amount ? `QUEUED ${amount} USDC` : "QUEUED" }
    : { c: C.refuse, t: "TALOS REFUSED" };
  const boast = r.verdict === "PAY" && !team && amount;
  return image(
    <Frame w={1200} h={630}>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: `1px solid ${C.ink}`, fontFamily: U, fontWeight: 600, fontSize: 24, color: C.ink2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Mark size={36} color={C.ink} />
            Talos · receipt
          </div>
          <span>{team ? "Team test · not counted" : `Attempt ${r.index}`}</span>
        </div>
        <div style={{ display: "flex" }}>
          <span style={{ padding: "4px 18px", border: `2px solid ${stamp.c}`, fontFamily: U, fontWeight: 600, fontSize: 40, letterSpacing: 1, color: stamp.c }}>{stamp.t}</span>
        </div>
        {boast ? (
          <Words
            style={{ fontFamily: D, fontWeight: 500, fontSize: 52, lineHeight: "60px" }}
            parts={[[`I took ${amount} USDC from a bronze automaton.`], ["It was a contract parameter.", C.bronze]]}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {r.message_excerpt && (
              <span style={{ fontFamily: D, fontWeight: 500, fontSize: 40, lineHeight: "48px" }}>{`“${r.message_excerpt}${r.message_excerpt.length >= 80 ? "…" : ""}”`}</span>
            )}
            <span style={{ fontSize: 26, lineHeight: "36px", color: C.ink2 }}>{firstSentence(r.reason)}</span>
          </div>
        )}
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontFamily: M, fontSize: 22, color: C.ink2 }}>
          <span>{r.commit_tx ? `commit ${short(r.commit_tx)}` : network}</span>
          <span>{`${HOST}/v/${r.id}`}</span>
        </div>
      </div>
    </Frame>,
    size,
  );
}

/// S5: the video's closing slide, live external counters.
export async function closingSlide() {
  const e = await evidence();
  const c = e.counters;
  const paid = c.payments.reduce((s, p) => s + Number(p.external.usdc), 0).toFixed(2);
  const stats = [[c.externalWallets.total, "wallets"], [c.attempts, "attempts"], [c.refusals, "refused"], [paid, "USDC paid out"], [c.tollsReceived.usdc, "USDC in tolls"]];
  return image(
    <Frame w={1920} h={1080}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: D, fontWeight: 600, fontSize: 44, letterSpacing: 3.5 }}>
        <Mark size={72} color={C.ink} />
        TALOS
      </div>
      <Words
        style={{ marginTop: 64, fontFamily: D, fontWeight: 500, fontSize: 100, lineHeight: "104px", letterSpacing: -1 }}
        parts={[["Built on Lattice ·"], ["Talos keeps running after Tameion", C.bronze]]}
      />
      <div style={{ marginTop: 64, display: "flex", flexWrap: "wrap", rowGap: 16, columnGap: 56, paddingTop: 28, borderTop: `1px solid ${C.rule}` }}>
        {stats.map(([v, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontFamily: D, fontWeight: 500, fontSize: 44 }}>{String(v)}</span>
            <span style={{ fontSize: 30, color: C.ink2 }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48 }}>
        <span style={{ fontSize: 28, lineHeight: "40px", color: C.ink2, maxWidth: 1000 }}>
          {`${network} (USDC gas) · Circle Modular Wallets · Facilitator Service · Gateway · built on Lattice`}
        </span>
        <span style={{ fontFamily: M, fontSize: 32, flexShrink: 0 }}>{HOST}</span>
      </div>
    </Frame>,
    { width: 1920, height: 1080 },
  );
}
