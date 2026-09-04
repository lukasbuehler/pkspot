export const SUPPORT_SHOP_CURRENCY = "chf";
export const DIRECT_SUPPORT_MIN_RAPPEN = 1_000;
export const DIRECT_SUPPORT_MAX_RAPPEN = 10_000;
export const SUPPORT_SHOP_MAX_CART_ITEMS = 20;

export type SupportOrderType = "direct_support" | "physical_order";
export type SupportCheckoutDestination = "cart";
export type SupportOrderPaymentStatus =
  | "checkout_created"
  | "paid"
  | "failed";
export type SupportOrderFulfillmentStatus = "not_required" | "unfulfilled" | "fulfilled";
export type SupportShopProductId =
  | "sticker-pack-standard"
  | "sticker-pack-large"
  | "sticker-pack-huge"
  | "sticker-pack-gigantic";

export interface SupportShopProduct {
  id: SupportShopProductId;
  name: string;
  stickerCount: number;
  priceRappen: number;
  designId: string;
  weightGrams: number;
}

/**
 * This is the single trusted catalogue for the initial support shop. Browser
 * code may render it, but Checkout Sessions are always rebuilt from it in the
 * Cloud Function so a browser can never choose a price.
 */
export const SUPPORT_SHOP_PRODUCTS: readonly SupportShopProduct[] = [
  {
    id: "sticker-pack-standard",
    name: "Standard Sticker Support Pack",
    stickerCount: 5,
    priceRappen: 1_200,
    designId: "pkspot-sticker-v1",
    weightGrams: 15,
  },
  {
    id: "sticker-pack-large",
    name: "Large Sticker Support Pack",
    stickerCount: 10,
    priceRappen: 2_000,
    designId: "pkspot-sticker-v1",
    weightGrams: 25,
  },
  {
    id: "sticker-pack-huge",
    name: "Huge Sticker Support Pack",
    stickerCount: 25,
    priceRappen: 3_500,
    designId: "pkspot-sticker-v1",
    weightGrams: 55,
  },
  {
    id: "sticker-pack-gigantic",
    name: "Gigantic Sticker Support Pack",
    stickerCount: 50,
    priceRappen: 6_500,
    designId: "pkspot-sticker-v1",
    weightGrams: 105,
  },
];

export interface SupporterCreditInput {
  optedIn: boolean;
  publicName?: string;
}

export interface DirectSupportCheckoutInput {
  kind: "direct_support";
  amountRappen: number;
  supporterCredit: SupporterCreditInput;
  checkoutDestination?: SupportCheckoutDestination;
}

export interface PhysicalOrderCheckoutInput {
  kind: "physical_order";
  product: SupportShopProduct;
  supporterCredit: SupporterCreditInput;
  checkoutDestination?: SupportCheckoutDestination;
}

export type SupportCheckoutItem =
  | DirectSupportCheckoutInput
  | PhysicalOrderCheckoutInput;

export interface SupportCheckoutInput {
  items: readonly SupportCheckoutItem[];
  checkoutDestination?: SupportCheckoutDestination;
}

export class SupportShopValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportShopValidationError";
  }
}

export function parseSupportCheckoutInput(value: unknown): SupportCheckoutInput {
  if (!isRecord(value)) {
    throw new SupportShopValidationError("Checkout details are required.");
  }

  if (Array.isArray(value["items"])) {
    assertOnlyKeys(value, ["items", "checkoutDestination"]);
    const checkoutDestination = parseCheckoutDestination(
      value["checkoutDestination"],
    );
    if (checkoutDestination !== "cart") {
      throw new SupportShopValidationError(
        "Multiple items must use the cart checkout destination.",
      );
    }
    if (!value["items"].length || value["items"].length > SUPPORT_SHOP_MAX_CART_ITEMS) {
      throw new SupportShopValidationError(
        `Choose between 1 and ${SUPPORT_SHOP_MAX_CART_ITEMS} shop items.`,
      );
    }
    return {
      items: value["items"].map((item) => parseSupportCheckoutItem(item)),
      checkoutDestination,
    };
  }

  // Keep single-item requests from an already-open shop page compatible while
  // new carts use the explicit items array above.
  const item = parseSupportCheckoutItem(value);
  return {
    items: [item],
    ...(item.checkoutDestination
      ? { checkoutDestination: item.checkoutDestination }
      : {}),
  };
}

