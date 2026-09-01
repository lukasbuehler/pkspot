import { isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, Injectable, computed, inject, signal } from "@angular/core";
import {
  SUPPORT_SHOP_PRODUCTS,
  type SupportShopProduct,
  type SupportShopProductId,
} from "../../db/schemas/SupportShopSchema";

type CartProduct = SupportShopProduct & { priceLabel: string };

/**
 * Stores the chosen sticker pack on this device. The initial shop has one
 * physical product, so a cart is intentionally one selected pack rather than
 * a prematurely general order model.
 */
@Injectable({ providedIn: "root" })
export class ShopCartService {
  private static readonly STORAGE_KEY = "pkspot:shop-cart:v1";
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _productId = signal<SupportShopProductId | null>(
    this.readStoredProductId(),
  );

  readonly product = computed<CartProduct | null>(() => {
    const productId = this._productId();
    const product = SUPPORT_SHOP_PRODUCTS.find(
      (candidate) => candidate.id === productId,
    );
    return product
      ? { ...product, priceLabel: `CHF ${(product.priceRappen / 100).toFixed(2)}` }
      : null;
  });
  readonly itemCount = computed(() => (this.product() ? 1 : 0));

  setStickerPack(productId: SupportShopProductId): void {
    this._productId.set(productId);
    this.writeStoredProductId(productId);
  }

  clear(): void {
    this._productId.set(null);
    if (isPlatformBrowser(this._platformId)) {
      localStorage.removeItem(ShopCartService.STORAGE_KEY);
    }
  }

  private readStoredProductId(): SupportShopProductId | null {
    if (!isPlatformBrowser(this._platformId)) return null;
    const productId = localStorage.getItem(ShopCartService.STORAGE_KEY);
    return SUPPORT_SHOP_PRODUCTS.some((product) => product.id === productId)
      ? (productId as SupportShopProductId)
      : null;
  }

  private writeStoredProductId(productId: SupportShopProductId): void {
    if (isPlatformBrowser(this._platformId)) {
      localStorage.setItem(ShopCartService.STORAGE_KEY, productId);
    }
  }
}
