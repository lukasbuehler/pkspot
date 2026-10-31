import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";

export interface WelcomeLinkRequest {
  event: MouseEvent;
  path: string;
}

/** Shared presentation for the early browser entry and the normal app dialog. */
@Component({
  selector: "app-welcome-dialog",
  imports: [MatButtonModule, MatDialogModule, MatIcon],
  templateUrl: "./welcome-content.component.html",
  styleUrl: "./welcome-content.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeContentComponent {
  readonly pending = input(false);
  readonly failed = input(false);
  readonly accepted = output<void>();
  readonly linkRequested = output<WelcomeLinkRequest>();

  accept(): void {
    if (!this.pending()) this.accepted.emit();
  }

  requestLink(event: MouseEvent, path: string): void {
    this.linkRequested.emit({ event, path });
  }
}
