import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readStyles = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("Spot upcoming-event card layout", () => {
  it("allows cards and their text to shrink within the Spot panel", () => {
    const cardStyles = readStyles(
      "src/app/components/event-card/event-card.component.scss",
    );
    const spotStyles = readStyles(
      "src/app/components/spot-details/spot-details.component.scss",
    );

    expect(cardStyles).toMatch(/:host\s*\{[^}]*min-width:\s*0;/su);
    expect(cardStyles).toMatch(
      /\.mat-mdc-card-header-text\s*\{[^}]*min-width:\s*0;/su,
    );
    expect(spotStyles).toMatch(
      /\.spot-event-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/su,
    );
  });
});
