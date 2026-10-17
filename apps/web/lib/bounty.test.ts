import { expect, test } from "bun:test";
import { bountyOf, type MergedPr } from "./bounty";

const pr = (prLabels: string[], issues: [string, string[]][] = []): MergedPr => ({
  number: 7,
  url: "https://github.com/o/r/pull/7",
  mergedAt: "2026-10-17T00:00:00Z",
  author: { login: "alice" },
  labels: { nodes: prLabels.map((name) => ({ name })) },
  closingIssuesReferences: { nodes: issues.map(([url, l]) => ({ url, labels: { nodes: l.map((name) => ({ name })) } })) },
});

test("bounty: PR label wins, issue label inherited, claim keyed on the source", () => {
  expect(bountyOf(pr(["bounty:4"], [["i/1", ["bounty:2"]]]))).toMatchObject({ usdc: "4", ref: "https://github.com/o/r/pull/7" });
  expect(bountyOf(pr(["docs"], [["i/1", ["docs"]], ["i/2", ["bounty:2.5"]]]))).toMatchObject({ usdc: "2.5", ref: "i/2", author: "alice" });
  expect(bountyOf(pr(["bounty:x", "bounty:"], [["i/1", ["bounty:-1", "xbounty:3"]]]))).toBeNull();
  expect(bountyOf({ ...pr(["bounty:1"]), author: null })).toBeNull();
});
