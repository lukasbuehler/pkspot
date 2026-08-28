import {
  ChangeDetectionStrategy,
  Component,
  input,
  resource,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { SpotActivityService } from "../../services/firebase/firestore/spot-activity.service";

@Component({
  selector: "app-spot-activity-summary",
  imports: [MatIconModule],
  templateUrl: "./spot-activity-summary.component.html",
  styleUrl: "./spot-activity-summary.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotActivitySummaryComponent {
  readonly spotId = input<string | null>(null);
  readonly activity = resource({
    params: () => this.spotId(),
    loader: ({ params }) =>
      params ? this.spotActivity.get(params) : Promise.resolve(null),
  });

  constructor(private readonly spotActivity: SpotActivityService) {}
}
