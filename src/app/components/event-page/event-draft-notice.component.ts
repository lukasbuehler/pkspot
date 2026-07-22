import { ChangeDetectionStrategy, Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-event-draft-notice",
  imports: [MatIconModule],
  templateUrl: "./event-draft-notice.component.html",
  styleUrl: "./event-draft-notice.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDraftNoticeComponent {}
