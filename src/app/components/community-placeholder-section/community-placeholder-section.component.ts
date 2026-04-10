import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatCardModule } from "@angular/material/card";

@Component({
  selector: "app-community-placeholder-section",
  imports: [MatCardModule],
  templateUrl: "./community-placeholder-section.component.html",
  styleUrl: "./community-placeholder-section.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPlaceholderSectionComponent {
  title = input.required<string>();
  description = input.required<string>();
}
