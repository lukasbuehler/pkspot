import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatRippleModule } from "@angular/material/core";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";

@Component({
  selector: "app-entity-preview-card",
  imports: [
    NgOptimizedImage,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatRippleModule,
    MediaPlaceholderComponent,
  ],
  templateUrl: "./entity-preview-card.component.html",
  styleUrl: "./entity-preview-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityPreviewCardComponent {
  title = input.required<string>();
  subtitle = input<string>("");
  meta = input<string>("");
  icon = input<string>("");
  badgeIcon = input<string>("");
  imageSrc = input<string | null | undefined>(null);
  imageAlt = input<string>("");
  imageFit = input<"cover" | "contain">("cover");
  imageAccentColor = input<string | null | undefined>(null);
  fallbackLabel = input<string>("");
  isCompact = input<boolean>(false);
  clickable = input<boolean>(false);
  dismissable = input<boolean>(false);
  dismiss = output<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}