function parseSupportCheckoutItem(value: unknown): SupportCheckoutItem {
  if (!isRecord(value)) {
    throw new SupportShopValidationError("Each shop item must be an object.");
  }

  const kind = value["kind"];
  const supporterCredit = parseSupporterCredit(value["supporterCredit"]);

  if (kind === "direct_support") {
    assertOnlyKeys(value, [
      "kind",
      "amountChf",
      "supporterCredit",
      "checkoutDestination",
    ]);
    const checkoutDestination = parseCheckoutDestination(
      value["checkoutDestination"],
    );
    return {
      kind,
      amountRappen: parseDirectSupportAmount(value["amountChf"]),
      supporterCredit,
      ...(checkoutDestination ? { checkoutDestination } : {}),
    };
  }

  if (kind === "physical_order") {
    assertOnlyKeys(value, [
      "kind",
      "productId",
      "supporterCredit",
      "checkoutDestination",
    ]);
    const productId = value["productId"];
    const product =
      typeof productId === "string"
        ? SUPPORT_SHOP_PRODUCTS.find((candidate) => candidate.id === productId)
        : undefined;
    if (!product) {
      throw new SupportShopValidationError("Choose a supported Sticker Support Pack.");
    }
    const checkoutDestination = parseCheckoutDestination(
      value["checkoutDestination"],
    );
    return {
      kind,
      product,
      supporterCredit,
      ...(checkoutDestination ? { checkoutDestination } : {}),
    };
  }

  throw new SupportShopValidationError("Choose a supported way to support PK Spot.");
}

function parseCheckoutDestination(
  value: unknown,
): SupportCheckoutDestination | undefined {
  if (value === undefined) return undefined;
  if (value === "cart") return value;
  throw new SupportShopValidationError("Choose a supported checkout destination.");
}

export function formatChf(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}

function parseDirectSupportAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SupportShopValidationError("Enter a support amount in CHF.");
  }

  const amountRappen = Math.round(value * 100);
  if (Math.abs(value * 100 - amountRappen) > 0.000_001) {
    throw new SupportShopValidationError("Use an amount with at most two decimal places.");
  }
  if (
    amountRappen < DIRECT_SUPPORT_MIN_RAPPEN ||
    amountRappen > DIRECT_SUPPORT_MAX_RAPPEN
  ) {
    throw new SupportShopValidationError("Support amounts must be between CHF 10 and CHF 100.");
  }
  return amountRappen;
}

function parseSupporterCredit(value: unknown): SupporterCreditInput {
  if (value === undefined) {
    return { optedIn: false };
  }
  if (!isRecord(value)) {
    throw new SupportShopValidationError("Supporter credit details are invalid.");
  }
  assertOnlyKeys(value, ["optedIn", "publicName"]);
  if (typeof value["optedIn"] !== "boolean") {
    throw new SupportShopValidationError("Supporter credit consent is invalid.");
  }

  const publicName = cleanOptionalText(value["publicName"], 80, "supporter name");
  if (!value["optedIn"] && publicName) {
    throw new SupportShopValidationError(
      "Only provide a public name when you opt into supporter credits.",
    );
  }
  return {
    optedIn: value["optedIn"],
    ...(publicName ? { publicName } : {}),
  };
}

function cleanOptionalText(
  value: unknown,
  maxLength: number,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SupportShopValidationError(`The ${label} must be text.`);
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new SupportShopValidationError(
      `The ${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return cleaned || undefined;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new SupportShopValidationError("Checkout details contain unsupported fields.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
