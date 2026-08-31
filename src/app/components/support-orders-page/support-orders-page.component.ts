import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subscription } from "rxjs";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  SupportShopService,
} from "../../services/support-shop.service";
import type { SupportOrderListItem } from "../../services/support-shop.service";

type DisplaySupportOrder = SupportOrderListItem & { amountLabel: string };

@Component({
  selector: "app-support-orders-page",
  imports: [
    RouterLink,
    SystemDatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: "./support-orders-page.component.html",
  styleUrl: "./support-orders-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportOrdersPageComponent implements OnDestroy {
  private readonly _shop = inject(SupportShopService);
  private readonly _snackBar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);
  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly isLoading = signal(false);
  readonly fulfillingOrderId = signal("");
  readonly orders = signal<DisplaySupportOrder[]>([]);
  private readonly _authSubscription: Subscription;

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.isAdmin();
      this.isAdmin.set(isAdmin);
      if (isAdmin) {
        void this.reload();
      } else {
        this.orders.set([]);
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    if (!this.isAdmin() || this.isLoading()) return;
    this.isLoading.set(true);
    try {
      this.orders.set(
        (await this._shop.listPhysicalOrders()).map((order) => ({
          ...order,
          amountLabel: `CHF ${(order.amountRappen / 100).toFixed(2)}`,
        })),
      );
    } catch (error) {
      console.error("Could not load PK Spot shop orders", error);
      this._snackBar.open("Could not load shop orders.", undefined, {
        duration: 4_000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async markFulfilled(order: DisplaySupportOrder): Promise<void> {
    if (order.fulfillmentStatus === "fulfilled" || this.fulfillingOrderId()) {
      return;
    }
    if (
      !globalThis.confirm(
        "Mark this sticker order as fulfilled? This records that it has been packed and sent.",
      )
    ) {
      return;
    }

    this.fulfillingOrderId.set(order.id);
    try {
      await this._shop.markPhysicalOrderFulfilled(order.id);
      await this.reload();
      this._snackBar.open("Sticker order marked fulfilled.", undefined, {
        duration: 3_000,
      });
    } catch (error) {
      console.error("Could not mark PK Spot shop order fulfilled", error);
      this._snackBar.open("Could not update this shop order.", undefined, {
        duration: 4_000,
      });
    } finally {
      this.fulfillingOrderId.set("");
    }
  }
}
