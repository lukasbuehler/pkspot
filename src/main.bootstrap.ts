import { enableProdMode } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";
import { environment } from "./environments/environment.default";

export function bootstrap(): void {
  if (environment.production) {
    enableProdMode();
  }

  void bootstrapApplication(AppComponent, appConfig).catch(console.error);
}
