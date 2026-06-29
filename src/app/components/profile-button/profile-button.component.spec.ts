import { APP_BASE_HREF } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";

import { AuthenticationService } from "../../services/firebase/authentication.service";
import { ProfileButtonComponent } from "./profile-button.component";

describe("ProfileButtonComponent", () => {
  it("keeps profile navigation inside the app under a localized base href", () => {
    TestBed.configureTestingModule({
      imports: [ProfileButtonComponent],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: "/en/" },
        {
          provide: AuthenticationService,
          useValue: {
            user: {
              data: {
                data: {
                  blocked_users: [],
                },
              },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(ProfileButtonComponent);
    fixture.componentRef.setInput("user", {
      uid: "user-1",
      display_name: "Avery",
    });
    fixture.detectChanges();

    const anchor = fixture.debugElement.query(By.css("a")).nativeElement as
      | HTMLAnchorElement
      | undefined;

    expect(anchor).toBeDefined();
    expect(anchor?.getAttribute("target")).toBeNull();
    expect(anchor?.getAttribute("href")).toBe("/en/u/user-1");
    expect(anchor?.getAttribute("href")).not.toContain("/en/en/");
  });
});
