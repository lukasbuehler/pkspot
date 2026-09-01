import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { ShopCartService } from "./shop-cart.service";

describe("ShopCartService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it("persists the selected trusted sticker pack and clears it", () => {
    TestBed.configureTestingModule({
      providers: [
        ShopCartService,
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
    const cart = TestBed.inject(ShopCartService);

    expect(cart.itemCount()).toBe(0);

    cart.setStickerPack("sticker-pack-huge");

    expect(cart.product()?.stickerCount).toBe(25);
    expect(cart.itemCount()).toBe(1);
    expect(localStorage.getItem("pkspot:shop-cart:v1")).toBe(
      "sticker-pack-huge",
    );

    cart.clear();

    expect(cart.product()).toBeNull();
    expect(localStorage.getItem("pkspot:shop-cart:v1")).toBeNull();
  });
});
