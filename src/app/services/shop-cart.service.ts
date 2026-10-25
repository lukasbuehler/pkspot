import { isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, Injectable, computed, inject, signal } from "@angular/core";
import {
  DIRECT_SUPPORT_MAX_RAPPEN,
  DIRECT_SUPPORT_MIN_RAPPEN,
  SUPPORT_SHOP_PRODUCTS,
  type SupportShopProduct,
  type SupportShopProductId,
} from "../../db/schemas/SupportShopSchema";

type CartProduct = SupportShopProduct & { priceLabel: string };
type StoredCartItem = StoredPhysicalOrderCartItem | StoredDirectSupportCartItem;

interface StoredCartItemBase {
  id: string;
}

interface StoredPhysicalOrderCartItem extends StoredCartItemBase {
  kind: "physical_order";
  productId: SupportShopProductId;
}

interface StoredDirectSupportCartItem extends StoredCartItemBase {
  kind: "direct_support";
  amountChf: number;
  displayName: string;
}

interface ShopCartItemBase {
  id: string;
}

export interface PhysicalOrderCartItem extends ShopCartItemBase {
  kind: "physical_order";
  product: CartProduct;
  priceLabel: string;
}

export interface DirectSupportCartItem extends ShopCartItemBase {
  kind: "direct_support";
  amountChf: number;
  displayName: string;
  priceLabel: string;
}

export type ShopCartItem = PhysicalOrderCartItem | DirectSupportCartItem;

/**
 * Stores pending shop items on this device. Prices are rendered from the local
 * catalogue but are always validated again by the checkout Cloud Function.
 */
@Injectable({ providedIn: "root" })
export class ShopCartService {
  private static readonly STORAGE_KEY = "pkspot:shop-cart:v1";
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _storedItems = signal<readonly StoredCartItem[]>(
    this.readStoredItems(),
  );

  readonly items = computed<readonly ShopCartItem[]>(() =>
    this._storedItems().flatMap(toCartItems),
  );
  readonly itemCount = computed(() => this.items().length);
  readonly totalRappen = computed(() =>
    this.items().reduce(
      (total, item) =>
        total +
        (item.kind === "direct_support"
          ? Math.round(item.amountChf * 100)
          : item.product.priceRappen),
      0,
    ),
  );
  readonly totalPriceLabel = computed(() => formatChf(this.totalRappen()));

  addStickerPack(productId: SupportShopProductId): void {
    if (!findProduct(productId)) {
      throw new RangeError("Choose a supported Sticker Support Pack.");
    }
    this.storeItems([
      ...this._storedItems(),
      { id: createCartItemId(), kind: "physical_order", productId },
    ]);
  }

  addDirectSupport(input: { amountChf: number; displayName: string }): void {
    const amountRappen = Math.round(input.amountChf * 100);
    if (
      !Number.isFinite(input.amountChf) ||
      Math.abs(input.amountChf * 100 - amountRappen) > 0.000_001 ||
      amountRappen < DIRECT_SUPPORT_MIN_RAPPEN ||
      amountRappen > DIRECT_SUPPORT_MAX_RAPPEN
    ) {
      throw new RangeError("Direct support must be between CHF 10 and CHF 100.");
    }

    const displayName = input.displayName.trim();
    if (displayName.length > 80) {
      throw new RangeError("A display name must be 80 characters or fewer.");
    }

    this.storeItems([
      ...this._storedItems(),
      {
        id: createCartItemId(),
        kind: "direct_support",
        amountChf: input.amountChf,
        displayName,
      },
    ]);
  }

  remove(itemId: string): void {
    this.storeItems(
      this._storedItems().filter((item) => item.id !== itemId),
    );
  }

  clear(): void {
    this.storeItems([]);
  }

  private storeItems(items: readonly StoredCartItem[]): void {
    this._storedItems.set(items);
    if (isPlatformBrowser(this._platformId)) {
      if (items.length) {
        localStorage.setItem(ShopCartService.STORAGE_KEY, JSON.stringify(items));
      } else {
        localStorage.removeItem(ShopCartService.STORAGE_KEY);
      }
    }
  }

  private readStoredItems(): readonly StoredCartItem[] {
    if (!isPlatformBrowser(this._platformId)) return [];
    const storedValue = localStorage.getItem(ShopCartService.STORAGE_KEY);
    if (!storedValue) return [];

    // The first release stored a product ID or one object directly. Keep that
    // pending item when upgrading it to a multi-item cart.
    if (findProduct(storedValue)) {
      return [{
        id: createCartItemId(),
        kind: "physical_order",
        productId: storedValue as SupportShopProductId,
      }];
    }

    try {
      const parsedValue: unknown = JSON.parse(storedValue);
      const values = Array.isArray(parsedValue) ? parsedValue : [parsedValue];
      return values.flatMap((value) => {
        const item = parseStoredItem(value);
        return item ? [item] : [];
      });
    } catch {
      return [];
    }
  }
}

function parseStoredItem(value: unknown): StoredCartItem | null {
  if (!isRecord(value) || typeof value["kind"] !== "string") return null;
  const id = parseCartItemId(value["id"]) ?? createCartItemId();

  if (
    value["kind"] === "physical_order" &&
    typeof value["productId"] === "string"
  ) {
    return findProduct(value["productId"])
      ? {
          id,
          kind: "physical_order",
          productId: value["productId"] as SupportShopProductId,
        }
      : null;
  }

  if (
    value["kind"] === "direct_support" &&
    typeof value["amountChf"] === "number" &&
    typeof value["displayName"] === "string"
  ) {
    const amountRappen = Math.round(value["amountChf"] * 100);
    const displayName = value["displayName"].trim();
    if (
      Number.isFinite(value["amountChf"]) &&
      Math.abs(value["amountChf"] * 100 - amountRappen) <= 0.000_001 &&
      amountRappen >= DIRECT_SUPPORT_MIN_RAPPEN &&
      amountRappen <= DIRECT_SUPPORT_MAX_RAPPEN &&
      displayName.length <= 80
    ) {
      return {
        id,
        kind: "direct_support",
        amountChf: value["amountChf"],
        displayName,
      };
    }
  }

  return null;
}

function toCartItems(storedItem: StoredCartItem): readonly ShopCartItem[] {
  if (storedItem.kind === "direct_support") {
    return [{
      ...storedItem,
      priceLabel: formatChf(Math.round(storedItem.amountChf * 100)),
    }];
  }

  const product = findProduct(storedItem.productId);
  if (!product) return [];
  const cartProduct = toCartProduct(product);
  return [{
    id: storedItem.id,
    kind: "physical_order",
    product: cartProduct,
    priceLabel: cartProduct.priceLabel,
  }];
}

function parseCartItemId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(value)
    ? value
    : undefined;
}

function createCartItemId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findProduct(productId: string): SupportShopProduct | undefined {
  return SUPPORT_SHOP_PRODUCTS.find((product) => product.id === productId);
}

function toCartProduct(product: SupportShopProduct): CartProduct {
  return { ...product, priceLabel: formatChf(product.priceRappen) };
}

function formatChf(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
