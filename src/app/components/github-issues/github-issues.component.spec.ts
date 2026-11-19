import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { GitHubIssuesComponent } from "./github-issues.component";
import { GITHUB_ISSUES_API_URL, parseGitHubIssues } from "./github-issues";

const issue = (number: number, labels: string[], extra: Record<string, unknown> = {}) => ({
  number,
  title: `Issue ${number}`,
  html_url: `https://github.com/lukasbuehler/pkspot/issues/${number}`,
  comments: 0,
  labels: labels.map((name) => ({ name })),
  ...extra,
});

const RESPONSE = [
  issue(1, ["bug"], { comments: 3 }),
  issue(2, ["enhancement", "good first issue"], { comments: 1 }),
  issue(3, ["question"]),
  issue(4, ["bug", "wontfix"]),
  issue(5, [], { pull_request: {}, html_url: "https://github.com/lukasbuehler/pkspot/pull/5" }),
  ...Array.from({ length: 6 }, (_, index) => issue(10 + index, ["enhancement"])),
];

describe("parseGitHubIssues", () => {
  it("keeps open issues, drops pull requests, hidden labels and malformed items", () => {
    const parsed = parseGitHubIssues([...RESPONSE, null, { number: "x" }, issue(99, [], { html_url: "https://evil.example/99" })]);

    expect(parsed.map((item) => item.number)).toEqual([1, 2, 3, 10, 11, 12, 13, 14, 15]);
    expect(parsed[0]).toEqual({
      number: 1,
      title: "Issue 1",
      url: "https://github.com/lukasbuehler/pkspot/issues/1",
      kind: "bug",
      goodFirstIssue: false,
      comments: 3,
    });
    expect(parsed[1]).toMatchObject({ kind: "feature", goodFirstIssue: true });
    expect(parsed[2]).toMatchObject({ kind: "other" });
    expect(parseGitHubIssues({ message: "API rate limit exceeded" })).toEqual([]);
  });
});

describe("GitHubIssuesComponent", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  async function render(fetchMock: ReturnType<typeof vi.fn>, platform = "browser") {
    vi.stubGlobal("fetch", fetchMock);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AnalyticsService, useValue: { trackOutboundLinkClick: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(GitHubIssuesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it("lists the first issues, filters by label and caches the result for the session", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(RESPONSE), { status: 200 }));
    const { fixture, element } = await render(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(GITHUB_ISSUES_API_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(element.querySelectorAll(".github-issues__issue").length).toBe(6);
    expect(element.textContent).toContain("See 3 more on GitHub");
    expect(element.querySelector(".github-issues__issue")?.textContent).toContain("#1 · Bug · 3 comments");
    expect([...element.querySelectorAll("mat-chip-option")].map((chip) => chip.textContent?.trim())).toEqual([
      "All (9)",
      "Bugs (1)",
      "Feature requests (7)",
      "Good first issues (1)",
    ]);

    (element.querySelectorAll("mat-chip-option")[3].querySelector("button") as HTMLElement).click();
    fixture.detectChanges();
    const rows = element.querySelectorAll(".github-issues__issue");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("#2 · Feature request · Good first issue · 1 comment");
    expect(element.textContent).toContain("See all on GitHub");

    expect(JSON.parse(sessionStorage.getItem("pkspot.githubIssues.v1") ?? "{}").issues).toHaveLength(9);
  });

  it("uses the session cache instead of calling GitHub again", async () => {
    sessionStorage.setItem(
      "pkspot.githubIssues.v1",
      JSON.stringify({ at: Date.now(), issues: parseGitHubIssues([issue(7, ["bug"])]) }),
    );
    const fetchMock = vi.fn();
    const { element } = await render(fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.querySelectorAll(".github-issues__issue").length).toBe(1);
  });

  it("falls back to the GitHub link when the API fails", async () => {
    const { element } = await render(vi.fn(async () => new Response("{}", { status: 403 })));

    expect(element.textContent).toContain("could not be loaded");
    expect(element.querySelector(".github-issues__issue")).toBeNull();
    expect(element.querySelector('a[href="https://github.com/lukasbuehler/pkspot/issues"]')).not.toBeNull();
  });

  it("does not call GitHub during the server render", async () => {
    const fetchMock = vi.fn();
    const { element } = await render(fetchMock, "server");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.querySelector('a[href="https://github.com/lukasbuehler/pkspot/issues"]')).not.toBeNull();
  });
});
