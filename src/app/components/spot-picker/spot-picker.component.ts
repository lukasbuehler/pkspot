import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  untracked,
} from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SearchFieldComponent } from "../search-field/search-field.component";

/**
 * Multi-spot picker that wraps `<app-search-field>` for autocomplete and
 * displays selected spots as chips with name + thumbnail.
 *
 * Designed for the event-edit form (and any future form that needs to
 * pick a list of spots), mirroring the homespots flow in
 * `edit-profile.component.ts` but extracted into a reusable component.
 *
 * Behavior:
 *  - `value` is the source of truth (an array of spot ids the parent owns).
 *  - When a user picks a spot via the autocomplete, we emit a new value
 *    with the picked id appended. Duplicates are ignored.
 *  - When a chip's remove button is clicked, we emit a new value without
 *    that id.
 *  - Spot names + thumbnails are resolved lazily via `SpotsService` and
 *    cached so a re-render doesn't refetch.
 */
@Component({
  selector: "app-spot-picker",
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SearchFieldComponent,
  ],
  templateUrl: "./spot-picker.component.html",
  styleUrl: "./spot-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPickerComponent {
  private _spotsService = inject(SpotsService);
  private _locale = inject<LocaleCode>(LOCALE_ID);

  /** Current list of selected spot IDs. Parent owns this list. */
  value = input<string[]>([]);

  /** Label shown above the search field. */
  label = input<string>("Add spot");

  /** Optional max-count safeguard. 0 means unlimited. */
  max = input<number>(0);

  /** Disable adds/removes (e.g., while parent is saving). */
  disabled = input<boolean>(false);

  /** Emits the new list whenever the user adds or removes a spot. */
  valueChange = output<string[]>();

  /** Cache of id → loaded Spot, so chips can show names + thumbnails. */
  private _spotCache = signal<Map<string, Spot>>(new Map());
  /** IDs currently being fetched (avoids duplicate requests). */
  private _inflight = new Set<string>();

  /**
   * Chip view-models: { id, spot? }. Order mirrors `value`. The `spot`
   * may be undefined while a fetch is in flight — the template shows a
   * spinner in that case.
   */
  readonly chips = computed(() => {
    const ids = this.value();
    const cache = this._spotCache();
    return ids.map((id) => ({ id, spot: cache.get(id) }));
  });

  /** True when the configured max would be hit by one more pick. */
  readonly isFull = computed(
    () => this.max() > 0 && this.value().length >= this.max()
  );

  constructor() {
    // Lazily resolve names + thumbnails for any IDs the parent hands in
    // that we haven't fetched yet.
    effect(() => {
      const ids = this.value();
      const cache = untracked(() => this._spotCache());
      const missing = ids.filter(
        (id) => !cache.has(id) && !this._inflight.has(id)
      );
      if (missing.length === 0) return;
      for (const id of missing) {
        this._inflight.add(id);
        this._spotsService
          .getSpotById(id as SpotId, this._locale)
          .then((spot) => {
            this._spotCache.update((map) => {
              const next = new Map(map);
              next.set(id, spot);
              return next;
            });
          })
          .catch(() => {
            // Leave it absent — chip will show fallback text instead.
          })
          .finally(() => this._inflight.delete(id));
      }
    });
  }

  onSpotSelected(selection: {
    type: "place" | "spot" | "community" | "event";
    id: string;
  }): void {
    if (this.disabled() || selection.type !== "spot") return;
    if (this.isFull()) return;
    const current = this.value();
    if (current.includes(selection.id)) return;
    this.valueChange.emit([...current, selection.id]);
  }

  remove(id: string): void {
    if (this.disabled()) return;
    this.valueChange.emit(this.value().filter((existing) => existing !== id));
  }
}
