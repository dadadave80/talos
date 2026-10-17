import { network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { Arena } from "./arena";
import { SiteFooter, SiteHeader } from "./site-header";

export const revalidate = 15;

export default async function Home() {
  const snap = await snapshot();
  return (
    <div className="relative mx-auto w-full max-w-[1280px] overflow-x-clip">
      <SiteHeader active="arena" />
      <Arena initial={snap} network={network} />
      <SiteFooter />
    </div>
  );
}
