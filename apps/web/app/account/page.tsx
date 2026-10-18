import type { Metadata } from "next";
import { formatUnits } from "viem";
import { explorer, publicClient, Tier, vault, vaultAbi } from "@/lib/chain";
import { AccountPanel } from "./panel";

export const revalidate = 60;
export const metadata: Metadata = { title: "Account" };

const f2 = (n: bigint) => Number(formatUnits(n, 6)).toFixed(2);

/// /account: the shell is static; everything about the visitor is read on the device (app/account/panel.tsx). The
/// discretionary caps feed the receipts' "What Talos checked".
export default async function AccountPage() {
  const p = await publicClient.readContract({ address: vault(), abi: vaultAbi, functionName: "params" }).catch(() => null);
  return (
    <main id="main">
      <section className="flex flex-col gap-4 px-6 pb-8 pt-10 lg:px-20 lg:pt-16">
        <span className="smallcaps text-sm text-ink-3">Talos · Account</span>
        <h1 className="font-display text-4xl font-medium leading-[1.1] tracking-[-0.01em] lg:text-[56px] lg:leading-[60px]">Your account.</h1>
        <p className="max-w-[60ch] text-[17px] leading-7 text-ink-2">
          Your free attempts, your record, your passkeys and how to recover them. Nothing on this page moves money.
        </p>
      </section>
      <AccountPanel
        explorer={explorer}
        perTx={p ? f2(p.perTxCap[Tier.DISCRETIONARY]) : "—"}
        cap={p ? f2(p.dailyCap[Tier.DISCRETIONARY]) : "—"}
      />
    </main>
  );
}
