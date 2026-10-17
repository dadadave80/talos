import { network } from "@/lib/share";
import { snapshot } from "@/lib/snapshot";
import { Arena } from "./arena";
import { FollowOne } from "./follow-one";

export const revalidate = 15;

export default async function Home() {
  const snap = await snapshot();
  return (
    <main id="main">
      <Arena initial={snap} network={network} followOne={<FollowOne />} />
    </main>
  );
}
