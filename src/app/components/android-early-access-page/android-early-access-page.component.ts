import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-android-early-access-page",
  templateUrl: "./android-early-access-page.component.html",
  styleUrls: ["./android-early-access-page.component.scss"],
  imports: [MatIconModule, MatButtonModule, MatCardModule, RouterLink],
})
export class AndroidEarlyAccessPageComponent {
  // Links - replace these with actual URLs
  readonly googleGroupUrl = "https://groups.google.com/g/pk-spot-testers";
  readonly playStoreTesterUrl =
    "https://play.google.com/apps/testing/com.pkspot.app";
  readonly playStoreUrl =
    "https://play.google.com/store/apps/details?id=com.pkspot.app";

  // Early access end date (12 days from now as mentioned)
  readonly earlyAccessEndDate = new Date("2026-01-30");

  get daysRemaining(): number {
    const now = new Date();
    const diffTime = this.earlyAccessEndDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
}
