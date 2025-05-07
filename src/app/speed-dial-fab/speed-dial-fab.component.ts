import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { speedDialFabAnimations } from "./speed-dial-fab.animations";
import { NgIf, NgFor } from "@angular/common";
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
  }[];
}

@Component({
  selector: "app-speed-dial-fab",
  templateUrl: "./speed-dial-fab.component.html",
  styleUrls: ["./speed-dial-fab.component.scss"],
  animations: speedDialFabAnimations,
  imports: [MatFabButton, MatTooltip, MatIcon, MatMiniFabButton],
})
export class SpeedDialFabComponent implements OnInit {
  @ViewChild("fabContainer") fabContainer: ElementRef | undefined;
  @Input("buttonConfig") buttonConfig: SpeedDialFabButtonConfig | undefined;
  @Input("rotationDegrees") rotationDegrees: number = 45;
  @Input("openOnHover") openOnHover: boolean = false;

  @Output("mainFabClick")
  mainFabClick: EventEmitter<void> = new EventEmitter<void>();
  @Output("miniFabClick")
  miniFabClick: EventEmitter<number> = new EventEmitter<number>();

  defaultTootltipPosition: TooltipPosition = "left";

  /**
   * Whether the speed dial is open or closed.
   * Default is closed.
   */
  isOpen: boolean = false;

  @HostListener("document:click", ["$event.target"])
  public onClick(target: any) {
    const clickedInside = this.fabContainer?.nativeElement.contains(target);
    if (!clickedInside) {
      // this click event from outside
      this.onClickOutside();
    }
  }

  @HostBinding("attr.tabindex") tabindex = -1;

  constructor() {}

  ngOnInit(): void {}

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  onMainClick() {
    if (this.openOnHover && this.isOpen) {
      // call the action function provided for the mainButton
      this.mainFabClick.emit();
    } else {
      if (!this.isOpen) {
        this.open();
      } else {
        this.toggle();
      }
    }
  }

  onMouseEnter() {
    // open the fab button if it is configured to
    if (this.openOnHover) {
      this.open();
    }
  }

  onMouseLeave() {
    // we want to close it anyhow
    if (this.openOnHover) {
      this.close();
    }
  }

  onClickOutside() {
    this.close();
  }

  miniButtonClick(index: number) {
    this.miniFabClick.emit(index);
  }

  getBackgroundColor(color: string) {
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

  getIconColor(color: string) {
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
