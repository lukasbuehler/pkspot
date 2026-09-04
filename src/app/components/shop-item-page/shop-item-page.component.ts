import { NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormField, form, max, maxLength, min, submit } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import type { SupportShopProductId } from "../../../db/schemas/SupportShopSchema";
import { STICKER_PACK_SIZES, findShopItem } from "../../features/shop-catalog";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ShopCartService } from "../../services/shop-cart.service";

@Component({
  selector: "app-shop-item-page",
  imports: [
    FormField,
    NgOptimizedImage,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: "./shop-item-page.component.html",
  styleUrl: "./shop-item-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopItemPageComponent implements OnInit {
  private readonly _analytics = inject(AnalyticsService);
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _cart = inject(ShopCartService);

  readonly checkoutState = signal<"success" | "cancelled" | "">("");
  readonly item = signal<ReturnType<typeof findShopItem>>(undefined);
  readonly selectedStickerPackId = signal<SupportShopProductId>(
    STICKER_PACK_SIZES[0]!.id,
  );
  readonly selectedStickerPack = computed(
    () =>
      STICKER_PACK_SIZES.find(
        (pack) => pack.id === this.selectedStickerPackId(),
      ) ?? STICKER_PACK_SIZES[0]!,
  );
  readonly stickerPackSizes = STICKER_PACK_SIZES;
  readonly supportModel = signal({
    amountChf: 10,
    displayName: "",
  });
  readonly supportForm = form(this.supportModel, (schema) => {
    min(schema.amountChf, 10);
    max(schema.amountChf, 100);
    maxLength(schema.displayName, 80);
  });

  ngOnInit(): void {
    const item = findShopItem(this._route.snapshot.paramMap.get("itemId"));
    this.item.set(item);
    this.setMetaTags(item);

    const checkout = this._route.snapshot.queryParamMap.get("checkout");
    if (checkout === "success" || checkout === "cancelled") {
      this.checkoutState.set(checkout);
    }
  }

  selectStickerPack(productId: SupportShopProductId): void {
    this.selectedStickerPackId.set(productId);
  }

  async addDirectSupportToCart(): Promise<void> {
    await submit(this.supportForm, async () => {
      const { amountChf, displayName } = this.supportModel();
      const cleanedDisplayName = displayName.trim();
      this._cart.addDirectSupport({
        amountChf,
        displayName: cleanedDisplayName,
      });
      this._analytics.trackEvent("shop_cart_updated", {
        item_kind: "direct_support",
        amount_bucket: amountBucket(amountChf),
        has_display_name: !!cleanedDisplayName,
      });
      void this._router.navigate(["/shop/cart"]);
    });
  }

  addStickerPackToCart(): void {
    const productId = this.selectedStickerPack().id;
    this._cart.addStickerPack(productId);
    this._analytics.trackEvent("shop_cart_updated", { product_id: productId });
    void this._router.navigate(["/shop/cart"]);
  }

  private setMetaTags(item: ReturnType<typeof findShopItem>): void {
    if (!item) {
      this._metaTagService.setStaticPageMetaTags(
        "Shop item not found",
        "This PK Spot shop item is not available.",
        undefined,
        "/shop",
      );
      return;
    }
    this._metaTagService.setStaticPageMetaTags(
      `${item.name} | PK Spot Shop`,
      item.description,
      undefined,
      `/shop/item/${item.id}`,
    );
  }

}

function amountBucket(amount: number): "10-24" | "25-49" | "50-100" {
  if (amount < 25) return "10-24";
  return amount < 50 ? "25-49" : "50-100";
}
