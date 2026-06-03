import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { AgeAssuranceService } from "../../services/age-assurance.service";

@Component({
  selector: "app-contribution-status-note",
  imports: [MatIcon],
  template: `
    <div class="contribution-status-note" role="status">
      <mat-icon aria-hidden="true">info</mat-icon>
      <p class="mat-body-medium m-0">
        {{ ageAssurance.getContributionStatusMessage() }}
      </p>
    </div>
  `,
  styles: [
    `
      .contribution-status-note {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        background: var(--mat-sys-surface-container-low);
        color: var(--mat-sys-on-surface-variant);
      }

      mat-icon {
        color: var(--mat-sys-primary);
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributionStatusNoteComponent {
  readonly ageAssurance = inject(AgeAssuranceService);
}
