import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { SpotRankIconComponent } from "./spot-rank-icon.component";

describe("SpotRankIconComponent", () => {
  it.each([
    [1, "trophy", "is-gold"],
    [2, "military_tech", "is-silver"],
    [3, "military_tech", "is-bronze"],
    [7, "leaderboard", null],
  ])("shows rank %i as %s", (rank, icon, tone) => {
    const fixture = TestBed.createComponent(SpotRankIconComponent);
    fixture.componentRef.setInput("rank", rank);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector("mat-icon") as HTMLElement;
    expect(element.textContent?.trim()).toBe(icon);
    if (tone) expect(element.classList).toContain(tone);
  });
});
