import { describe, expect, it } from "vitest";
import {
  DIRECT_SUPPORT_MAX_RAPPEN,
  DIRECT_SUPPORT_MIN_RAPPEN,
  SupportShopValidationError,
  parseSupportCheckoutInput,
} from "./SupportShopSchema";

describe("parseSupportCheckoutInput", () => {
  it("normalizes a supported direct contribution into rappen", () => {
    expect(
      parseSupportCheckoutInput({
        kind: "direct_support",
        amountChf: 42.5,
        supporterCredit: { optedIn: true, publicName: "  Mira  " },
      }),
    ).toEqual({
      items: [{
        kind: "direct_support",
        amountRappen: 4_250,
        supporterCredit: { optedIn: true, publicName: "Mira" },
      }],
    });
  });

  it.each([
    DIRECT_SUPPORT_MIN_RAPPEN / 100 - 0.01,
    DIRECT_SUPPORT_MAX_RAPPEN / 100 + 0.01,
    10.001,
  ])("rejects a direct amount outside the server-side contract: %s", (amountChf) => {
    expect(() =>
      parseSupportCheckoutInput({
        kind: "direct_support",
        amountChf,
        supporterCredit: { optedIn: false },
      }),
    ).toThrow(SupportShopValidationError);
  });

  it("uses the trusted catalogue rather than a browser-provided sticker price", () => {
    expect(
      parseSupportCheckoutInput({
        kind: "physical_order",
        productId: "sticker-pack-huge",
        supporterCredit: { optedIn: false },
      }),
    ).toMatchObject({
      items: [{
        kind: "physical_order",
        product: {
          id: "sticker-pack-huge",
          priceRappen: 3_500,
          stickerCount: 25,
        },
      }],
    });

    expect(() =>
      parseSupportCheckoutInput({
        kind: "physical_order",
        productId: "sticker-pack-huge",
        amountChf: 0.01,
        supporterCredit: { optedIn: false },
      }),
    ).toThrow("unsupported fields");
  });

  it("only permits the server-known cart return destination", () => {
    expect(
      parseSupportCheckoutInput({
        kind: "physical_order",
        productId: "sticker-pack-standard",
        checkoutDestination: "cart",
        supporterCredit: { optedIn: false },
      }),
    ).toMatchObject({ checkoutDestination: "cart" });

    expect(() =>
      parseSupportCheckoutInput({
        kind: "physical_order",
        productId: "sticker-pack-standard",
        checkoutDestination: "https://example.test/redirect",
        supporterCredit: { optedIn: false },
      }),
    ).toThrow("supported checkout destination");

    expect(
      parseSupportCheckoutInput({
        kind: "direct_support",
        amountChf: 10,
        checkoutDestination: "cart",
        supporterCredit: { optedIn: false },
      }),
    ).toMatchObject({ checkoutDestination: "cart" });
  });

  it("accepts a bounded cart of independently validated items", () => {
    expect(
      parseSupportCheckoutInput({
        items: [
          {
            kind: "physical_order",
            productId: "sticker-pack-standard",
            supporterCredit: { optedIn: false },
          },
          {
            kind: "direct_support",
            amountChf: 25,
            supporterCredit: { optedIn: true, publicName: "Mira" },
          },
        ],
        checkoutDestination: "cart",
      }),
    ).toMatchObject({
      checkoutDestination: "cart",
      items: [
        { kind: "physical_order", product: { id: "sticker-pack-standard" } },
        { kind: "direct_support", amountRappen: 2_500 },
      ],
    });

    expect(() =>
      parseSupportCheckoutInput({
        items: [],
        checkoutDestination: "cart",
      }),
    ).toThrow("Choose between 1 and");
  });

  it("does not accept a public supporter name without explicit opt-in", () => {
    expect(() =>
      parseSupportCheckoutInput({
        kind: "direct_support",
        amountChf: 10,
        supporterCredit: { optedIn: false, publicName: "Do not publish me" },
      }),
    ).toThrow("Only provide a public name");
  });
});
