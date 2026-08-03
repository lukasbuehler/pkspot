import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { EventDraftNoticeComponent } from "./event-draft-notice.component";

describe("EventDraftNoticeComponent", () => {
  it("clearly identifies an unpublished event", async () => {
    const fixture = TestBed.createComponent(EventDraftNoticeComponent);

    await fixture.whenStable();

    const notice = fixture.nativeElement.querySelector(".draft-notice");
    expect(notice.getAttribute("aria-label")).toBe("Draft event");
    expect(notice.textContent).toContain("Draft");
    expect(notice.textContent).toContain("not public");
  });
});
