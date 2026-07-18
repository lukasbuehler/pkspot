import { Component, inject, input, ChangeDetectionStrategy } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-code-block",
  templateUrl: "./code-block.component.html",
  styleUrl: "./code-block.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
})
export class CodeBlockComponent {
  readonly code = input("");
  readonly analyticsEventName = input<string | null>(null);
  readonly analyticsProperties = input<Record<string, unknown>>({});

  _snackBar = inject(MatSnackBar);
  private _analytics = inject(AnalyticsService);

  copy() {
    const code = this.code();
    const analyticsEventName = this.analyticsEventName();

    navigator.clipboard.writeText(code).then(() => {
      // optional: add feedback logic here
      console.log("Code copied to clipboard!");
    });

    if (analyticsEventName) {
      this._analytics.trackEvent(analyticsEventName, {
        ...this.analyticsProperties(),
        code_length: code.length,
      });
    }

    this._snackBar.open("Copied to clipboard!", "", {
      duration: 2000,
      horizontalPosition: "center",
      verticalPosition: "top",
    });
  }
}
