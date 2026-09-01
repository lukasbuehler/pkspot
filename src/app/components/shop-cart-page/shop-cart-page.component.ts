import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MetaTagService } from "../../services/meta-tag.service";
import { ShopCartService } from "../../services/shop-cart.service";
import { SupportShopService } from "../../services/support-shop.service";

@Component({
  selector: "app-shop-cart-page",
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: "./shop-cart-page.component.html",
  styleUrl: "./shop-cart-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopCartPageComponent implements OnInit {
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _shop = inject(SupportShopService);
  readonly cart = inject(ShopCartService);
  readonly checkoutAction = signal(false);
  readonly checkoutError = signal("");
  readonly checkoutState = signal<"success" | "cancelled" | "">("");

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      "My cart | PK Spot Shop",
      "Your selected PK Spot Sticker Support Pack.",
      undefined,
      "/shop/cart",
    );

    const checkout = this._route.snapshot.queryParamMap.get("checkout");
    if (checkout === "success" || checkout === "cancelled") {
      this.checkoutState.set(checkout);
      if (checkout === "success") this.cart.clear();
    }
  }

  async checkout(): Promise<void> {
    const product = this.cart.product();
    if (!product || this.checkoutAction()) return;

    this.checkoutAction.set(true);
    this.checkoutError.set("");
    try {
      const result = await this._shop.createCheckout({
        kind: "physical_order",
        productId: product.id,
        checkoutDestination: "cart",
        supporterCredit: { optedIn: false },
      });
      globalThis.location.assign(result.checkoutUrl);
    } catch (error) {
      console.error("Could not start PK Spot shop checkout", error);
      this.checkoutError.set(
        "Could not start secure checkout. Please try again or contact us if the problem continues.",
      );
    } finally {
      this.checkoutAction.set(false);
    }
  }

}
