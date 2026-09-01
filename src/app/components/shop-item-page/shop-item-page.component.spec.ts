import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findShopItem } from "../../features/shop-catalog";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SupportShopService } from "../../services/support-shop.service";
import { ShopItemPageComponent } from "./shop-item-page.component";

describe("ShopItemPageComponent", () => {
  let component: ShopItemPageComponent;
  let fixture: ComponentFixture<ShopItemPageComponent>;
  const metaTagService = { setStaticPageMetaTags: vi.fn() };
  const supportShopService = { createCheckout: vi.fn() };

  beforeEach(async () => {
    metaTagService.setStaticPageMetaTags.mockReset();
    supportShopService.createCheckout.mockReset();
    await TestBed.configureTestingModule({
      imports: [ShopItemPageComponent],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
        { provide: SupportShopService, useValue: supportShopService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ itemId: "nice-sticker-support-pack" }),
              queryParamMap: convertToParamMap({ checkout: "success" }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopItemPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("selects a sticker pack and keeps payment confirmation webhook-owned", async () => {
    expect(component.item()?.id).toBe("nice-sticker-support-pack");
    expect(component.item()?.image).toEqual({
      src: "assets/shop/nice-spot-sticker.png",
      alt: "Nice spot. sticker",
    });
    expect(component.checkoutState()).toBe("success");

    expect(
      [...fixture.nativeElement.querySelectorAll(".shop-item-page__pack-option")].map(
        (option: HTMLButtonElement) => option.getAttribute("aria-label"),
      ),
    ).toEqual([
      "5 stickers, CHF 12.00",
      "10 stickers, CHF 20.00",
      "25 stickers, CHF 35.00",
      "50 stickers, CHF 65.00",
    ]);

    component.selectStickerPack("sticker-pack-huge");
    await fixture.whenStable();

    expect(component.selectedStickerPack().stickerCount).toBe(25);
    expect(fixture.nativeElement.textContent).toContain(
      "Stripe is securely confirming your payment",
    );
    expect(metaTagService.setStaticPageMetaTags).toHaveBeenCalledWith(
      "Nice Spot Sticker Support Pack | PK Spot Shop",
      expect.any(String),
      undefined,
      "/shop/item/nice-sticker-support-pack",
    );
  });

  it("always shows an optional nickname field for direct supporters", async () => {
    component.item.set(findShopItem("support-pkspot"));
    fixture.detectChanges();
    await fixture.whenStable();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain("Nickname (optional)");
    expect(content).toContain(
      "Add a nickname so we can thank you on the PK Spot supporters page.",
    );
    expect(fixture.nativeElement.querySelector("mat-checkbox")).toBeNull();
    expect(fixture.nativeElement.querySelector("mat-hint")).toBeNull();
  });

  it("uses a supplied nickname as the supporters-page opt-in", async () => {
    component.supportModel.update((model) => ({
      ...model,
      publicName: "  Mira  ",
    }));
    supportShopService.createCheckout.mockRejectedValueOnce(
      new Error("Checkout test failure"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await component.startDirectSupportCheckout();

      expect(supportShopService.createCheckout).toHaveBeenCalledWith({
        kind: "direct_support",
        amountChf: 10,
        supporterCredit: { optedIn: true, publicName: "Mira" },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
