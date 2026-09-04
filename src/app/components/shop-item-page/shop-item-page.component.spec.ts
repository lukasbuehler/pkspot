import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findShopItem } from "../../features/shop-catalog";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ShopCartService } from "../../services/shop-cart.service";
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
        provideRouter([
          { path: "shop/cart", component: ShopItemPageComponent },
        ]),
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
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

  it("always shows an optional display name and its public-review terms", async () => {
    component.item.set(findShopItem("support-pkspot"));
    fixture.detectChanges();
    await fixture.whenStable();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain("Display name (optional)");
    expect(content).toContain(
      "Display names are manually reviewed before appearing publicly on the PK Spot supporters page.",
    );
    expect(fixture.nativeElement.querySelector("mat-checkbox")).toBeNull();
    expect(fixture.nativeElement.querySelector("mat-hint")).toBeNull();
  });

  it("adds the supplied display name to the direct-support cart item", async () => {
    component.supportModel.update((model) => ({
      ...model,
      displayName: "  Mira  ",
    }));
    await component.addDirectSupportToCart();

    expect(TestBed.inject(ShopCartService).items()).toMatchObject([
      { amountChf: 10, displayName: "Mira" },
    ]);
  });
});
