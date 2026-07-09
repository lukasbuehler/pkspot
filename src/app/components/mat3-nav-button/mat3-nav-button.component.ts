import { NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
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
  readonly icon = input("info");
  readonly label = input("label");
  readonly image = input("");
  readonly active = input(false);

  readonly isOutlineIcon = computed(() => this.icon().endsWith("_border"));
}
