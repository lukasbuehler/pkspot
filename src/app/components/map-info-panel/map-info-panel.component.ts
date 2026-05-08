import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatRippleModule } from "@angular/material/core";
import { MatTooltipModule } from "@angular/material/tooltip";

@Component({
  selector: "app-map-info-panel",
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
  ],
  templateUrl: "./map-info-panel.component.html",
  styleUrl: "./map-info-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[style.--open-progress]": "openProgress()",
  },
})
export class MapInfoPanelComponent {
  title = input.required<string>();
  titleTooltip = input<string>("");
  typeLabel = input<string>("");
  icon = input<string>("");
  iconTooltip = input<string>("");
  dismissTooltip = input<string>("Close");
  dismissable = input<boolean>(false);
  clickable = input<boolean>(false);
  border = input<boolean>(false);
  openProgress = input<number>(1);

  dismiss = output<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}
