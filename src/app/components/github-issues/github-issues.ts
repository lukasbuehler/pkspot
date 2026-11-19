/** The public PK Spot repository. */
export const GITHUB_REPO_URL = "https://github.com/lukasbuehler/pkspot";

/**
 * Open issues and pull requests share this endpoint, so it asks for the most
 * the API allows in one page. Unauthenticated, GitHub allows 60 calls an hour
 * per visitor IP, which is why the result is cached for the session.
 */
export const GITHUB_ISSUES_API_URL =
  "https://api.github.com/repos/lukasbuehler/pkspot/issues?state=open&sort=updated&per_page=100";

export type GitHubIssueKind = "bug" | "feature" | "other";

export interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  kind: GitHubIssueKind;
  goodFirstIssue: boolean;
  comments: number;
}

/** Labels that mean an issue is not something to pick up. */
const HIDDEN_LABELS = new Set(["duplicate", "invalid", "wontfix"]);

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((label) => (typeof label === "string" ? label : (label as { name?: unknown } | null)?.name))
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.toLowerCase());
}

/**
 * Turns the GitHub REST response into the few fields the page shows. Pull
 * requests, hidden labels and anything malformed are dropped, so a changed
 * API shape shows fewer issues rather than breaking the page.
 */
export function parseGitHubIssues(json: unknown): GitHubIssue[] {
  if (!Array.isArray(json)) return [];
  const issues: GitHubIssue[] = [];
  for (const item of json as Record<string, unknown>[]) {
    if (!item || typeof item !== "object" || "pull_request" in item) continue;
    const { number, title, html_url: url, comments } = item;
    if (typeof number !== "number" || typeof title !== "string" || typeof url !== "string") continue;
    if (!url.startsWith(`${GITHUB_REPO_URL}/issues/`)) continue;
    const labels = labelNames(item["labels"]);
    if (labels.some((label) => HIDDEN_LABELS.has(label))) continue;
    issues.push({
      number,
      title,
      url,
      kind: labels.includes("bug") ? "bug" : labels.includes("enhancement") ? "feature" : "other",
      goodFirstIssue: labels.includes("good first issue"),
      comments: typeof comments === "number" ? comments : 0,
    });
  }
  return issues;
}
