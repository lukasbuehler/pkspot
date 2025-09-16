import { Component } from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { MatAnchor } from "@angular/material/button";
import { NgOptimizedImage } from "@angular/common";

@Component({
  selector: "app-about-page",
  templateUrl: "./about-page.component.html",
  styleUrls: ["./about-page.component.scss"],
  imports: [MatAnchor, MatIcon, NgOptimizedImage],
})
export class AboutPageComponent {
  // Meta tags are now handled by the ContentResolver
}
