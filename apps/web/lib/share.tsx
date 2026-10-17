import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { arc } from "viem/chains";
import { chain } from "./chain";
import { db } from "./db";
import { evidence, relabel } from "./ledger/evidence";

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
/// The stored excerpt is the message's first 80 characters: end on a sentence in the last 30 when one is there, else
/// drop the cut word.
export const excerpt = (s: string) =>
  s.length < 80 ? s : (s.match(/^([\s\S]{50,}[.!?]["'”’)\]]*)\s/)?.[1] ?? `${s.replace(/\s+\S*$/, "")}…`);
const firstSentence = (s: string) => {
  const t = s.replace(/\s*\[contract:[^\]]*\]/, "").split(/(?<=[.!?])\s/)[0];
  return t.length > 160 ? `${t.slice(0, 159).replace(/\s+\S*$/, "")}…` : t;
};

/// S1: the site's OG image with live external counters. Taken = DISCRETIONARY paid to external wallets.
export async function ogImage(size: { width: number; height: number }) {
  // A rate-limited RPC (the build prerenders this) leaves the counters off rather than failing the image.
  const e = await evidence().catch(() => null);
  const taken = e?.counters.payments.find((p) => p.tier === "DISCRETIONARY")?.external.usdc ?? "0";
  const counters = e ? [["Attempts", e.counters.attempts], ["Refused", e.counters.refusals], ["Taken", `${taken} USDC`]] : [];
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
  id: string; ts: string; wallet: string; wallet_label: string; verdict: "PAY" | "QUEUE" | "REFUSE"; reason: string;
  message_excerpt: string | null; amount_usdc: number | null; commit_tx: string | null; pay_tx: string | null;
  note: string | null; model: string | null; index: number; commit_block: number | null; pay_block: number | null;
};

/// Block numbers for a receipt's commit and pay txs, from the mirrored diamond events.
async function withBlocks<T extends { commit_tx: string | null; pay_tx: string | null }>(rows: T[]) {
  const txs = rows.flatMap((r) => [r.commit_tx, r.pay_tx]).filter((t): t is string => !!t);
  const { data } = txs.length ? await db().from("chain_events").select("tx_hash,block").in("tx_hash", txs) : { data: [] };
  const block = new Map((data ?? []).map((e) => [e.tx_hash, Number(e.block)]));
  return rows.map((r) => ({ ...r, commit_block: (r.commit_tx && block.get(r.commit_tx)) || null, pay_block: (r.pay_tx && block.get(r.pay_tx)) || null }));
}
const COLS = "id,ts,wallet,wallet_label,verdict,reason,message_excerpt,amount_usdc,commit_tx,pay_tx,note,model";

/// One committed attempt, numbered by its position in the attempts log. Null if missing or never decided. Labelled as
/// on /evidence: a wallet added to TEAM_WALLETS after it played is a team test here too.
export async function receipt(id: string): Promise<Receipt | null> {
  const sb = db();
  const { data } = await sb
    .from("attempts")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (!data?.verdict) return null;
  const { count } = await sb.from("attempts").select("id", { count: "exact", head: true }).lte("ts", data.ts);
  const [withB] = await withBlocks([relabel(data as unknown as Receipt)]);
  return { ...withB, index: count ?? 0 } as Receipt;
}

/// A wallet's decided attempts, newest first, each numbered like its receipt.
export async function receiptsFor(wallet: string, limit = 10): Promise<Receipt[]> {
  const sb = db();
  const { data } = await sb.from("attempts").select(COLS).eq("wallet", wallet.toLowerCase()).not("verdict", "is", null).order("ts", { ascending: false }).limit(limit);
  const rows = await Promise.all(
    (data ?? []).map(async (r) => {
      const { count } = await sb.from("attempts").select("id", { count: "exact", head: true }).lte("ts", r.ts);
      return { ...relabel(r as unknown as Receipt), index: count ?? 0 };
    }),
  );
  return withBlocks(rows);
}

/// Free attempts left today. The route bumps the counter before checking, so n can exceed the limit.
export async function freeLeft(wallet: string, limit: number) {
  const { data } = await db()
    .from("counters")
    .select("n")
    .eq("wallet", wallet.toLowerCase())
    .eq("kind", "free")
    .eq("day", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  return Math.max(0, limit - (data?.n ?? 0));
}

/// S2/S3: the receipt card. Team rows never get the "I took…" boast: they say so in the header instead.
export async function receiptImage(r: Receipt, size: { width: number; height: number }) {
  const team = r.wallet_label !== "external";
  const amount = r.amount_usdc != null ? Number(r.amount_usdc).toFixed(2) : null;
  const stamp =
    r.verdict === "PAY" ? { c: C.pay, t: amount ? `PAY ${amount} USDC` : "PAY" }
    : r.verdict === "QUEUE" ? { c: C.queue, t: amount ? `QUEUED ${amount} USDC` : "QUEUED" }
    : { c: C.refuse, t: "TALOS REFUSED" };
  const boast = r.verdict === "PAY" && r.pay_tx && !r.note && !team && amount;
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
              <span style={{ fontFamily: D, fontWeight: 500, fontSize: 40, lineHeight: "48px" }}>{`“${excerpt(r.message_excerpt)}”`}</span>
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
          {`${network} (USDC gas) · built on Lattice · live: Circle Modular Wallets passkeys, Gateway + x402 · not built: Facilitator Service`}
        </span>
        <span style={{ fontFamily: M, fontSize: 32, flexShrink: 0 }}>{HOST}</span>
      </div>
    </Frame>,
    { width: 1920, height: 1080 },
  );
}
