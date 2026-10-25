// Stripe publishes CommonJS declarations, and the functions TypeScript config
// deliberately keeps `esModuleInterop` disabled.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require("stripe");

export const SUPPORT_SHOP_PAYMENT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);

export function verifySupportShopWebhook(
  stripe: Stripe,
  payload: Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export function shouldMarkSupportOrderPaid(
  eventType: string,
  session: Stripe.Checkout.Session,
): boolean {
  return (
    (eventType === "checkout.session.completed" ||
      eventType === "checkout.session.async_payment_succeeded") &&
    session.payment_status === "paid"
  );
}
