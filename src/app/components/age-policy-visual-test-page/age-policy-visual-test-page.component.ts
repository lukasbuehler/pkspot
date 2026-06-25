import { ChangeDetectionStrategy, Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatDivider } from "@angular/material/divider";
import { MatIcon } from "@angular/material/icon";
import { ContributionStatusNoteComponent } from "../contribution-status-note/contribution-status-note.component";

@Component({
  selector: "app-age-policy-visual-test-page",
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDivider,
    MatIcon,
    ContributionStatusNoteComponent,
  ],
  templateUrl: "./age-policy-visual-test-page.component.html",
  styleUrl: "./age-policy-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgePolicyVisualTestPageComponent {}
