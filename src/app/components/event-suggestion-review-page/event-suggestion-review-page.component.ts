import {ChangeDetectionStrategy, Component, computed, inject, resource, signal} from "@angular/core";
import {RouterLink} from "@angular/router";
import {MatButtonModule} from "@angular/material/button";
import {MatButtonToggleModule} from "@angular/material/button-toggle";
import {MatExpansionModule} from "@angular/material/expansion";
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatIconModule} from "@angular/material/icon";
import {MatInputModule} from "@angular/material/input";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";
import {MatSnackBar} from "@angular/material/snack-bar";
import {AuthenticationService} from "../../services/firebase/authentication.service";
import {EventSuggestionsService} from "../../services/event-suggestions.service";
import {DateTimeFormatService} from "../../services/date-time-format.service";
import {SystemDatePipe} from "../../pipes/system-date.pipe";
import type {EventSuggestionQueueItem, EventSuggestionSchema} from "../../../db/schemas/EventSuggestionSchema";

type Status = EventSuggestionSchema["status"];

@Component({
  selector: "app-event-suggestion-review-page",
  imports: [RouterLink, MatButtonModule, MatButtonToggleModule, MatExpansionModule,
    MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, SystemDatePipe],
  templateUrl: "./event-suggestion-review-page.component.html",
  styleUrl: "./event-suggestion-review-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSuggestionReviewPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly suggestions = inject(EventSuggestionsService);
  private readonly dates = inject(DateTimeFormatService);
  private readonly snackbar = inject(MatSnackBar);
  readonly authResolved = this.auth.initialAuthStateResolved;
  readonly isAdmin = this.auth.isAdmin;
  readonly status = signal<Status>("submitted");
  readonly savingId = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly notes = signal<Record<string, string>>({});
  readonly queue = resource({
    params: () => this.authResolved() && this.isAdmin() ? this.status() : undefined,
    loader: ({params}) => this.suggestions.list(params),
  });
  readonly items = computed(() => (this.queue.hasValue() ? this.queue.value().items : []).map((item) => ({
    ...item,
    locationLabel: [item.locality_string, item.country_code].filter(Boolean).join(", "),
    startLabel: this.dates.format(item.start, {dateStyle: "medium", timeStyle: "short", timeZone: item.time_zone}),
    endLabel: this.dates.format(item.end, {dateStyle: "medium", timeStyle: "short", timeZone: item.time_zone}),
  })));
  readonly hasMore = computed(() => this.queue.hasValue() && !!this.queue.value().nextCursor);

  setStatus(value: unknown): void {
    if (value === "submitted" || value === "approved" || value === "rejected") this.status.set(value);
  }

  setNote(id: string, value: string): void {
    this.notes.update((notes) => ({...notes, [id]: value}));
  }

  async loadMore(): Promise<void> {
    if (!this.isAdmin() || !this.queue.hasValue() || this.loadingMore()) return;
    const cursor = this.queue.value().nextCursor;
    if (!cursor) return;
    const status = this.status();
    this.loadingMore.set(true);
    try {
      const next = await this.suggestions.list(status, cursor);
      if (this.status() === status && this.queue.hasValue()) {
        this.queue.update((current) => current ? {...next, items: [...current.items, ...next.items.filter((item) => !current.items.some((existing) => existing.id === item.id))]} : next);
      }
    } catch {
      this.showError();
    } finally { this.loadingMore.set(false); }
  }

  async review(item: EventSuggestionQueueItem, outcome: "approved" | "rejected"): Promise<void> {
    if (!this.isAdmin() || this.savingId() || item.status !== "submitted") return;
    this.savingId.set(item.id);
    try {
      await this.suggestions.review(item.id, outcome, this.notes()[item.id] ?? "");
      if (this.status() === "submitted" && this.queue.hasValue()) {
        this.queue.update((current) => current ? {...current, items: current.items.filter((entry) => entry.id !== item.id)} : current);
      }
      this.snackbar.open(outcome === "approved"
        ? $localize`:@@event_suggestions.approved_notice:Suggestion approved and published.`
        : $localize`:@@event_suggestions.rejected_notice:Suggestion rejected.`, undefined, {duration: 4000});
    } catch {
      this.showError();
      this.queue.reload();
    } finally { this.savingId.set(null); }
  }

  private showError(): void {
    this.snackbar.open($localize`:@@event_suggestions.review_error:Could not update the queue. Refresh and try again.`, undefined, {duration: 5000});
  }
}
