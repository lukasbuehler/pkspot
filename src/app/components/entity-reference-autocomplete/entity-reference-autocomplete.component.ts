import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { debounceTime, distinctUntilChanged, map } from "rxjs/operators";
import type { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SearchService } from "../../services/search.service";
import type { EventSearchPreview } from "../../services/search.service";

export type EntityReferenceKind = "spot" | "event";

export interface EntityReferenceOption {
  id: string;
  label: string;
  subtitle: string;
}

@Component({
  selector: "app-entity-reference-autocomplete",
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: "./entity-reference-autocomplete.component.html",
  styleUrl: "./entity-reference-autocomplete.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityReferenceAutocompleteComponent {
  private readonly _searchService = inject(SearchService);
  private _searchRequestId = 0;
  private _resolveRequestId = 0;

  readonly kind = input.required<EntityReferenceKind>();
  readonly value = input("");
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  readonly searchControl = new FormControl<string | EntityReferenceOption>("", {
    nonNullable: true,
  });
  readonly results = signal<EntityReferenceOption[]>([]);
  readonly selected = signal<EntityReferenceOption | null>(null);
  readonly searching = signal(false);
  readonly resolvingSelection = signal(false);
  readonly query = signal("");

  readonly icon = computed(() => (this.kind() === "spot" ? "place" : "event"));
  readonly fieldLabel = computed(() =>
    this.kind() === "spot"
      ? $localize`:@@community.destination_spot_search_label:Search for a spot`
      : $localize`:@@community.destination_event_search_label:Search for an event`,
  );
  readonly placeholder = computed(() =>
    this.kind() === "spot"
      ? $localize`:@@community.destination_spot_search_placeholder:Start typing a spot name or place`
      : $localize`:@@community.destination_event_search_placeholder:Start typing an event name`,
  );
  readonly emptyLabel = computed(() =>
    this.kind() === "spot"
      ? $localize`:@@community.destination_spot_search_empty:No matching spots found`
      : $localize`:@@community.destination_event_search_empty:No matching events found`,
  );

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        map((value) => (typeof value === "string" ? value.trim() : "")),
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((query) => {
        this.query.set(query);
        void this._search(query);
      });

    effect(() => {
      const id = this.value().trim();
      const kind = this.kind();
      if (!id) {
        this._resolveRequestId += 1;
        this.selected.set(null);
        this.resolvingSelection.set(false);
        return;
      }
      if (this.selected()?.id === id) {
        return;
      }
      void this._resolveSelection(kind, id);
    });

    effect(() => {
      if (this.disabled()) {
        this.searchControl.disable({ emitEvent: false });
      } else {
        this.searchControl.enable({ emitEvent: false });
      }
    });
  }

  displayOption(option: EntityReferenceOption | string | null): string {
    return typeof option === "string" ? option : (option?.label ?? "");
  }

  selectOption(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as EntityReferenceOption;
    this.selected.set(option);
    this.results.set([]);
    this.searchControl.setValue(option, { emitEvent: false });
    this.valueChange.emit(option.id);
  }

  clearSelection(): void {
    this.selected.set(null);
    this.results.set([]);
    this.searchControl.setValue("", { emitEvent: false });
    this.query.set("");
    this.valueChange.emit("");
  }

  private async _search(query: string): Promise<void> {
    const requestId = ++this._searchRequestId;
    if (query.length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    const results =
      this.kind() === "spot"
        ? await this._searchSpots(query)
        : await this._searchEvents(query);
    if (requestId !== this._searchRequestId) {
      return;
    }
    this.results.set(results);
    this.searching.set(false);
  }

  private async _searchSpots(query: string): Promise<EntityReferenceOption[]> {
    const result = await this._searchService.searchSpots(query);
    return result.hits
      .map((hit) => {
        const preview =
          (hit as { preview?: SpotPreviewData }).preview ??
          this._searchService.getSpotPreviewFromHit(hit);
        return this._spotOption(preview);
      })
      .filter((option): option is EntityReferenceOption => option !== null);
  }

  private async _searchEvents(query: string): Promise<EntityReferenceOption[]> {
    return (await this._searchService.searchEvents(query)).map((event) =>
      this._eventOption(event),
    );
  }

  private async _resolveSelection(
    kind: EntityReferenceKind,
    id: string,
  ): Promise<void> {
    const requestId = ++this._resolveRequestId;
    this.resolvingSelection.set(true);
    let option: EntityReferenceOption | null = null;

    if (kind === "spot") {
      const previews = await this._searchService.searchSpotPreviewsByIds([id]);
      option = previews[0] ? this._spotOption(previews[0]) : null;
      if (!option) {
        option =
          (await this._searchSpots(id)).find(
            (candidate) => candidate.id === id,
          ) ?? null;
      }
    } else {
      const previews = await this._searchService.getEventPreviewsByIds([id]);
      option = previews[0] ? this._eventOption(previews[0]) : null;
      if (!option) {
        option =
          (await this._searchEvents(id)).find((candidate) => candidate.id === id) ??
          null;
      }
    }

    if (requestId !== this._resolveRequestId) {
      return;
    }
    this.selected.set(
      option
        ? { ...option, id }
        : {
            id,
            label: id,
            subtitle: $localize`:@@community.destination_saved_reference:Saved selection`,
          },
    );
    this.resolvingSelection.set(false);
  }

  private _spotOption(preview: SpotPreviewData): EntityReferenceOption | null {
    const id = preview.slug || preview.id;
    if (!id) {
      return null;
    }
    return {
      id,
      label:
        preview.name ||
        $localize`:@@community.destination_unnamed_spot:Unnamed spot`,
      subtitle:
        preview.locality ||
        preview.countryName ||
        $localize`:@@community.destination_pk_spot:PK Spot`,
    };
  }

  private _eventOption(event: EventSearchPreview): EntityReferenceOption {
    return {
      id: event.slug || event.id,
      label: event.name,
      subtitle:
        event.venueString ||
        event.localityString ||
        $localize`:@@community.destination_pk_event:PK Spot event`,
    };
  }
}
