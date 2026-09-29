import { SpotSelectionDataService } from "../../services/spot-selection-data.service";
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, LOCALE_ID, resource, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { LogEntryDocument } from '../../../db/schemas/LogEntrySchema';
import type { SessionRecordDocument } from '../../../db/schemas/SessionRecordSchema';
import { SystemDatePipe } from '../../pipes/system-date.pipe';

const STORAGE_KEY = 'pkspot.dismissed-check-in-prompts';

@Component({
  selector: 'app-check-in-log-prompt',
  imports: [RouterLink, MatButtonModule, MatIconModule, SystemDatePipe],
  templateUrl: './check-in-log-prompt.component.html',
  styleUrl: './check-in-log-prompt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInLogPromptComponent {
  readonly sessions = input.required<readonly SessionRecordDocument[]>();
  readonly logs = input.required<readonly LogEntryDocument[]>();
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dismissed = signal(this.readDismissed());
  readonly session = computed(() => {
    // Offer only the latest check-in, not a queue of old reminders after dismissal.
    const latest = this.sessions().filter(session => session.source === 'check_in')
      .reduce<SessionRecordDocument | null>((latest, session) =>
        !latest || session.started_at_raw_ms > latest.started_at_raw_ms ? session : latest, null);
    if (!latest || this.dismissed().includes(this.key(latest)) ||
      this.logs().some(log => log.session_record_ids.includes(latest.id))) return null;
    return latest;
  });
  private readonly spotData = inject(SpotSelectionDataService);
  private readonly locale = inject(LOCALE_ID);
  private readonly names = resource({
    params: () => this.session()?.spot_visits,
    loader: ({ params }) => this.spotData.resolveVisitNames(params, this.locale),
  });
  readonly place = computed(() => this.session()?.spot_visits.map(visit =>
    visit.spot_name || this.names.value()?.get(visit.spot_id) || $localize`:@@training.loadingSpot:Loading Spot…`
  ).join(', '));

  dismiss(): void {
    const session = this.session();
    if (!session) return;
    this.dismissed.update(keys => [...keys, this.key(session)].slice(-200));
    // This is a device-local preference, never a deletion of private history.
    try { if (this.browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dismissed())); } catch { /* Storage can be unavailable. Dismiss for this visit. */ }
  }

  private key(session: SessionRecordDocument): string {
    return JSON.stringify([session.owner_id, session.id]);
  }

  private readDismissed(): string[] {
    try {
      const value: unknown = this.browser ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') : [];
      return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string').slice(-200) : [];
    } catch { return []; }
  }
}
