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
  closingIssuesReferences: { nodes: { url: string; repository: { nameWithOwner: string }; labels: { nodes: Label[] } }[] };
};
export type Bounty = { number: number; url: string; author: string; usdc: string; ref: string };

const amount = (labels: Label[]) => labels.map((l) => /^bounty:(\d+(?:\.\d+)?)$/.exec(l.name)?.[1]).find(Boolean);

export function bountyOf(pr: MergedPr, repo: string): Bounty | null {
  if (!pr.author) return null;
  const base = { number: pr.number, url: pr.url, author: pr.author.login };
  const own = amount(pr.labels.nodes);
  if (own) return { ...base, usdc: own, ref: pr.url };
  for (const issue of pr.closingIssuesReferences.nodes) {
    // "Closes other/repo#1" is legal on GitHub; only issues in this repo, labelled by its maintainers, count.
    if (issue.repository.nameWithOwner.toLowerCase() !== repo.toLowerCase()) continue;
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
        closingIssuesReferences(first: 5) { nodes { url repository { nameWithOwner } labels(first: 20) { nodes { name } } } }
      }
    }
  }
}`;

async function gql(query: string, repo: string) {
  const [owner, name] = repo.split("/");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { owner, name } }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) throw new Error(`github ${res.status} ${JSON.stringify(body?.errors ?? "").slice(0, 200)}`);
  return body.data.repository;
}

/// The 50 most recently updated merged PRs that carry a bounty, own or inherited. Read-only token; untrusted data.
export async function bountyPrs(repo: string): Promise<Bounty[]> {
  const prs: MergedPr[] = (await gql(QUERY, repo)).pullRequests.nodes;
  return prs.map((pr) => bountyOf(pr, repo)).filter((b): b is Bounty => b !== null);
}

const OPEN = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100) { nodes { labels(first: 20) { nodes { name } } } }
  }
}`;

/// Open issues carrying a bounty label and what they add up to (first bounty label per issue, summed in 6-dp units).
export function openTotals(issues: Label[][]) {
  const amounts = issues.map(amount).filter((a): a is string => !!a);
  const micro = amounts.reduce((sum, a) => sum + Math.round(Number(a) * 1e6), 0);
  return { count: amounts.length, usdc: micro / 1e6 };
}

/// Open bounty issues in the repo (the `issues` connection excludes PRs), for the cycle heartbeat.
export async function openBounties(repo: string) {
  const issues: { labels: { nodes: Label[] } }[] = (await gql(OPEN, repo)).issues.nodes;
  return openTotals(issues.map((i) => i.labels.nodes));
}
