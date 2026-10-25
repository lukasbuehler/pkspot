import { Injectable, inject } from "@angular/core";
import type {
  SupportOrderPaymentStatus,
  SupportOrderType,
  SupportShopProductId,
  SupporterCreditInput,
} from "../../db/schemas/SupportShopSchema";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

interface DirectSupportCheckoutItemRequest {
  kind: "direct_support";
  amountChf: number;
  supporterCredit: SupporterCreditInput;
}

interface PhysicalOrderCheckoutItemRequest {
  kind: "physical_order";
  productId: SupportShopProductId;
  supporterCredit: SupporterCreditInput;
}

export type CreateSupportCheckoutItemRequest =
  | DirectSupportCheckoutItemRequest
  | PhysicalOrderCheckoutItemRequest;

export interface CreateSupportCheckoutRequest {
  items: readonly CreateSupportCheckoutItemRequest[];
  checkoutDestination: "cart";
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

/** A signed-in customer's order history deliberately excludes address and email data. */
export interface MySupportOrderListItem {
  id: string;
  kind: SupportOrderType;
  createdAtMillis: number;
  paidAtMillis?: number;
  amountRappen: number;
  paymentStatus: SupportOrderPaymentStatus;
  productName?: string;
  stickerCount?: number;
  fulfillmentStatus?: "unfulfilled" | "fulfilled";
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

  listMyOrders(): Promise<MySupportOrderListItem[]> {
    return this._functions.callAuthenticatedAppChecked<
      Record<string, never>,
      MySupportOrderListItem[]
    >("listMySupportOrders", {});
  }

  markPhysicalOrderFulfilled(orderId: string): Promise<void> {
    return this._functions.callAuthenticatedAppChecked<
      { orderId: string },
      void
    >("markSupportOrderFulfilled", { orderId });
  }
}
