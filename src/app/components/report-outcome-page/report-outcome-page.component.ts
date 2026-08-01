import { ChangeDetectionStrategy, Component, inject, resource } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { ReportOutcomeSchema } from "../../../db/schemas/ReportOutcomeSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FirestoreAdapterService } from "../../services/firebase/firestore-adapter.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_REPORT_OUTCOMES__?: Record<string, ReportOutcomeSchema>;
}

@Component({
  selector: 'app-report-outcome-page',
  imports: [MatButtonModule, MatIcon, MatProgressSpinner, RouterLink],
  templateUrl: "./report-outcome-page.component.html",
  styleUrl: "./report-outcome-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportOutcomePageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly route = inject(ActivatedRoute);
  private readonly user = toSignal(this.auth.authState$, { initialValue: null });
  private readonly outcomeId = this.route.snapshot.paramMap.get("outcomeId") ?? "";

  readonly outcome = resource({
    params: () => ({ uid: this.user()?.uid ?? "", outcomeId: this.outcomeId }),
    loader: ({ params }) => {
      const fixture = (globalThis as ScreenshotGlobal)
        .__PKSPOT_SCREENSHOT_REPORT_OUTCOMES__?.[params.outcomeId];
      if (fixture) return Promise.resolve(fixture);
      return params.uid && params.outcomeId
        ? this.firestore.getDocument<ReportOutcomeSchema>(
            `users/${params.uid}/report_outcomes/${params.outcomeId}`,
          )
        : Promise.resolve(null);
    },
  });
}
