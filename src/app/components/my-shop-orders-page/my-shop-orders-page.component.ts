import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { RouterLink } from "@angular/router";
import { distinctUntilChanged, map } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import {
  type MySupportOrderListItem,
  SupportShopService,
} from "../../services/support-shop.service";

type DisplayShopOrder = MySupportOrderListItem & {
  title: string;
  paymentStatusLabel: string;
  amountLabel: string;
};

@Component({
  selector: "app-my-shop-orders-page",
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: "./my-shop-orders-page.component.html",
  styleUrl: "./my-shop-orders-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyShopOrdersPageComponent implements OnInit {
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  private readonly _destroyRef = inject(DestroyRef);
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _shop = inject(SupportShopService);
  readonly auth = inject(AuthenticationService);
  readonly orders = signal<DisplayShopOrder[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    this.auth.authState$
      .pipe(
        map((user) => user?.uid ?? null),
        distinctUntilChanged(),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe(() => void this.load());
  }

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      "My orders | PK Spot Shop",
      "Your PK Spot support and sticker orders.",
      undefined,
      "/shop/my-orders",
    );
  }

  async load(): Promise<void> {
    if (!this.auth.isSignedIn) {
      this.orders.set([]);
      this.failed.set(false);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.failed.set(false);
    try {
      this.orders.set((await this._shop.listMyOrders()).map(toDisplayOrder));
    } catch (error) {
      this.featureTelemetry.failure("my-shop-orders-page", "load", error);
      console.error("Could not load PK Spot shop orders", error);
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

function toDisplayOrder(order: MySupportOrderListItem): DisplayShopOrder {
  return {
    ...order,
    title: order.productName ?? "Support PK Spot",
    paymentStatusLabel: paymentStatusLabel(order.paymentStatus),
    amountLabel: `CHF ${(order.amountRappen / 100).toFixed(2)}`,
  };
}

function paymentStatusLabel(
  paymentStatus: MySupportOrderListItem["paymentStatus"],
): string {
  switch (paymentStatus) {
    case "paid":
      return "Paid";
    case "failed":
      return "Payment failed";
    default:
      return "Payment pending";
  }
}
