import type { Page } from "@playwright/test";
import { CURRENT_TERMS_VERSION } from "../../src/app/services/consent-version";

export async function acceptCurrentTerms(page: Page): Promise<void> {
  await page.addInitScript((version) => {
    localStorage.setItem("acceptedVersion", version);
  }, CURRENT_TERMS_VERSION);
}
