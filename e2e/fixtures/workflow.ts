import { expect, type Locator, type Page } from "@playwright/test";
import { acceptCurrentTerms } from "./consent";

export type ShellMode = "rail" | "toolbar" | "menu";

export interface WorkflowViewport {
  name: string;
  width: number;
  height: number;
  shell: ShellMode;
}

export interface RouteCase {
  name: string;
  path: string;
  expectedPath?: RegExp;
  expectRendered?: boolean;
}

export const workflowLocale = "de";

export const workflowViewports: WorkflowViewport[] = [
  { name: "desktop", width: 1280, height: 900, shell: "rail" },
  { name: "tablet", width: 800, height: 900, shell: "toolbar" },
  { name: "mobile tall", width: 390, height: 844, shell: "toolbar" },
  {
    name: "mobile short portrait",
    width: 390,
    height: 680,
    shell: "menu",
  },
  { name: "landscape short", width: 844, height: 390, shell: "menu" },
  { name: "desktop short", width: 1024, height: 480, shell: "menu" },
  {
    name: "desktop just above short-height threshold",
    width: 1024,
    height: 501,
    shell: "rail",
  },
  {
    name: "mobile just above compact portrait threshold",
    width: 390,
    height: 700,
    shell: "toolbar",
  },
];

export async function gotoWorkflow(
  page: Page,
  path: string,
  viewport: WorkflowViewport = workflowViewports[0],
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await acceptCurrentTerms(page);

  await page.goto(localizedPath(path), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("app-root", { state: "attached", timeout: 20_000 });
  await page.waitForLoadState("load");
  await page.waitForTimeout(650);
}

export function localizedPath(path: string): string {
  return `/${workflowLocale}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function expectRoute(
  page: Page,
  expectedPath?: RegExp,
): Promise<void> {
  if (!expectedPath) return;

  await expect.poll(() => new URL(page.url()).pathname).toMatch(expectedPath);
}

export async function expectAppRendered(page: Page): Promise<void> {
  await expect(page.locator("app-root")).toBeAttached();
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length)
    .toBeGreaterThan(20);
}

export async function expectShell(
  page: Page,
  shell: ShellMode,
): Promise<void> {
  if (shell === "rail") {
    await expect(page.locator("app-nav-rail")).toBeVisible();
    await expect(page.locator("mat-toolbar")).not.toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    return;
  }

  if (shell === "toolbar") {
    await expect(page.locator("app-nav-rail")).not.toBeVisible();
    await expect(page.locator("mat-toolbar")).toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    return;
  }

  await expect(page.locator("app-nav-rail")).not.toBeVisible();
  await expect(page.locator("mat-toolbar")).not.toBeVisible();
  await expect(page.locator("#alainMenuButton")).toBeVisible();
}

export async function openCompactMenu(page: Page): Promise<void> {
  await page.locator("#alainMenuButton").click();
  await expect(
    page.locator(".cdk-overlay-container .mat-mdc-menu-panel"),
  ).toBeVisible();
}

export async function expectSelectedQuickFilter(
  page: Page,
  index: number,
): Promise<void> {
  const chip = page
    .locator("app-filter-chips-bar")
    .first()
    .locator("mat-chip-listbox")
    .first()
    .locator("mat-chip-option")
    .nth(index);

  await expectChipMarkedSelected(chip);
}

export async function expectChipMarkedSelected(chip: Locator): Promise<void> {
  await expect(chip).toHaveClass(
    /(?:mat-mdc-chip-selected|mdc-evolution-chip--selected|mdc-evolution-chip--selecting)/u,
  );
}

export async function clickQuickFilter(
  page: Page,
  index: number,
): Promise<void> {
  const quickFilterList = page
    .locator("app-filter-chips-bar")
    .first()
    .locator("mat-chip-listbox")
    .first();
  await expect(quickFilterList).toBeVisible({ timeout: 15_000 });
  await quickFilterList.locator("mat-chip-option").nth(index).click();
}

export async function clickLocatorCenter(
  page: Page,
  locator: Locator,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
