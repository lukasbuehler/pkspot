import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaTagService } from "../../services/meta-tag.service";
import { ShopCartService } from "../../services/shop-cart.service";
import { SupportShopService } from "../../services/support-shop.service";
import { ShopCartPageComponent } from "./shop-cart-page.component";

describe("ShopCartPageComponent", () => {
  let component: ShopCartPageComponent;
  let fixture: ComponentFixture<ShopCartPageComponent>;
  const metaTagService = { setStaticPageMetaTags: vi.fn() };
  const supportShopService = { createCheckout: vi.fn() };

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ShopCartPageComponent],
      providers: [
        provideRouter([]),
        { provide: MetaTagService, useValue: metaTagService },
        { provide: SupportShopService, useValue: supportShopService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopCartPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("shows the stored pack and provides a secure cart checkout", async () => {
    const cart = TestBed.inject(ShopCartService);
    cart.setStickerPack("sticker-pack-large");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      "Large Sticker Support Pack",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Continue to secure checkout",
    );
    expect(metaTagService.setStaticPageMetaTags).toHaveBeenCalledWith(
      "My cart | PK Spot Shop",
      expect.any(String),
      undefined,
      "/shop/cart",
    );
    expect(component.cart.itemCount()).toBe(1);
  });

  it("sends the direct-support display name with cart checkout", async () => {
    const cart = TestBed.inject(ShopCartService);
    cart.setDirectSupport({ amountChf: 25, displayName: "Mira" });
    supportShopService.createCheckout.mockRejectedValueOnce(new Error("test"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await component.checkout();

      expect(supportShopService.createCheckout).toHaveBeenCalledWith({
        kind: "direct_support",
        amountChf: 25,
        checkoutDestination: "cart",
        supporterCredit: { optedIn: true, publicName: "Mira" },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
