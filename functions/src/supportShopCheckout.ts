// Stripe publishes CommonJS declarations, and the functions TypeScript config
// deliberately keeps `esModuleInterop` disabled.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require("stripe");
import {
  SUPPORT_SHOP_CURRENCY,
  type SupportCheckoutInput,
  type SupportCheckoutItem,
} from "../../src/db/schemas/SupportShopSchema";

/**
 * Builds a Checkout Session solely from server-validated input. This keeps the
 * amount, pack price, shipping territory, and redirect target outside browser
 * control and makes the payment contract independently testable.
 */
export function createSupportCheckoutSessionParams(
  input: SupportCheckoutInput,
  checkoutId: string,
  returnUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const hasPhysicalOrder = input.items.some(
    (item) => item.kind === "physical_order",
  );
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    success_url: `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}?checkout=cancelled`,
    metadata: {
      pkspot_support_checkout_id: checkoutId,
    },
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    line_items: input.items.map(createLineItem),
  };

  if (hasPhysicalOrder) {
    params.shipping_address_collection = { allowed_countries: ["CH"] };
    // Stripe's custom-amount prices do not support Adaptive Pricing, while the
    // trusted fixed-price sticker catalogue does. A mixed cart therefore uses
    // its server-validated CHF prices for every line.
    if (input.items.every((item) => item.kind === "physical_order")) {
      params.adaptive_pricing = { enabled: true };
    }
  }
  return params;
}

function createLineItem(
  input: SupportCheckoutItem,
): Stripe.Checkout.SessionCreateParams.LineItem {
  return input.kind === "direct_support"
    ? {
        quantity: 1,
        price_data: {
          currency: SUPPORT_SHOP_CURRENCY,
          unit_amount: input.amountRappen,
          product_data: {
            name: "Support PK Spot",
            description:
              "A contribution to PK Spot's development and community work.",
          },
        },
      }
    : {
        quantity: 1,
        price_data: {
          currency: SUPPORT_SHOP_CURRENCY,
          unit_amount: input.product.priceRappen,
          product_data: {
            name: input.product.name,
            description: `${input.product.stickerCount} PK Spot stickers. Shipping within Switzerland is included.`,
          },
        },
      };
}

export function checkoutItemId(
  input: SupportCheckoutItem,
): "support-pkspot" | "nice-sticker-support-pack" {
  return input.kind === "direct_support"
    ? "support-pkspot"
    : "nice-sticker-support-pack";
}
