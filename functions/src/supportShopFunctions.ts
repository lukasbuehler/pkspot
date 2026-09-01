import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {defineBoolean, defineSecret, defineString} from "firebase-functions/params";
import {HttpsError, onCall, onRequest, type CallableRequest, type Request} from "firebase-functions/v2/https";
// Stripe publishes CommonJS declarations, and the functions TypeScript config
// deliberately keeps `esModuleInterop` disabled.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require("stripe");
import {
  SUPPORT_SHOP_CURRENCY,
  type SupportCheckoutInput,
  type SupportOrderType,
  SupportShopValidationError,
  parseSupportCheckoutInput,
} from "../../src/db/schemas/SupportShopSchema";
import {
  SUPPORT_SHOP_PAYMENT_EVENTS,
  shouldMarkSupportOrderPaid,
  verifySupportShopWebhook,
} from "./supportShopWebhook";
import {
  checkoutItemId,
  createSupportCheckoutSessionParams,
} from "./supportShopCheckout";

const db = admin.firestore();
const supportShopEnabled = defineBoolean("SUPPORT_SHOP_ENABLED", {default: false});
const supportShopReturnUrl = defineString("SUPPORT_SHOP_RETURN_URL", {default: ""});
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const orders = db.collection("support_orders");
const webhookEvents = db.collection("support_shop_webhook_events");

interface StoredSupportOrder {
  kind: SupportOrderType;
  payment?: {status?: unknown; checkout_session_id?: unknown};
  fulfillment?: {status?: unknown; fulfilled_at?: unknown};
}

const checkoutCallableOptions = {
  enforceAppCheck: true,
  secrets: [stripeSecretKey],
};
const adminCallableOptions = {enforceAppCheck: true};
const customerCallableOptions = {enforceAppCheck: true};

