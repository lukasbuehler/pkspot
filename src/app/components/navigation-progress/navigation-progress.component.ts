import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { MatProgressBar } from "@angular/material/progress-bar";
import { Router } from "@angular/router";

/**
 * A thin bar at the top of the window while the router is still loading the
 * next page, e.g. its code on a slow connection, so a tap never seems to do
 * nothing. Quick navigations finish before the bar fades in (see styles).
 */
@Component({
  selector: "app-navigation-progress",
  templateUrl: "./navigation-progress.component.html",
  styleUrl: "./navigation-progress.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBar],
})
export class NavigationProgressComponent {
  private readonly router = inject(Router);

  readonly navigating = computed(() => this.router.currentNavigation() !== null);
}
