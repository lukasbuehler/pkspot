import { isPlatformServer } from "@angular/common";
import { ChangeDetectionStrategy, Component, PLATFORM_ID, REQUEST, inject } from "@angular/core";
import { WelcomeContentComponent } from "../welcome-content/welcome-content.component";
import { WelcomeFrameComponent } from "../welcome-frame/welcome-frame.component";
import { shouldShowEarlyWelcome } from "../../startup/welcome-policy";

/**
 * Server-rendered copy of the first-visit welcome, so it paints with the HTML
 * rather than after JavaScript. It stays hidden unless the inline script in
 * `index.html` marks a first visit, so one cached page fits every visitor.
 *
 * The browser never hydrates it: the early welcome app hides it once its
 * interactive copy is up, and the main app re-renders this host empty.
 */
@Component({
  selector: "app-welcome-prerender",
  imports: [WelcomeContentComponent, WelcomeFrameComponent],
  templateUrl: "./welcome-prerender.component.html",
  host: { ngSkipHydration: "true" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomePrerenderComponent {
  private readonly request = inject(REQUEST, { optional: true });

  /** Path rules match `startBrowserApplication`; the browser checks the rest. */
  readonly render = isPlatformServer(inject(PLATFORM_ID)) && !!this.request &&
    shouldShowEarlyWelcome({
      pathname: new URL(this.request.url).pathname,
      acceptedVersion: null,
      native: false,
      bot: false,
      embedded: false,
      notFound: false,
    });
}