export const createSupportCheckout = onCall(
  checkoutCallableOptions,
  async (request: CallableRequest<unknown>): Promise<{checkoutUrl: string}> => {
    assertSupportShopEnabled();
    const input = parseCheckoutInput(request.data);
    const orderRef = orders.doc();
    const now = admin.firestore.Timestamp.now();
    const order = checkoutDraft(input, request.auth?.uid, now);
    await orderRef.create(order);

    try {
      const checkout = await stripeClient().checkout.sessions.create(
        createSupportCheckoutSessionParams(
          input,
          orderRef.id,
          checkoutReturnUrl(input),
        ),
        {idempotencyKey: `pkspot-support-checkout-${orderRef.id}`},
      );
      if (!checkout.url) {
        throw new HttpsError("internal", "Stripe did not return a Checkout URL.");
      }
      await orderRef.update({
        payment: {
          status: "checkout_created",
          checkout_session_id: checkout.id,
        },
        updated_at: admin.firestore.Timestamp.now(),
      });
      return {checkoutUrl: checkout.url};
    } catch (error) {
      await orderRef.update({
        payment: {status: "failed"},
        updated_at: admin.firestore.Timestamp.now(),
      });
      logger.error("Unable to create Stripe Checkout Session", {
        order_id: orderRef.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Could not start secure checkout. Please try again.");
    }
  },
);

export const stripeSupportWebhook = onRequest(
  {secrets: [stripeSecretKey, stripeWebhookSecret]},
  async (request: Request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    // Keep production and native environments inert even if somebody finds the
    // endpoint or the client-side feature flag is bypassed.
    if (!supportShopEnabled.value()) {
      response.status(200).json({received: true, ignored: true});
      return;
    }

    const signature = request.header("stripe-signature");
    const webhookSecret = stripeWebhookSecret.value();
    if (!signature || !webhookSecret) {
      response.status(400).send("Webhook signature is required.");
      return;
    }

    let event: Stripe.Event;
    try {
      event = verifySupportShopWebhook(
        stripeClient(),
        request.rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      logger.warn("Rejected Stripe webhook with an invalid signature", {
        error: error instanceof Error ? error.message : "unknown",
      });
      response.status(400).send("Invalid Stripe webhook signature.");
      return;
    }

    if (!SUPPORT_SHOP_PAYMENT_EVENTS.has(event.type)) {
      response.status(200).json({received: true, ignored: true});
      return;
    }

    try {
      await processStripeSupportEvent(event);
      response.status(200).json({received: true});
    } catch (error) {
      logger.error("Stripe support webhook processing failed", {
        event_id: event.id,
        event_type: event.type,
        error: error instanceof Error ? error.message : "unknown",
      });
      response.status(500).send("Webhook processing failed.");
    }
  },
);

export const listSupportOrders = onCall(
  adminCallableOptions,
  async (request: CallableRequest<unknown>) => {
    assertSupportShopEnabled();
    await assertAdmin(request.auth?.uid);
    const snapshot = await orders.orderBy("paid_at", "desc").limit(100).get();
    return snapshot.docs.flatMap((document) => {
      const data = document.data() as StoredSupportOrder & Record<string, unknown>;
      if (
        data.kind !== "physical_order" ||
        data.payment?.status !== "paid" ||
        !isRecord(data["product"])
      ) {
        return [];
      }
      const product = data["product"];
      const fulfillment = isRecord(data["fulfillment"])
        ? data["fulfillment"]
        : {};
      const shipping = isRecord(data["shipping"]) ? data["shipping"] : undefined;
      const customer = isRecord(data["customer"]) ? data["customer"] : undefined;
      return [{
        id: document.id,
        createdAtMillis: timestampMillis(data["created_at"]),
        paidAtMillis: timestampMillis(data["paid_at"]),
        productName: stringOrEmpty(product["name"]),
        stickerCount: numberOrZero(product["sticker_count"]),
        amountRappen: numberOrZero(data["amount_total_rappen"]),
        ...(stringOrUndefined(customer?.["email"])
          ? {customerEmail: stringOrUndefined(customer?.["email"])}
          : {}),
        ...(shipping ? {shipping: publicShippingAddress(shipping)} : {}),
        fulfillmentStatus:
          fulfillment["status"] === "fulfilled" ? "fulfilled" : "unfulfilled",
        ...(timestampMillis(fulfillment["fulfilled_at"])
          ? {fulfilledAtMillis: timestampMillis(fulfillment["fulfilled_at"])}
          : {}),
      }];
    });
  },
);

/** Returns only the caller's own non-PII order summaries. */
export const listMySupportOrders = onCall(
  customerCallableOptions,
  async (request: CallableRequest<unknown>) => {
    assertSupportShopEnabled();
    const uid = assertSignedInUser(request.auth?.uid);
    const snapshot = await orders
      .where("user_id", "==", uid)
      .orderBy("created_at", "desc")
      .limit(100)
      .get();

    return snapshot.docs.flatMap((document) => {
      const data = document.data() as StoredSupportOrder & Record<string, unknown>;
      if (data.kind !== "direct_support" && data.kind !== "physical_order") {
        return [];
      }
      const product = isRecord(data["product"]) ? data["product"] : undefined;
      const payment = isRecord(data["payment"]) ? data["payment"] : {};
      const fulfillment = isRecord(data["fulfillment"])
        ? data["fulfillment"]
        : {};
      const paymentStatus = payment["status"] === "paid"
        ? "paid"
        : payment["status"] === "failed"
          ? "failed"
          : "checkout_created";

      return [{
        id: document.id,
        kind: data.kind,
        createdAtMillis: timestampMillis(data["created_at"]),
        ...(timestampMillis(data["paid_at"])
          ? {paidAtMillis: timestampMillis(data["paid_at"])}
          : {}),
        amountRappen: numberOrZero(data["amount_total_rappen"]),
        paymentStatus,
        ...(product
          ? {
              productName: stringOrEmpty(product["name"]),
              stickerCount: numberOrZero(product["sticker_count"]),
              fulfillmentStatus:
                fulfillment["status"] === "fulfilled"
                  ? "fulfilled"
                  : "unfulfilled",
            }
          : {}),
      }];
    });
  },
);

export const markSupportOrderFulfilled = onCall(
  adminCallableOptions,
  async (request: CallableRequest<{orderId?: unknown}>): Promise<void> => {
    assertSupportShopEnabled();
    const adminUid = await assertAdmin(request.auth?.uid);
    const orderId = request.data?.orderId;
    if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/u.test(orderId)) {
      throw new HttpsError("invalid-argument", "A valid support order is required.");
    }

    await db.runTransaction(async (transaction) => {
      const orderRef = orders.doc(orderId);
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "Support order not found.");
      }
      const order = snapshot.data() as StoredSupportOrder;
      if (order.kind !== "physical_order" || order.payment?.status !== "paid") {
        throw new HttpsError("failed-precondition", "Only paid physical orders can be fulfilled.");
      }
      if (order.fulfillment?.status === "fulfilled") return;
      transaction.update(orderRef, {
        fulfillment: {
          status: "fulfilled",
          fulfilled_at: admin.firestore.Timestamp.now(),
          fulfilled_by_uid: adminUid,
        },
        updated_at: admin.firestore.Timestamp.now(),
      });
    });
  },
);

