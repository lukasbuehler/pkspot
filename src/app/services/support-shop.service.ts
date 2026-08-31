import { Injectable, inject } from "@angular/core";
import type {
  SupportOrderType,
  SupportShopProductId,
  SupporterCreditInput,
} from "../../db/schemas/SupportShopSchema";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

export interface CreateSupportCheckoutRequest {
  kind: SupportOrderType;
  amountChf?: number;
  productId?: SupportShopProductId;
  supporterCredit: SupporterCreditInput;
}

export interface SupportCheckoutResponse {
  checkoutUrl: string;
}

export interface SupportOrderListItem {
  id: string;
  createdAtMillis: number;
  paidAtMillis: number;
  productName: string;
  stickerCount: number;
  amountRappen: number;
  customerEmail?: string;
  shipping?: {
    name?: string;
    line1?: string;
    line2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
  fulfillmentStatus: "unfulfilled" | "fulfilled";
  fulfilledAtMillis?: number;
}

@Injectable({ providedIn: "root" })
export class SupportShopService {
  private readonly _functions = inject(FunctionsAdapterService);

  createCheckout(
    request: CreateSupportCheckoutRequest,
  ): Promise<SupportCheckoutResponse> {
    return this._functions.callPublic<
      CreateSupportCheckoutRequest,
      SupportCheckoutResponse
    >("createSupportCheckout", request);
  }

  listPhysicalOrders(): Promise<SupportOrderListItem[]> {
    return this._functions.callAuthenticatedAppChecked<
      Record<string, never>,
      SupportOrderListItem[]
    >("listSupportOrders", {});
  }

  markPhysicalOrderFulfilled(orderId: string): Promise<void> {
    return this._functions.callAuthenticatedAppChecked<
      { orderId: string },
      void
    >("markSupportOrderFulfilled", { orderId });
  }
}
