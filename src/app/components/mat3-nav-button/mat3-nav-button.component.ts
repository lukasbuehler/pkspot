import { NgOptimizedImage } from "@angular/common";
import { Component, HostBinding, input, Input } from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { RouterLinkActive } from "@angular/router";

@Component({
  selector: "app-mat3-nav-button",
  templateUrl: "./mat3-nav-button.component.html",
  styleUrls: ["./mat3-nav-button.component.scss"],
  imports: [RouterLinkActive, MatIcon, NgOptimizedImage],
})
export class Mat3NavButtonComponent {
  @Input() icon: string = "info";
  @Input() label: string = "label";
  image = input<string>("");

  @HostBinding("attr.tabindex") tabindex = -1;
}
