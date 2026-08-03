import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { speedDialFabAnimations } from "./speed-dial-fab.animations";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip, TooltipPosition } from "@angular/material/tooltip";
import { MatFabButton, MatMiniFabButton } from "@angular/material/button";

export interface SpeedDialFabButtonConfig {
  mainButton?: {
    icon?: string;
    tooltip?: string;
    color?: string;
    label?: string;
    isExtended?: boolean;
  };
  miniButtonColor: string;
  tooltipPosition?: TooltipPosition;
  miniButtons: {
    icon: string;
    tooltip?: string;
    /** Visible action label. Falls back to the tooltip when omitted. */
    label?: string;
    ariaLabel?: string;
  }[];
}

@Component({
  selector: "app-speed-dial-fab",
  host: {
    tabindex: "-1",
    "(document:click)": "onClick($event.target)",
  },
  templateUrl: "./speed-dial-fab.component.html",
  styleUrls: ["./speed-dial-fab.component.scss"],
  animations: speedDialFabAnimations,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFabButton, MatTooltip, MatIcon, MatMiniFabButton],
})
export class SpeedDialFabComponent {
  readonly fabContainer = viewChild<ElementRef<HTMLElement>>("fabContainer");
  readonly buttonConfig = input<SpeedDialFabButtonConfig>();
  readonly rotationDegrees = input(45);
  readonly openOnHover = input(false);

  readonly mainFabClick = output<void>();
  readonly miniFabClick = output<number>();

  readonly defaultTooltipPosition: TooltipPosition = "left";

  /**
   * Whether the speed dial is open or closed.
   * Default is closed.
   */
  readonly isOpen = signal(false);

  public onClick(target: EventTarget | null): void {
    const clickedInside =
      target instanceof Node &&
      this.fabContainer()?.nativeElement.contains(target);
    if (!clickedInside) {
      // this click event from outside
      this.onClickOutside();
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen() ? this.close() : this.open();
  }

  onMainClick(): void {
    if (this.openOnHover() && this.isOpen()) {
      // call the action function provided for the mainButton
      this.mainFabClick.emit();
    } else {
      if (!this.isOpen()) {
        this.open();
      } else {
        this.toggle();
      }
    }
  }

  onMouseEnter(): void {
    // open the fab button if it is configured to
    if (this.openOnHover()) {
      this.open();
    }
  }

  onMouseLeave(): void {
    // we want to close it anyhow
    if (this.openOnHover()) {
      this.close();
    }
  }

  onClickOutside(): void {
    this.close();
  }

  miniButtonClick(index: number): void {
    this.miniFabClick.emit(index);
    this.close();
  }

  getBackgroundColor(color: string): string {
    switch (color) {
      case "primary":
        return "var(--dark-primary-bg)";
      case "accent":
      case "secondary":
        return "var(--dark-secondary-bg)";
      default:
        return "var(--dark-default-bg)";
    }
  }

  getIconColor(color: string): string {
    switch (color) {
      case "primary":
        return "var(--dark-primary-icon)";
      case "accent":
      case "secondary":
        return "var(--dark-secondary-icon)";
      default:
        return "var(--dark-default-icon)";
    }
  }
}
