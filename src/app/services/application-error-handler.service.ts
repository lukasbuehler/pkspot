import { ErrorHandler, Injectable, inject } from "@angular/core";
import { AnalyticsService } from "./analytics.service";

@Injectable()
export class ApplicationErrorHandler implements ErrorHandler {
  private readonly analytics = inject(AnalyticsService);

  handleError(error: unknown): void {
    this.analytics.reportError(error, {
      context: "angular_global_error_handler",
      feature: "app",
      action: "uncaught_error",
      severity: "fatal",
      handled: false,
      userFacing: true,
    });

    console.error(error);
  }
}
