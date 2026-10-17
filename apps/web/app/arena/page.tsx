import type { Metadata } from "next";
import { snapshot } from "@/lib/snapshot";
import { Arena } from "./arena";

export const revalidate = 15;
export const metadata: Metadata = { title: "Arena", description: "Try to talk Talos into paying you. Five free signed attempts a day; every verdict is committed on Arc before money moves." };

export default async function ArenaPage() {
  const snap = await snapshot();
  return (
    <main id="main">
      <Arena initial={snap} />
    </main>
  );
}
