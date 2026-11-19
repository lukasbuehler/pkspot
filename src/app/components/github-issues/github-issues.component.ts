import { isPlatformBrowser } from "@angular/common";
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, resource, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AnalyticsService } from "../../services/analytics.service";
import { GITHUB_ISSUES_API_URL, GITHUB_REPO_URL, GitHubIssue, GitHubIssueKind, parseGitHubIssues } from "./github-issues";

type IssueFilter = "all" | "bug" | "feature" | "good_first";

const CACHE_KEY = "pkspot.githubIssues.v1";
const CACHE_MS = 10 * 60 * 1000;
/** The page shows a short list; the rest is one click away on GitHub. */
const VISIBLE_LIMIT = 6;

const KIND_ICON: Record<GitHubIssueKind, string> = { bug: "bug_report", feature: "lightbulb", other: "forum" };

function isCachedIssue(value: unknown): value is GitHubIssue {
  const issue = value as Partial<GitHubIssue> | null;
  return (
    typeof issue?.number === "number" &&
    typeof issue.title === "string" &&
    typeof issue.url === "string" &&
    issue.url.startsWith(`${GITHUB_REPO_URL}/issues/`) &&
    (issue.kind === "bug" || issue.kind === "feature" || issue.kind === "other") &&
    typeof issue.goodFirstIssue === "boolean" &&
    typeof issue.comments === "number"
  );
}

function readCache(): GitHubIssue[] | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { at?: unknown; issues?: unknown } | null;
    if (typeof cached?.at !== "number" || Date.now() - cached.at > CACHE_MS) return null;
    return Array.isArray(cached.issues) && cached.issues.every(isCachedIssue) ? cached.issues : null;
  } catch {
    return null;
  }
}

function writeCache(issues: GitHubIssue[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), issues }));
  } catch {
    // Storage can be blocked; the list still shows, it just loads again next time.
  }
}

/**
 * Open GitHub issues, read straight from GitHub's public API in the browser.
 * No backend sync: the server render shows the loading state, and if GitHub
 * is unreachable or rate-limited, the section falls back to a plain link.
 */
@Component({
  selector: "app-github-issues",
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatProgressBarModule],
  templateUrl: "./github-issues.component.html",
  styleUrl: "./github-issues.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GitHubIssuesComponent {
  private readonly _analytics = inject(AnalyticsService);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly issuesUrl = `${GITHUB_REPO_URL}/issues`;

  protected readonly issues = resource({
    params: () => (this._isBrowser ? true : undefined),
    loader: async ({ abortSignal }) => {
      const cached = readCache();
      if (cached) return cached;
      const response = await fetch(GITHUB_ISSUES_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
        signal: abortSignal,
      });
      if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
      const issues = parseGitHubIssues(await response.json());
      writeCache(issues);
      return issues;
    },
  });

  protected readonly filter = signal<IssueFilter>("all");

  private readonly _loaded = computed(() => (this.issues.hasValue() ? this.issues.value() : []));

  protected readonly filters = computed(() => {
    const issues = this._loaded();
    const all: { id: IssueFilter; label: string; count: number }[] = [
      { id: "all", label: $localize`:@@githubIssues.filter.all:All`, count: issues.length },
      { id: "bug", label: $localize`:@@githubIssues.filter.bugs:Bugs`, count: issues.filter((i) => i.kind === "bug").length },
      {
        id: "feature",
        label: $localize`:@@githubIssues.filter.features:Feature requests`,
        count: issues.filter((i) => i.kind === "feature").length,
      },
      {
        id: "good_first",
        label: $localize`:@@githubIssues.filter.goodFirst:Good first issues`,
        count: issues.filter((i) => i.goodFirstIssue).length,
      },
    ];
    return all.filter((item) => item.id === "all" || item.count > 0);
  });

  private readonly _filtered = computed(() => {
    const filter = this.filter();
    const issues = this._loaded();
    if (filter === "all") return issues;
    if (filter === "good_first") return issues.filter((issue) => issue.goodFirstIssue);
    return issues.filter((issue) => issue.kind === filter);
  });

  protected readonly hiddenCount = computed(() => Math.max(0, this._filtered().length - VISIBLE_LIMIT));

  protected readonly rows = computed(() =>
    this._filtered()
      .slice(0, VISIBLE_LIMIT)
      .map((issue) => ({
        ...issue,
        icon: KIND_ICON[issue.kind],
        meta: [
          `#${issue.number}`,
          issue.kind === "bug"
            ? $localize`:@@githubIssues.kind.bug:Bug`
            : issue.kind === "feature"
              ? $localize`:@@githubIssues.kind.feature:Feature request`
              : null,
          issue.goodFirstIssue ? $localize`:@@githubIssues.goodFirst:Good first issue` : null,
          issue.comments === 1
            ? $localize`:@@githubIssues.comment:1 comment`
            : issue.comments > 1
              ? $localize`:@@githubIssues.comments:${issue.comments}:count: comments`
              : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
  );

  protected selectFilter(value: unknown): void {
    if (value === "all" || value === "bug" || value === "feature" || value === "good_first") this.filter.set(value);
  }

  protected track(linkType: string, url: string, label: string): void {
    this._analytics.trackOutboundLinkClick("contribute_page", linkType, url, label);
  }
}
