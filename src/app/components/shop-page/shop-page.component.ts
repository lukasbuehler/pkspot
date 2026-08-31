import { NgOptimizedImage } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { SHOP_CATALOG } from "../../features/shop-catalog";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";

@Component({
  selector: "app-shop-page",
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: "./shop-page.component.html",
  styleUrl: "./shop-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopPageComponent implements OnInit {
  private readonly _metaTagService = inject(MetaTagService);
  readonly authService = inject(AuthenticationService);
  readonly items = SHOP_CATALOG;

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      "PK Spot Shop",
      "Sticker Support Packs and ways to support PK Spot.",
      undefined,
      "/shop",
    );
  }
}
