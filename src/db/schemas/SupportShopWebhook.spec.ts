import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  shouldMarkSupportOrderPaid,
  verifySupportShopWebhook,
} from "../../../functions/src/supportShopWebhook";

const require = createRequire(import.meta.url);
const Stripe = require("../../../functions/node_modules/stripe") as typeof import("../../../functions/node_modules/stripe");
const stripe = new Stripe("sk_test_support_shop_webhook");
const webhookSecret = "whsec_support_shop_test";

describe("support shop Stripe webhook verification", () => {
  it("accepts a correctly signed Checkout event and only treats paid sessions as paid", () => {
    const payload = JSON.stringify({
      id: "evt_support_123",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_support_123",
          object: "checkout.session",
          payment_status: "paid",
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const event = verifySupportShopWebhook(
      stripe,
      Buffer.from(payload),
      signature,
      webhookSecret,
    );
    const session = event.data.object as Parameters<typeof shouldMarkSupportOrderPaid>[1];

    expect(event.id).toBe("evt_support_123");
    expect(shouldMarkSupportOrderPaid(event.type, session)).toBe(true);
    expect(
      shouldMarkSupportOrderPaid("checkout.session.completed", {
        ...session,
        payment_status: "unpaid",
      }),
    ).toBe(false);
  });

  it("rejects an unsigned or tampered webhook before any order processing", () => {
    expect(() =>
      verifySupportShopWebhook(
        stripe,
        Buffer.from('{"id":"evt_tampered"}'),
        "t=1,v1=not-a-valid-signature",
        webhookSecret,
      ),
    ).toThrow();
  });
});
