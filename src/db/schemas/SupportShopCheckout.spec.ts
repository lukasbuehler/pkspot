import { describe, expect, it } from "vitest";
import {
  checkoutItemId,
  createSupportCheckoutSessionParams,
} from "../../../functions/src/supportShopCheckout";
import { parseSupportCheckoutInput } from "./SupportShopSchema";

const directSupportReturnUrl =
  "https://support-test.pkspot.app/shop/item/support-pkspot";
const stickerPackReturnUrl =
  "https://support-test.pkspot.app/shop/item/nice-sticker-support-pack";

describe("support shop Checkout Session creation", () => {
  it("uses the validated custom amount for direct support without shipping or Adaptive Pricing", () => {
    const params = createSupportCheckoutSessionParams(
      parseSupportCheckoutInput({
        kind: "direct_support",
        amountChf: 42.5,
        supporterCredit: { optedIn: false },
      }),
      "order_direct_123",
      directSupportReturnUrl,
    );

    expect(params).toMatchObject({
      success_url: `${directSupportReturnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${directSupportReturnUrl}?checkout=cancelled`,
      metadata: {pkspot_support_order_id: "order_direct_123"},
      line_items: [{price_data: {currency: "chf", unit_amount: 4_250}}],
    });
    expect(params.shipping_address_collection).toBeUndefined();
    expect(params.adaptive_pricing).toBeUndefined();
    expect(checkoutItemId(parseSupportCheckoutInput({
      kind: "direct_support",
      amountChf: 10,
      supporterCredit: { optedIn: false },
    }))).toBe("support-pkspot");
  });

  it("uses the trusted sticker price and Swiss-only shipping for a physical order", () => {
    const params = createSupportCheckoutSessionParams(
      parseSupportCheckoutInput({
        kind: "physical_order",
        productId: "sticker-pack-gigantic",
        supporterCredit: { optedIn: false },
      }),
      "order_pack_123",
      stickerPackReturnUrl,
    );

    expect(params).toMatchObject({
      metadata: {pkspot_support_order_id: "order_pack_123"},
      success_url: `${stickerPackReturnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${stickerPackReturnUrl}?checkout=cancelled`,
      shipping_address_collection: {allowed_countries: ["CH"]},
      adaptive_pricing: {enabled: true},
      line_items: [{price_data: {currency: "chf", unit_amount: 6_500}}],
    });
    expect(checkoutItemId(parseSupportCheckoutInput({
      kind: "physical_order",
      productId: "sticker-pack-standard",
      supporterCredit: { optedIn: false },
    }))).toBe("nice-sticker-support-pack");
  });
});
