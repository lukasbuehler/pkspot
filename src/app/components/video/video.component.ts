import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { VideoMedia } from "../../../db/models/Media";

@Component({
  selector: "app-video",
  imports: [],
  templateUrl: "./video.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./video.component.scss",
})
export class VideoComponent {
  media = input<VideoMedia | null | undefined>(undefined);
}