async function processStripeSupportEvent(event: Stripe.Event): Promise<void> {
  const receivedSession = event.data.object as Stripe.Checkout.Session;
  const orderId = receivedSession.metadata?.["pkspot_support_order_id"];
  if (!orderId) return;

  const session = await stripeClient().checkout.sessions.retrieve(receivedSession.id, {
    expand: ["line_items", "payment_intent"],
  });
  const paymentPaid = shouldMarkSupportOrderPaid(event.type, session);
  const paymentFailed = event.type === "checkout.session.async_payment_failed";
  if (!paymentPaid && !paymentFailed) return;

  const orderRef = orders.doc(orderId);
  const eventRef = webhookEvents.doc(event.id);
  await db.runTransaction(async (transaction) => {
    const [processed, orderSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(orderRef),
    ]);
    if (processed.exists) return;
    if (!orderSnapshot.exists) {
      throw new Error(`Support order ${orderId} was not found.`);
    }
    const order = orderSnapshot.data() as StoredSupportOrder;
    const storedSessionId = order.payment?.checkout_session_id;
    if (storedSessionId && storedSessionId !== session.id) {
      throw new Error(`Stripe Session did not match support order ${orderId}.`);
    }

    const now = admin.firestore.Timestamp.now();
    if (paymentPaid && order.payment?.status !== "paid") {
      transaction.update(orderRef, paidOrderUpdate(session, now));
    } else if (paymentFailed && order.payment?.status !== "paid") {
      transaction.update(orderRef, {
        payment: {
          ...(isRecord(order.payment) ? order.payment : {}),
          status: "failed",
          checkout_session_id: session.id,
        },
        updated_at: now,
      });
    }
    transaction.create(eventRef, {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      stripe_checkout_session_id: session.id,
      order_id: orderId,
      processed_at: now,
    });
  });
}

function checkoutDraft(
  input: SupportCheckoutInput,
  userId: string | undefined,
  now: admin.firestore.Timestamp,
): Record<string, unknown> {
  const base = {
    schema_version: 1,
    kind: input.kind,
    currency: SUPPORT_SHOP_CURRENCY,
    payment: {status: "checkout_created"},
    supporter_credit: input.supporterCredit,
    created_at: now,
    updated_at: now,
    ...(userId ? {user_id: userId} : {}),
  };
  if (input.kind === "direct_support") {
    return {
      ...base,
      amount_total_rappen: input.amountRappen,
      fulfillment: {status: "not_required"},
    };
  }
  return {
    ...base,
    amount_total_rappen: input.product.priceRappen,
    product: {
      id: input.product.id,
      name: input.product.name,
      sticker_count: input.product.stickerCount,
      design_id: input.product.designId,
      weight_grams: input.product.weightGrams,
    },
    shipping_policy: {
      type: "included",
      supported_destinations: ["CH"],
      merchandise_weight_grams: input.product.weightGrams,
    },
    fulfillment: {status: "unfulfilled"},
  };
}

