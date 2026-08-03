import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import {
  FabMenuAction,
  FabMenuComponent,
} from "../../fab-menu/fab-menu.component";

type MapCreateAction =
  | "spot"
  | "import-spots"
  | "event"
  | "session";

interface MapFabMenuAction extends FabMenuAction {
  id: MapCreateAction;
}

@Component({
  selector: "app-map-floating-controls",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    FabMenuComponent,
  ],
  templateUrl: "./map-floating-controls.component.html",
  styleUrl: "./map-floating-controls.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFloatingControlsComponent {
  readonly showControls = input(false);
  readonly showCreateSpot = input(false);
  readonly showImportSpots = input(false);
  readonly showCreateEvent = input(false);
  readonly showPlanSession = input(false);
  readonly showResetNorth = input(false);
  readonly mapStyle = input<"roadmap" | "satellite" | "hybrid" | "terrain" | null>(
    null,
  );
  readonly geolocationLoading = input(false);
  readonly geolocationIcon = input("my_location");

  readonly resetNorth = output<void>();
  readonly toggleMapStyle = output<void>();
  readonly focusGeolocation = output<void>();
  readonly createSpot = output<void>();
  readonly importSpots = output<void>();
  readonly createEvent = output<void>();
  readonly planSession = output<void>();

  readonly createMenuLabel = $localize`:@@map.create.open_tooltip:Create on the map`;
  readonly createActions = computed(() => {
    const actions: MapFabMenuAction[] = [];
    if (this.showCreateSpot()) {
      actions.push({
        id: "spot",
        icon: "add_location",
        label: $localize`:@@map.create.spot:Add Spot`,
      });
    }
    if (this.showImportSpots()) {
      actions.push({
        id: "import-spots",
        icon: "upload",
        label: $localize`:@@map.create.import_spots:Import spots`,
      });
    }
    if (this.showCreateEvent()) {
      actions.push({
        id: "event",
        icon: "calendar_add_on",
        label: $localize`:@@map.create.event:Create event`,
      });
    }
    if (this.showPlanSession()) {
      actions.push({
        id: "session",
        icon: "event_upcoming",
        label: $localize`:@@map.create.session:Plan session`,
      });
    }
    return actions;
  });

  onCreateAction(action: string): void {
    switch (action) {
      case "spot":
        this.createSpot.emit();
        break;
      case "import-spots":
        this.importSpots.emit();
        break;
      case "event":
        this.createEvent.emit();
        break;
      case "session":
        this.planSession.emit();
        break;
    }
  }
}
