import { expect, test } from "bun:test";
import { bountyOf, openTotals, type MergedPr } from "./bounty";

const pr = (prLabels: string[], issues: [string, string[], string?][] = []): MergedPr => ({
  number: 7,
  url: "https://github.com/o/r/pull/7",
  mergedAt: "2026-10-17T00:00:00Z",
  author: { login: "alice" },
  labels: { nodes: prLabels.map((name) => ({ name })) },
  closingIssuesReferences: { nodes: issues.map(([url, l, r = "o/r"]) => ({ url, repository: { nameWithOwner: r }, labels: { nodes: l.map((name) => ({ name })) } })) },
});

test("bounty: PR label wins, issue label inherited, claim keyed on the source", () => {
  expect(bountyOf(pr(["bounty:4"], [["i/1", ["bounty:2"]]]), "O/R")).toMatchObject({ usdc: "4", ref: "https://github.com/o/r/pull/7" });
  expect(bountyOf(pr(["docs"], [["i/1", ["docs"]], ["i/2", ["bounty:2.5"]]]), "O/R")).toMatchObject({ usdc: "2.5", ref: "i/2", author: "alice" });
  expect(bountyOf(pr(["bounty:x", "bounty:"], [["i/1", ["bounty:-1", "xbounty:3"]]]), "o/r")).toBeNull();
  expect(bountyOf(pr([], [["x/1", ["bounty:9"], "attacker/repo"]]), "o/r")).toBeNull();
  expect(bountyOf({ ...pr(["bounty:1"]), author: null }, "o/r")).toBeNull();
});

test("open bounties: one bounty per issue, malformed labels ignored, 6-dp sum", () => {
  const l = (...names: string[]) => names.map((name) => ({ name }));
  expect(openTotals([l("bounty:2", "bounty:9"), l("docs"), l("bounty:0.1"), l("bounty:0.2"), l("bounty:x", "xbounty:3"), []])).toEqual({ count: 3, usdc: 2.3 });
  expect(openTotals([])).toEqual({ count: 0, usdc: 0 });
});
