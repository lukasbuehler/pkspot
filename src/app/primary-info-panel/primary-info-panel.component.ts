import { ChangeDetectionStrategy, Component, signal, computed } from "@angular/core";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { CommonModule } from "@angular/common";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";

@Component({
  selector: "app-primary-info-panel",
  imports: [CommonModule, BottomSheetComponent],
  templateUrl: "./primary-info-panel.component.html",
  styleUrls: ["./primary-info-panel.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrimaryInfoPanelComponent {
  private isMobile = signal(false);

  showBottomSheet = computed(() => this.isMobile());

  constructor(private breakpointObserver: BreakpointObserver) {
    if (typeof window !== "undefined") {
      this.isMobile.set(window.matchMedia("(max-width: 599px)").matches);
    }
    breakpointObserver.observe([Breakpoints.Handset]).subscribe((result) => {
      this.isMobile.set(result.matches);
    });
  }
}
