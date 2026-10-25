import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SupportPageComponent } from "./support-page.component";

describe("SupportPageComponent", () => {
  it("renders the external system status link", async () => {
    await TestBed.configureTestingModule({
      imports: [SupportPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: MetaTagService,
          useValue: { setStaticPageMetaTags: vi.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: {
            trackContactChannelClick: vi.fn(),
            trackOutboundLinkClick: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SupportPageComponent);
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector<HTMLAnchorElement>(
      'a[href="https://status.pkspot.app"]',
    );

    expect(link).not.toBeNull();
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.textContent).toContain("System status");
  });
});
