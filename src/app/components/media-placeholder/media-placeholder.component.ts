import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { NgOptimizedImage } from "@angular/common";

@Component({
  selector: "app-media-placeholder",
  templateUrl: "./media-placeholder.component.html",
  styleUrls: ["./media-placeholder.component.scss"],
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPlaceholderComponent {
  src = input("assets/spot_placeholder.png");
  showLabel = input(true);
}
