import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { Mat3NavButtonComponent } from "./mat3-nav-button.component";

describe("Mat3NavButtonComponent", () => {
  it("renders an accessible live indicator", async () => {
    const fixture = TestBed.createComponent(Mat3NavButtonComponent);
    fixture.componentRef.setInput("label", "Events");
    fixture.componentRef.setInput("liveIndicator", true);

    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toContain("live event underway");
    expect(fixture.nativeElement.querySelector(".live-indicator")).not.toBeNull();
  });
});
