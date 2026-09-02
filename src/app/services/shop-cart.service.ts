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

interface StoredPhysicalOrderCartItem {
  kind: "physical_order";
  productId: SupportShopProductId;
}

interface StoredDirectSupportCartItem {
  kind: "direct_support";
  amountChf: number;
  displayName: string;
}

export interface PhysicalOrderCartItem {
  kind: "physical_order";
  product: CartProduct;
  priceLabel: string;
}

export interface DirectSupportCartItem {
  kind: "direct_support";
  amountChf: number;
  displayName: string;
  priceLabel: string;
}

export type ShopCartItem = PhysicalOrderCartItem | DirectSupportCartItem;

/**
 * Stores one pending shop item on this device. This keeps the initial cart
 * intentionally small while retaining the direct-support display name through
 * navigation and a page refresh.
 */
@Injectable({ providedIn: "root" })
export class ShopCartService {
  private static readonly STORAGE_KEY = "pkspot:shop-cart:v1";
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _storedItem = signal<StoredCartItem | null>(
    this.readStoredItem(),
  );

  readonly item = computed<ShopCartItem | null>(() => {
    const storedItem = this._storedItem();
    if (!storedItem) return null;

    if (storedItem.kind === "direct_support") {
      return {
        ...storedItem,
        priceLabel: formatChf(Math.round(storedItem.amountChf * 100)),
      };
    }

    const product = findProduct(storedItem.productId);
    if (!product) return null;
    const cartProduct = toCartProduct(product);
    return {
      kind: "physical_order",
      product: cartProduct,
      priceLabel: cartProduct.priceLabel,
    };
  });
  readonly product = computed<CartProduct | null>(() => {
    const item = this.item();
    return item?.kind === "physical_order" ? item.product : null;
  });
  readonly directSupport = computed<DirectSupportCartItem | null>(() => {
    const item = this.item();
    return item?.kind === "direct_support" ? item : null;
  });
  readonly itemCount = computed(() => (this.item() ? 1 : 0));

  setStickerPack(productId: SupportShopProductId): void {
    this.setItem({ kind: "physical_order", productId });
  }

  setDirectSupport(input: {
    amountChf: number;
    displayName: string;
  }): void {
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

    this.setItem({
      kind: "direct_support",
      amountChf: input.amountChf,
      displayName,
    });
  }

  clear(): void {
    this._storedItem.set(null);
    if (isPlatformBrowser(this._platformId)) {
      localStorage.removeItem(ShopCartService.STORAGE_KEY);
    }
  }

  private setItem(item: StoredCartItem): void {
    this._storedItem.set(item);
    if (isPlatformBrowser(this._platformId)) {
      localStorage.setItem(ShopCartService.STORAGE_KEY, JSON.stringify(item));
    }
  }

  private readStoredItem(): StoredCartItem | null {
    if (!isPlatformBrowser(this._platformId)) return null;
    const storedValue = localStorage.getItem(ShopCartService.STORAGE_KEY);
    if (!storedValue) return null;

    // The first shop release stored a product ID directly. Keep existing carts.
    if (findProduct(storedValue)) {
      return {
        kind: "physical_order",
        productId: storedValue as SupportShopProductId,
      };
    }

    try {
      return parseStoredItem(JSON.parse(storedValue));
    } catch {
      return null;
    }
  }
}

function parseStoredItem(value: unknown): StoredCartItem | null {
  if (!isRecord(value) || typeof value["kind"] !== "string") return null;

  if (
    value["kind"] === "physical_order" &&
    typeof value["productId"] === "string"
  ) {
    return findProduct(value["productId"])
      ? {
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
        kind: "direct_support",
        amountChf: value["amountChf"],
        displayName,
      };
    }
  }

  return null;
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
