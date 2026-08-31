import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SupportShopService } from "../../services/support-shop.service";
import { ShopItemPageComponent } from "./shop-item-page.component";

describe("ShopItemPageComponent", () => {
  let component: ShopItemPageComponent;
  let fixture: ComponentFixture<ShopItemPageComponent>;
  const metaTagService = { setStaticPageMetaTags: vi.fn() };

  beforeEach(async () => {
    metaTagService.setStaticPageMetaTags.mockReset();
    await TestBed.configureTestingModule({
      imports: [ShopItemPageComponent],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
        { provide: SupportShopService, useValue: { createCheckout: vi.fn() } },
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
});
