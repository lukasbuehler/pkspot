import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { ShopCartService } from "./shop-cart.service";

describe("ShopCartService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it("keeps every added item and persists the cart as an array", () => {
    const cart = createCart();

    cart.addStickerPack("sticker-pack-huge");
    cart.addDirectSupport({ amountChf: 42.5, displayName: "  Mira  " });

    expect(cart.items().map((item) => item.kind)).toEqual([
      "physical_order",
      "direct_support",
    ]);
    expect(cart.items()[0]).toMatchObject({
      kind: "physical_order",
      product: { stickerCount: 25 },
    });
    expect(cart.items()[1]).toMatchObject({
      kind: "direct_support",
      amountChf: 42.5,
      displayName: "Mira",
    });
    expect(cart.itemCount()).toBe(2);
    expect(cart.totalPriceLabel()).toBe("CHF 77.50");

    const stored = JSON.parse(
      localStorage.getItem("pkspot:shop-cart:v1") ?? "[]",
    ) as unknown[];
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      kind: "physical_order",
      productId: "sticker-pack-huge",
    });
    expect(stored[1]).toMatchObject({
      kind: "direct_support",
      amountChf: 42.5,
      displayName: "Mira",
    });

    cart.remove(cart.items()[0]!.id);

    expect(cart.items()).toHaveLength(1);
    expect(cart.items()[0]).toMatchObject({ kind: "direct_support" });
  });

  it("keeps a pending cart item from the single-item storage format", () => {
    localStorage.setItem(
      "pkspot:shop-cart:v1",
      JSON.stringify({
        kind: "direct_support",
        amountChf: 25,
        displayName: "Mira",
      }),
    );

    const cart = createCart();

    expect(cart.items()).toMatchObject([
      {
        kind: "direct_support",
        amountChf: 25,
        displayName: "Mira",
        priceLabel: "CHF 25.00",
      },
    ]);
  });

  it("clears every pending cart item", () => {
    const cart = createCart();
    cart.addStickerPack("sticker-pack-huge");
    cart.addStickerPack("sticker-pack-large");

    cart.clear();

    expect(cart.items()).toEqual([]);
    expect(localStorage.getItem("pkspot:shop-cart:v1")).toBeNull();
  });
});

function createCart(): ShopCartService {
  TestBed.configureTestingModule({
    providers: [ShopCartService, { provide: PLATFORM_ID, useValue: "browser" }],
  });
  return TestBed.inject(ShopCartService);
}
