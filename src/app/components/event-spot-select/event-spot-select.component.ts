import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
  resource,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import type { LocaleCode } from "../../../db/models/Interfaces";
import { SpotSelectionDataService } from "../../services/spot-selection-data.service";

export type EventSpotSelectionKind = "spot" | "inline_spot";

export interface SelectableInlineEventSpot {
  id: string;
  name: string;
  images?: readonly string[];
}

export interface EventSpotSelection {
  id: string;
  kind: EventSpotSelectionKind;
}

interface EventSpotOption extends EventSpotSelection {
  name: string;
  imageSrc: string;
}

@Component({
  selector: "app-event-spot-select",
  imports: [
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    NgTemplateOutlet,
  ],
  templateUrl: "./event-spot-select.component.html",
  styleUrl: "./event-spot-select.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSpotSelectComponent {
  private readonly spotData = inject(SpotSelectionDataService);
  private readonly locale = inject<LocaleCode>(LOCALE_ID);

  readonly spotIds = input<readonly string[]>([]);
  readonly inlineSpots = input<readonly SelectableInlineEventSpot[]>([]);
  readonly valueId = input("");
  readonly valueKind = input<EventSpotSelectionKind | "">("");
  readonly label = input($localize`Event Spot (optional)`);
  readonly disabled = input(false);
  readonly selectionChange = output<EventSpotSelection | null>();

  readonly storedSpots = resource({
    params: () => {
      const ids = this.spotIds();
      return ids.length > 0 ? ids : undefined;
    },
    loader: async ({ params }) =>
      Promise.all(
        params.map(async (id): Promise<EventSpotOption | null> => {
          try {
            const spot = await this.spotData.resolve(id, this.locale);
            return {
              id,
              kind: "spot",
              name: spot.name(),
              imageSrc: spot.previewImageSrc(),
            };
          } catch (error) {
            console.warn(`Could not load event Spot ${id}`, error);
            return null;
          }
        }),
      ),
  });

  readonly inlineOptions = computed<EventSpotOption[]>(() =>
    this.inlineSpots().map((spot) => ({
      id: spot.id,
      kind: "inline_spot",
      name: spot.name,
      imageSrc: spot.images?.[0] ?? "",
    })),
  );
  readonly storedOptions = computed(() =>
    (this.storedSpots.value() ?? []).filter(
      (spot): spot is EventSpotOption => spot !== null,
    ),
  );
  readonly options = computed(() => [
    ...this.storedOptions(),
    ...this.inlineOptions(),
  ]);
  readonly selectedOption = computed(() => {
    const id = this.valueId();
    const kind = this.valueKind();
    return (
      this.options().find(
        (option) => option.id === id && (!kind || option.kind === kind),
      ) ?? null
    );
  });
  readonly selectedKey = computed(() => this.optionKey(this.selectedOption()));

  selectionChanged(key: string): void {
    const option = this.options().find((candidate) => this.optionKey(candidate) === key);
    this.selectionChange.emit(option ? { id: option.id, kind: option.kind } : null);
  }

  optionKey(option: EventSpotOption | null): string {
    return option ? `${option.kind}:${option.id}` : "";
  }
}
