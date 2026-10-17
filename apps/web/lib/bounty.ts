// Which merged PRs carry a bounty. A maintainer labels the issue (`bounty:N`); the PR that closes it inherits the
// bounty, so nobody has to re-label PRs. A label on the PR itself wins. Labels need triage access on the repo, so the
// label is the authorisation; the PR author only chooses which issue they claim to close, and the maintainer merges.
// One payment per bounty: the claim key is the issue URL when the bounty came from an issue, so a second PR closing the
// same issue is a no-op.

type Label = { name: string };
export type MergedPr = {
  number: number;
  url: string;
  mergedAt: string;
  author: { login: string } | null;
  labels: { nodes: Label[] };
  closingIssuesReferences: { nodes: { url: string; labels: { nodes: Label[] } }[] };
};
export type Bounty = { number: number; url: string; author: string; usdc: string; ref: string };

const amount = (labels: Label[]) => labels.map((l) => /^bounty:(\d+(?:\.\d+)?)$/.exec(l.name)?.[1]).find(Boolean);

export function bountyOf(pr: MergedPr): Bounty | null {
  if (!pr.author) return null;
  const base = { number: pr.number, url: pr.url, author: pr.author.login };
  const own = amount(pr.labels.nodes);
  if (own) return { ...base, usdc: own, ref: pr.url };
  for (const issue of pr.closingIssuesReferences.nodes) {
    const inherited = amount(issue.labels.nodes);
    if (inherited) return { ...base, usdc: inherited, ref: issue.url };
  }
  return null;
}

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number url mergedAt author { login }
        labels(first: 20) { nodes { name } }
        closingIssuesReferences(first: 5) { nodes { url labels(first: 20) { nodes { name } } } }
      }
    }
  }
}`;

/// The 50 most recently updated merged PRs that carry a bounty, own or inherited. Read-only token; untrusted data.
export async function bountyPrs(repo: string): Promise<Bounty[]> {
  const [owner, name] = repo.split("/");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { owner, name } }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) throw new Error(`github ${res.status} ${JSON.stringify(body?.errors ?? "").slice(0, 200)}`);
  const prs: MergedPr[] = body.data.repository.pullRequests.nodes;
  return prs.map(bountyOf).filter((b): b is Bounty => b !== null);
}
