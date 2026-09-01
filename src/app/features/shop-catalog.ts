import {
  SUPPORT_SHOP_PRODUCTS,
  formatChf,
} from "../../db/schemas/SupportShopSchema";
export type ShopItemId = "support-pkspot" | "nice-sticker-support-pack";

export interface ShopCatalogItem {
  id: ShopItemId;
  name: string;
  description: string;
  icon: string;
  image?: {
    src: string;
    alt: string;
  };
  available: boolean;
  detail: string;
}

export const SHOP_CATALOG: readonly ShopCatalogItem[] = [
  {
    id: "nice-sticker-support-pack",
    name: "Nice Spot Sticker Support Pack",
    description:
      "PK Spot stickers for the real world, with Swiss shipping included.",
    icon: "sell",
    image: {
      src: "assets/shop/nice-spot-sticker.png",
      alt: "Nice spot. sticker",
    },
    available: true,
    detail: "5, 10, 25 or 50 stickers",
  },
  {
    id: "support-pkspot",
    name: "Support PK Spot",
    description: "Choose a one-time amount to help keep PK Spot moving.",
    icon: "volunteer_activism",
    available: true,
    detail: "CHF 10–100",
  },
];

export const STICKER_PACK_SIZES = SUPPORT_SHOP_PRODUCTS.map((product) => ({
  ...product,
  label: `${product.stickerCount} stickers`,
  priceLabel: formatChf(product.priceRappen),
}));

export function findShopItem(
  itemId: string | null,
): ShopCatalogItem | undefined {
  return SHOP_CATALOG.find((item) => item.id === itemId);
}
