import { NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  input,
  Input,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-mat3-nav-button",
  host: {
    tabindex: "-1",
  },
  templateUrl: "./mat3-nav-button.component.html",
  styleUrls: ["./mat3-nav-button.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, NgOptimizedImage],
})
export class Mat3NavButtonComponent {
  @Input() icon: string = "info";
  @Input() label: string = "label";
  image = input<string>("");
  active = input(false);

  get isOutlineIcon(): boolean {
    return this.icon.endsWith("_border");
  }
}
