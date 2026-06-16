import { NgOptimizedImage } from "@angular/common";
import { Component, HostBinding, input, Input, ChangeDetectionStrategy } from "@angular/core";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-mat3-nav-button",
  templateUrl: "./mat3-nav-button.component.html",
  styleUrls: ["./mat3-nav-button.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, NgOptimizedImage],
})
export class Mat3NavButtonComponent {
  @Input() icon: string = "info";
  @Input() label: string = "label";
  image = input<string>("");
  active = input(false);

  @HostBinding("attr.tabindex") tabindex = -1;

  get isOutlineIcon(): boolean {
    return this.icon.endsWith("_border");
  }
}
