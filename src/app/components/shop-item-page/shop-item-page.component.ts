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
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type {
  SupportOrderType,
  SupportShopProductId,
} from "../../../db/schemas/SupportShopSchema";
import { STICKER_PACK_SIZES, findShopItem } from "../../features/shop-catalog";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SupportShopService } from "../../services/support-shop.service";

@Component({
  selector: "app-shop-item-page",
  imports: [
    FormField,
    NgOptimizedImage,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
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
  private readonly _shop = inject(SupportShopService);

  readonly checkoutAction = signal<SupportOrderType | "">("");
  readonly checkoutError = signal("");
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
    publicName: "",
  });
  readonly supportForm = form(this.supportModel, (schema) => {
    min(schema.amountChf, 10);
    max(schema.amountChf, 100);
    maxLength(schema.publicName, 80);
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

  async startDirectSupportCheckout(): Promise<void> {
    await submit(this.supportForm, async () => {
      await this.startCheckout({
        kind: "direct_support",
        amountChf: this.supportModel().amountChf,
      });
    });
  }

  async startStickerPackCheckout(): Promise<void> {
    await this.startCheckout({
      kind: "physical_order",
      productId: this.selectedStickerPack().id,
    });
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

  private async startCheckout(
    request:
      | { kind: "direct_support"; amountChf: number }
      | { kind: "physical_order"; productId: SupportShopProductId },
  ): Promise<void> {
    if (this.checkoutAction()) return;

    const model = this.supportModel();
    const publicName = model.publicName.trim();
    this.checkoutAction.set(request.kind);
    this.checkoutError.set("");
    try {
      const result = await this._shop.createCheckout({
        ...request,
        supporterCredit: {
          optedIn: !!publicName,
          ...(publicName ? { publicName } : {}),
        },
      });
      this._analytics.trackEvent("support_checkout_started", {
        support_type: request.kind,
        ...(request.kind === "physical_order"
          ? { product_id: request.productId }
          : { amount_bucket: amountBucket(request.amountChf) }),
        supporter_credit_opt_in: !!publicName,
      });
      globalThis.location.assign(result.checkoutUrl);
    } catch (error) {
      console.error("Could not start PK Spot shop checkout", error);
      this.checkoutError.set(
        "Could not start secure checkout. Please try again or contact us if the problem continues.",
      );
      this._analytics.trackEvent("support_checkout_failed", {
        support_type: request.kind,
      });
    } finally {
      this.checkoutAction.set("");
    }
  }
}

function amountBucket(amount: number): "10-24" | "25-49" | "50-100" {
  if (amount < 25) return "10-24";
  return amount < 50 ? "25-49" : "50-100";
}
