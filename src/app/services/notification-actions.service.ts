import { Injectable, inject } from "@angular/core";
import type {
  NotificationActionId,
  PerformNotificationActionRequest,
  PerformNotificationActionResponse,
} from "../../db/schemas/NotificationSchema";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

@Injectable({ providedIn: "root" })
export class NotificationActionsService {
  private readonly functions = inject(FunctionsAdapterService);

  perform(
    notificationId: string,
    actionId: NotificationActionId,
  ): Promise<PerformNotificationActionResponse> {
    return this.functions.call<
      PerformNotificationActionRequest,
      PerformNotificationActionResponse
    >("performNotificationAction", { notificationId, actionId });
  }
}
