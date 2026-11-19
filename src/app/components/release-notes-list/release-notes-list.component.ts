import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { ReleaseNoteView } from "../../releases/release-view";

/**
 * The full bullet list of a release. The notes are written in English only,
 * so the list says so for screen readers and translation tools.
 */
@Component({
  selector: "app-release-notes-list",
  templateUrl: "./release-notes-list.component.html",
  styleUrl: "./release-notes-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseNotesListComponent {
  readonly notes = input.required<readonly ReleaseNoteView[]>();
}
