import {
  ChangeDetectionStrategy,
  Component,
  input,
  computed,
} from "@angular/core";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatIconModule } from "@angular/material/icon";
import { SpotActivityService } from "../../services/firebase/firestore/spot-activity.service";

@Component({
  selector: "app-spot-activity-summary",
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: "./spot-activity-summary.component.html",
  styleUrl: "./spot-activity-summary.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotActivitySummaryComponent {
  readonly compact = input(false);
  readonly spotId = input<string | null>(null);
  readonly activityMin = input<number | null | undefined>(null);
  readonly recentCount = computed(() => {
    const count = this.spotActivity.displayMin(this.spotId(), this.activityMin());
    return count ? `${count}+` : null;
  });

  constructor(private readonly spotActivity: SpotActivityService) {}
}
