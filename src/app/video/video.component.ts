import { Component, input } from "@angular/core";
import { VideoMedia } from "../../db/models/Media";

@Component({
  selector: "app-video",
  imports: [],
  templateUrl: "./video.component.html",
  styleUrl: "./video.component.scss",
})
export class VideoComponent {
  media = input<VideoMedia | null | undefined>(undefined);
}
