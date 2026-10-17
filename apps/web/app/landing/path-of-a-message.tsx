"use client";

import { Flow, Node } from "./flow";

// "The path of a message": You → Talos decides → Arc (commit written first) → the contract gate → paid, refused or
// queued for the owner. One token plays the three outcomes in turn. Nodes are HTML cards; see ./flow.tsx.

type Props = {
  perTx: string; // most one message can take, from the vault
  cap: string; // rolling-day budget
  delayHours: number; // timelock on any change
  commitUrl: string | null; // a real commit tx
  payUrl: string | null; // a real settlement tx
  refuseUrl: string | null; // a real refusal receipt
};

const EDGES = [
  { from: "you", to: "talos" },
  { from: "talos", to: "arc" },
  { from: "arc", to: "gate" },
  { from: "gate", to: "paid" },
  { from: "gate", to: "refused" },
  { from: "gate", to: "queued" },
];
const RUNS = [
  { path: ["you", "talos", "arc", "gate", "paid"], light: "paid" },
  { path: ["you", "talos", "arc", "gate", "refused"], light: "refused" },
  { path: ["you", "talos", "arc", "gate", "queued"], light: "queued" },
];

export function PathOfAMessage(p: Props) {
  return (
    <Flow
      edges={EDGES}
      runs={RUNS}
      label={`The path of a message: you sign, Talos decides, the commit is written to Arc, then the contract gate caps it at ${p.perTx} USDC a message and ${p.cap} a rolling day; above the cap a human signs. Outcomes: paid, refused, or queued for the owner.`}
      className="grid grid-cols-1 gap-y-9 lg:grid-cols-[0.9fr_1.1fr_1.1fr_1.5fr_0.9fr] lg:items-center lg:gap-x-10"
    >
      <Node id="you" title="You" sub="a signed message" href="/arena" />
      <Node id="talos" title="Talos decides" sub="pay · queue · refuse" href="/policy#brain" />
      <Node id="arc" title="Arc" sub="commit written first" href={p.commitUrl} />
      <Node id="gate" title="Contract gate" href="/policy#caps" className="border-l-2 border-l-ink">
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs leading-4 text-ink-2">
          <li>cap {p.perTx} / message</li>
          <li>{p.cap} / rolling day</li>
          <li>above the cap, a human signs</li>
          <li>{p.delayHours} h timelock to change</li>
        </ul>
      </Node>
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-5">
        <Node id="queued" title="Queued" sub="owner signs" href="/policy#queue" tone="text-queue" />
        <Node id="paid" title="Paid" sub="inside the cap" href={p.payUrl} tone="text-pay" />
        <Node id="refused" title="Refused" sub="nothing moves" href={p.refuseUrl} tone="text-refuse" />
      </div>
    </Flow>
  );
}
