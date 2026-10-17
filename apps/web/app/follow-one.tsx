import Link from "next/link";
import { formatUnits } from "viem";
import { explorer, publicClient, vault, vaultAbi } from "@/lib/chain";
import { db } from "@/lib/db";
import { excerpt, receipt, type Receipt } from "@/lib/share";
import { FollowOneSwitch } from "./follow-one-switch";

// "Follow one verdict": two real team-test attempts, traced from the message to the money. The commit txs are only
// lookup keys; every word and number shown is read from the attempts row, the mirrored events and the vault.
const PAY_COMMIT = "0xc41e3c68a61935b0263661d1532d267ce1e28795296a7e748db60ef7cbe0784f";
const REFUSE_COMMIT = "0x1ad955e136776bfa75ec771421562c9f0a057ea24e13991145b5d95617921e88";
const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;

type Traced = Receipt & { decisionHash: string | null; tier: string | null; prompt: string | null };
type Params = Awaited<ReturnType<typeof readParams>>;

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const f2 = (n: bigint) => Number(formatUnits(n, 6)).toFixed(2);
const tx = (h: string) => `${explorer}/tx/${h}`;
const at = (n: number | null) => (n ? `block ${n.toLocaleString("en-US")} · ` : "");
const readParams = () => publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" });

async function load() {
  const { data } = await db()
    .from("attempts")
    .select("id,commit_tx,decision_hash,tier_requested,prompt_version")
    .in("commit_tx", [PAY_COMMIT, REFUSE_COMMIT]);
  const one = async (commit: string): Promise<Traced | null> => {
    const row = data?.find((d) => d.commit_tx === commit);
    const r = row ? await receipt(row.id) : null;
    // The framing below is true only of these team rows; anything else renders nothing.
    if (!row || !r || r.wallet_label !== "team" || !r.commit_tx) return null;
    return { ...r, decisionHash: row.decision_hash ?? null, tier: row.tier_requested ?? null, prompt: row.prompt_version ?? null };
  };
  const [pay, refuse, params] = await Promise.all([one(PAY_COMMIT), one(REFUSE_COMMIT), readParams()]);
  return {
    pay: pay?.verdict === "PAY" && pay.pay_tx && !pay.note ? pay : null,
    refuse: refuse?.verdict === "REFUSE" ? refuse : null,
    params,
  };
}

export async function FollowOne() {
  const d = await load().catch(() => null);
  if (!d || (!d.pay && !d.refuse)) return null;
  const pay = d.pay && <PayTrace r={d.pay} p={d.params} />;
  const refuse = d.refuse && <RefuseTrace r={d.refuse} />;
  return (
    <section aria-labelledby="follow-one" className="flex flex-col gap-4 border-t border-ink pt-6">
      <h2 id="follow-one" className="smallcaps text-sm text-ink-2">Follow one verdict</h2>
      {pay && refuse ? <FollowOneSwitch pay={pay} refuse={refuse} /> : (pay ?? refuse)}
    </section>
  );
}

function PayTrace({ r, p }: { r: Traced; p: Params }) {
  const amount = Number(r.amount_usdc).toFixed(2);
  const tier = TIERS.indexOf(r.tier as (typeof TIERS)[number]);
  return (
    <Trace
      r={r}
      stamp={`Pay ${amount} USDC`}
      tone="text-pay border-pay"
      title="We fooled it ourselves with a fake bug report."
      lede={`The contract is why that cost ${amount} and not the vault.`}
      commitNote="On Arc before any money moved: pay() reverts without a matching commit."
      check={
        tier < 0 ? (
          <Station k="Contract">
            <span className="text-[15px]">pay() went through, so the amount was inside the vault&apos;s caps.</span>
          </Station>
        ) : (
          <Station
            k="Contract"
            note={`The vault's params() for the ${TIERS[tier].toLowerCase()} tier, read live. pay() reverts above either cap; over ${f2(p.perTxCap[tier])}, Talos queues for an owner instead.`}
          >
            <span className="font-mono text-[13px] tabular-nums text-ink">
              asked {amount} · cap {f2(p.perTxCap[tier])} per message · {f2(p.dailyCap[tier])} per rolling day
            </span>
          </Station>
        )
      }
      settle={
        <Station k="Settle" note="Team test · not counted. It went to our own test wallet.">
          <ExplorerLink hash={r.pay_tx!} text={`paid ${amount} USDC → ${short(r.wallet)} · ${at(r.pay_block)}${short(r.pay_tx!)}`} what="Payment" />
        </Station>
      }
    />
  );
}

