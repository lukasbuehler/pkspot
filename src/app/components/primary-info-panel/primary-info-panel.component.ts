import {
  ChangeDetectionStrategy,
  Component,
  signal,
  computed,
  EventEmitter,
  Output,
} from "@angular/core";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { CommonModule } from "@angular/common";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { MatSidenavModule } from "@angular/material/sidenav";

@Component({
  selector: "app-primary-info-panel",
  imports: [CommonModule, BottomSheetComponent, MatSidenavModule],
  templateUrl: "./primary-info-panel.component.html",
  styleUrls: ["./primary-info-panel.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrimaryInfoPanelComponent {
  private isMobile = signal(false);

  showBottomSheet = computed(() => this.isMobile());

  // Emits true when the bottom sheet is open (at top), false when closed.
  @Output() bottomSheetOpenChange = new EventEmitter<boolean>();
  @Output() bottomSheetProgressChange = new EventEmitter<number>();
  bottomSheetOpen = signal<boolean>(false);

  private _emitTimeout?: any;
  onSheetTopChange(atTop: boolean) {
    this.bottomSheetOpen.set(atTop);
    // debounce emits to avoid flicker
    if (this._emitTimeout) clearTimeout(this._emitTimeout);
    this._emitTimeout = setTimeout(() => {
      this.bottomSheetOpenChange.emit(this.bottomSheetOpen());
    }, 50);
  }

  onSheetProgressChange(progress: number) {
    this.bottomSheetProgressChange.emit(progress);
  }

  constructor(private breakpointObserver: BreakpointObserver) {
    if (typeof window !== "undefined") {
      this.isMobile.set(window.matchMedia("(max-width: 599px)").matches);
    }
    breakpointObserver.observe([Breakpoints.Handset]).subscribe((result) => {
      this.isMobile.set(result.matches);
    });
  }
}
