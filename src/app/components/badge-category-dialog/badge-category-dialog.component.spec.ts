import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { describe, expect, it } from "vitest";
import type { UserSchema } from "../../../db/schemas/UserSchema";
import { BadgeService } from "../../services/badge.service";
import { BadgeCategoryDialogComponent } from "./badge-category-dialog.component";

function render(user: UserSchema, categoryId: string) {
  const progress = new BadgeService().getCategoryProgress(user, categoryId)!;
  TestBed.configureTestingModule({
    providers: [{ provide: MAT_DIALOG_DATA, useValue: { progress } }],
  });
  const fixture = TestBed.createComponent(BadgeCategoryDialogComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("BadgeCategoryDialogComponent", () => {
  it("shows earned stickers, silhouettes for missing levels and the next goal", () => {
    const element = render({ spot_creates_count: 37 } as UserSchema, "spots_created");

    expect(element.querySelectorAll(".level")).toHaveLength(5);
    expect(element.querySelectorAll("img.level__sticker")).toHaveLength(3);
    expect(element.querySelectorAll(".level__sticker.silhouette")).toHaveLength(2);
    expect(element.querySelector("mat-progress-bar")).not.toBeNull();

    const text = element.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("37 Spots");
    expect(text).toContain("13 more to reach Explorer");
    expect(text).toContain("37 / 50");
    expect(text).toContain("1 Spot");
  });

  it("shows the member number instead of progress for early adopters", () => {
    const element = render({ signup_number: 42 } as UserSchema, "early_adopter");

    expect(element.querySelector("mat-progress-bar")).toBeNull();
    expect(element.textContent).toContain("Member #42");
    expect(element.querySelectorAll("img.level__sticker")).toHaveLength(5);
  });
});
