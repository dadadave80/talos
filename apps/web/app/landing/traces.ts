import { publicClient, vault, vaultAbi } from "@/lib/chain";
import { db } from "@/lib/db";
import { receipt, type Receipt } from "@/lib/share";

/// Two real team-test attempts (the 0.10 USDC PAY and the SYSTEM OVERRIDE REFUSE), traced from the message to the money.
/// The commit txs are only lookup keys; every word and number shown is read from the attempts row, the mirrored events
/// and the vault. Feeds the landing page's diagrams.
const PAY_COMMIT = "0xc41e3c68a61935b0263661d1532d267ce1e28795296a7e748db60ef7cbe0784f";
const REFUSE_COMMIT = "0x1ad955e136776bfa75ec771421562c9f0a057ea24e13991145b5d95617921e88";
export const TIERS = ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] as const;


const readParams = () => publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" });

export type Traced = Receipt & { decisionHash: string | null; tier: string | null; prompt: string | null };

export async function loadTraces() {
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
