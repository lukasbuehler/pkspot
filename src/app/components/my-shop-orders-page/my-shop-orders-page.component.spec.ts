import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SupportShopService } from "../../services/support-shop.service";
import { MyShopOrdersPageComponent } from "./my-shop-orders-page.component";

describe("MyShopOrdersPageComponent", () => {
  let fixture: ComponentFixture<MyShopOrdersPageComponent>;
  const authState$ = new BehaviorSubject<{ uid: string } | null>({
    uid: "shopper-1",
  });
  const auth = { isSignedIn: true, authState$ };
  const metaTagService = { setStaticPageMetaTags: vi.fn() };
  const supportShopService = { listMyOrders: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    auth.isSignedIn = true;
    authState$.next({ uid: "shopper-1" });
    supportShopService.listMyOrders.mockResolvedValue([
      {
        id: "support-order-1",
        kind: "physical_order",
        createdAtMillis: 1_700_000_000_000,
        amountRappen: 2_000,
        paymentStatus: "paid",
        productName: "Large Sticker Support Pack",
        stickerCount: 10,
        fulfillmentStatus: "unfulfilled",
      },
    ]);
    await TestBed.configureTestingModule({
      imports: [MyShopOrdersPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthenticationService, useValue: auth },
        { provide: MetaTagService, useValue: metaTagService },
        { provide: SupportShopService, useValue: supportShopService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyShopOrdersPageComponent);
    await fixture.whenStable();
  });

  it("shows only the signed-in customer's non-PII order summary", () => {
    expect(supportShopService.listMyOrders).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain(
      "Large Sticker Support Pack",
    );
    expect(fixture.nativeElement.textContent).toContain("CHF 20.00");
    expect(fixture.nativeElement.textContent).not.toContain("shipping");
    expect(metaTagService.setStaticPageMetaTags).toHaveBeenCalledWith(
      "My orders | PK Spot Shop",
      expect.any(String),
      undefined,
      "/shop/my-orders",
    );
  });
});
