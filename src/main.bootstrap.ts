import { enableProdMode } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";
import { environment } from "./environments/environment.default";
import { EARLY_WELCOME_CONTEXT, type EarlyWelcomeContext } from "./app/startup/welcome-acceptance";

export function bootstrap(context?: EarlyWelcomeContext) {
  if (environment.production) {
    enableProdMode();
  }

  return bootstrapApplication(AppComponent, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      ...(context ? [{ provide: EARLY_WELCOME_CONTEXT, useValue: context }] : []),
    ],
  });
}