function RefuseTrace({ r }: { r: Traced }) {
  return (
    <Trace
      r={r}
      stamp="Refuse"
      tone="text-refuse border-refuse"
      title="A refusal goes on the record too."
      lede="The verdict is committed to Arc first, then nothing moves."
      commitNote="Committed to Arc like every verdict, paid or not."
      check={
        <Station k="Contract" note="A refusal calls commit() and stops. No pay(), so there was nothing to cap.">
          <span className="text-[15px] text-ink-2">Not reached</span>
        </Station>
      }
      settle={
        <Station k="Settle">
          <span className="text-[15px] text-ink">No money moved.</span>
        </Station>
      }
    />
  );
}

function Trace(t: { r: Traced; stamp: string; tone: string; title: string; lede: string; commitNote: string; check: React.ReactNode; settle: React.ReactNode }) {
  const { r } = t;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`smallcaps inline-flex items-center border px-2 py-0.5 text-[15px] ${t.tone}`}>{t.stamp}</span>
        <span className="smallcaps text-sm text-ink-3">team test · not counted</span>
        <span className="ml-auto font-mono text-xs text-ink-3">{new Date(r.ts).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-[28px] font-medium leading-8 text-balance">{t.title}</h3>
        <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">{t.lede}</p>
      </div>
      <ol className="flex flex-col border-b border-rule">
        <Station k="Message" note={`Signed by ${short(r.wallet)}, a team wallet.`}>
          {r.message_excerpt ? (
            <p className="max-w-[60ch] border-l border-ink-3 pl-4 text-[17px] leading-7 text-pretty">“{excerpt(r.message_excerpt)}”</p>
          ) : (
            <span className="text-[15px] text-ink-3">Message not stored.</span>
          )}
        </Station>
        <Station
          k="Reason"
          note={
            <span className="font-mono text-xs text-ink-3">
              {r.model ? `model ${r.model}` : "model not recorded"}
              {r.prompt && (
                <>
                  {" · "}
                  <Link href="/policy#brain" className="inline-flex min-h-11 items-center text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink lg:min-h-0">
                    prompt {r.prompt}
                  </Link>
                </>
              )}
            </span>
          }
        >
          <p className="max-w-[60ch] text-[15px] leading-[22px] text-ink text-pretty">{r.reason}</p>
        </Station>
        <Station k="Commit" note={t.commitNote}>
          {r.decisionHash && <span className="font-mono text-[13px] text-ink-2">decision hash {short(r.decisionHash)}</span>}
          <ExplorerLink hash={r.commit_tx!} text={`${at(r.commit_block)}${short(r.commit_tx!)}`} what="Commit" />
        </Station>
        {t.check}
        {t.settle}
      </ol>
      <Link href={`/v/${r.id}`} className="inline-flex min-h-11 items-center self-start text-sm font-medium lg:min-h-10">
        Open the full receipt · attempt {r.index} →
      </Link>
    </div>
  );
}

// One station: the label above the body on phone, beside it from sm up.
function Station({ k, note, children }: { k: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-rule py-3 sm:grid-cols-[72px_minmax(0,1fr)]">
      <span className="smallcaps text-sm text-ink-3 sm:pt-0.5">{k}</span>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {children}
        {note && <span className="max-w-[60ch] text-[13px] leading-5 text-ink-2">{note}</span>}
      </div>
    </li>
  );
}

function ExplorerLink({ hash, text, what }: { hash: string; text: string; what: string }) {
  return (
    <a href={tx(hash)} className="inline-flex min-h-11 items-center font-mono text-[13px] tabular-nums break-words lg:min-h-0">
      <span>
        {text} <span aria-hidden="true">↗</span>
        <span className="sr-only"> ({what} transaction on the Arc explorer)</span>
      </span>
    </a>
  );
}
