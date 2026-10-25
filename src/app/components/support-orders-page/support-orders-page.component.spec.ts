import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SupportShopService } from "../../services/support-shop.service";
import { SupportOrdersPageComponent } from "./support-orders-page.component";

describe("SupportOrdersPageComponent", () => {
  let component: SupportOrdersPageComponent;
  let fixture: ComponentFixture<SupportOrdersPageComponent>;
  const authState$ = new BehaviorSubject(null);
  const shop = {
    listPhysicalOrders: vi.fn(),
    markPhysicalOrderFulfilled: vi.fn(),
  };

  beforeEach(async () => {
    shop.listPhysicalOrders.mockReset();
    shop.markPhysicalOrderFulfilled.mockReset();
    shop.listPhysicalOrders.mockResolvedValue([
      {
        id: "order_12345678",
        createdAtMillis: 1,
        paidAtMillis: 2,
        productName: "Large Sticker Support Pack",
        stickerCount: 10,
        amountRappen: 2_000,
        fulfillmentStatus: "unfulfilled",
      },
    ]);
    shop.markPhysicalOrderFulfilled.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [SupportOrdersPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthenticationService,
          useValue: {
            authState$,
            initialAuthStateResolved: () => true,
            isAdmin: () => true,
          },
        },
        { provide: SupportShopService, useValue: shop },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(SupportOrdersPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it("loads paid physical orders and uses a preformatted CHF value in the template", () => {
    expect(shop.listPhysicalOrders).toHaveBeenCalledOnce();
    expect(component.orders()).toMatchObject([
      { id: "order_12345678", amountLabel: "CHF 20.00" },
    ]);
  });

  it("calls the protected fulfillment endpoint only after confirmation", async () => {
    vi.spyOn(globalThis, "confirm").mockReturnValueOnce(true);

    await component.markFulfilled(component.orders()[0]);

    expect(shop.markPhysicalOrderFulfilled).toHaveBeenCalledWith("order_12345678");
  });
});