function paidOrderUpdate(
  session: Stripe.Checkout.Session,
  now: admin.firestore.Timestamp,
): Record<string, unknown> {
  const shippingDetails = shippingDetailsFrom(session);
  return {
    payment: {
      status: "paid",
      checkout_session_id: session.id,
      ...(idFrom(session.payment_intent)
        ? {payment_intent_id: idFrom(session.payment_intent)}
        : {}),
      ...(idFrom(session.customer) ? {customer_id: idFrom(session.customer)} : {}),
    },
    amount_total_rappen: session.amount_total ?? 0,
    currency: session.currency ?? SUPPORT_SHOP_CURRENCY,
    ...(session.customer_details?.email
      ? {customer: {email: session.customer_details.email}}
      : {}),
    ...(shippingDetails ? {shipping: shippingDetails} : {}),
    paid_at: now,
    updated_at: now,
  };
}

function shippingDetailsFrom(
  session: Stripe.Checkout.Session,
): Record<string, string> | undefined {
  const details = session.collected_information?.shipping_details;
  const address = details?.address;
  if (!details || !address) return undefined;
  return {
    ...(details.name ? {name: details.name} : {}),
    ...(address.line1 ? {line1: address.line1} : {}),
    ...(address.line2 ? {line2: address.line2} : {}),
    ...(address.postal_code ? {postal_code: address.postal_code} : {}),
    ...(address.city ? {city: address.city} : {}),
    ...(address.country ? {country: address.country} : {}),
  };
}

function normalizedReturnUrl(): string {
  const value = supportShopReturnUrl.value().trim().replace(/\/$/u, "");
  try {
    const url = new URL(value);
    const localhost = url.protocol === "http:" && url.hostname === "localhost";
    if (url.protocol !== "https:" && !localhost) throw new Error("invalid protocol");
    if (url.pathname !== "/shop" || url.search || url.hash) {
      throw new Error("invalid return URL");
    }
    return url.toString().replace(/\/$/u, "");
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "Secure shop checkout is not configured for this environment.",
    );
  }
}

function checkoutReturnUrl(input: SupportCheckoutInput): string {
  if (input.kind === "physical_order" && input.checkoutDestination === "cart") {
    return `${normalizedReturnUrl()}/cart`;
  }
  return `${normalizedReturnUrl()}/item/${checkoutItemId(input)}`;
}

function stripeClient(): Stripe {
  const secret = stripeSecretKey.value();
  if (!secret) {
    throw new HttpsError("failed-precondition", "Stripe is not configured for this environment.");
  }
  return new Stripe(secret);
}

function assertSupportShopEnabled(): void {
  if (!supportShopEnabled.value()) {
    throw new HttpsError("failed-precondition", "The PK Spot shop is not enabled here.");
  }
}

function parseCheckoutInput(value: unknown): SupportCheckoutInput {
  try {
    return parseSupportCheckoutInput(value);
  } catch (error) {
    if (error instanceof SupportShopValidationError) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
}

async function assertAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage shop orders.");
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
}

function assertSignedInUser(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to see your shop orders.");
  return uid;
}

function idFrom(value: string | {id: string} | null): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function timestampMillis(value: unknown): number {
  return value instanceof admin.firestore.Timestamp ? value.toMillis() : 0;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publicShippingAddress(value: Record<string, unknown>) {
  return {
    ...(stringOrUndefined(value["name"])
      ? {name: stringOrUndefined(value["name"])}
      : {}),
    ...(stringOrUndefined(value["line1"])
      ? {line1: stringOrUndefined(value["line1"])}
      : {}),
    ...(stringOrUndefined(value["line2"])
      ? {line2: stringOrUndefined(value["line2"])}
      : {}),
    ...(stringOrUndefined(value["postal_code"])
      ? {postalCode: stringOrUndefined(value["postal_code"])}
      : {}),
    ...(stringOrUndefined(value["city"])
      ? {city: stringOrUndefined(value["city"])}
      : {}),
    ...(stringOrUndefined(value["country"])
      ? {country: stringOrUndefined(value["country"])}
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
