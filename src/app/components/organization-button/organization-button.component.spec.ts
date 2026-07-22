import { APP_BASE_HREF } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

import { OrganizationButtonComponent } from "./organization-button.component";

describe("OrganizationButtonComponent", () => {
  it("links the organization name and logo inside the localized app", () => {
    TestBed.configureTestingModule({
      imports: [OrganizationButtonComponent],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: "/en/" },
      ],
    });
    const fixture = TestBed.createComponent(OrganizationButtonComponent);
    fixture.componentRef.setInput("organization", {
      id: "org-1",
      name: "City Movement",
      slug: "city-movement",
      logo_url: "https://example.com/logo.png",
    });
    fixture.detectChanges();

    const anchor = fixture.debugElement.query(By.css("a"))
      .nativeElement as HTMLAnchorElement;
    const image = fixture.debugElement.query(By.css("img"))
      .nativeElement as HTMLImageElement;

    expect(anchor.getAttribute("href")).toBe("/en/organizations/city-movement");
    expect(anchor.textContent).toContain("City Movement");
    expect(image.getAttribute("src")).toBe("https://example.com/logo.png");
  });
});
