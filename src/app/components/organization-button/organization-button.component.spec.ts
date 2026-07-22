import { APP_BASE_HREF } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { OrganizationButtonComponent } from "./organization-button.component";

describe("OrganizationButtonComponent", () => {
  it("links the organization name and logo inside the localized app", () => {
    TestBed.configureTestingModule({
      imports: [OrganizationButtonComponent],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: "/en/" },
        {
          provide: OrganizationsService,
          useValue: { getOrganizationById: () => Promise.resolve(null) },
        },
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

  it("loads the logo from the organization document when the event reference is stale", async () => {
    TestBed.configureTestingModule({
      imports: [OrganizationButtonComponent],
      providers: [
        provideRouter([]),
        {
          provide: OrganizationsService,
          useValue: {
            getOrganizationById: () =>
              Promise.resolve({
                id: "org-1",
                name: "World's Parkour Family",
                slug: "worlds-parkour-family",
                logo_url: "https://example.com/current-logo.png",
                active: true,
              }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(OrganizationButtonComponent);
    fixture.componentRef.setInput("organization", {
      id: "org-1",
      name: "World's Parkour Family",
      slug: "worlds-parkour-family",
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const image = fixture.debugElement.query(By.css("img"))
      .nativeElement as HTMLImageElement;

    expect(image.getAttribute("src")).toBe(
      "https://example.com/current-logo.png",
    );
  });
});
