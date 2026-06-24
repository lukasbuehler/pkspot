import { Component, inject, Input, ChangeDetectionStrategy } from "@angular/core";
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
  @Input() code: string = "";
  @Input() analyticsEventName: string | null = null;
  @Input() analyticsProperties: Record<string, unknown> = {};

  _snackBar = inject(MatSnackBar);
  private _analytics = inject(AnalyticsService);

  copy() {
    navigator.clipboard.writeText(this.code).then(() => {
      // optional: add feedback logic here
      console.log("Code copied to clipboard!");
    });

    if (this.analyticsEventName) {
      this._analytics.trackEvent(this.analyticsEventName, {
        ...this.analyticsProperties,
        code_length: this.code.length,
      });
    }

    this._snackBar.open("Copied to clipboard!", "", {
      duration: 2000,
      horizontalPosition: "center",
      verticalPosition: "top",
    });
  }
}
