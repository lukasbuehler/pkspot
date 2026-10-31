import { APP_ID, LOCALE_ID, enableProdMode } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideAnimations } from "@angular/platform-browser/animations";
import { environment } from "../../environments/environment.default";
import { WelcomeStartupComponent } from "./welcome-startup/welcome-startup.component";

export async function bootstrapWelcome(): Promise<void> {
  if (environment.production) enableProdMode();
  const host = document.createElement("app-welcome-startup");
  document.body.appendChild(host);
  try {
    const app = await bootstrapApplication(WelcomeStartupComponent, {
      providers: [
        // Do not consume the main app's hydration state or own its SSR styles.
        { provide: APP_ID, useValue: "pkspot-welcome" },
        { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
        provideAnimations(),
      ],
    });
    app.onDestroy(() => host.remove());
  } catch (error) {
    host.remove();
    throw error;
  }
}
