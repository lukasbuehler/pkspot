import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from "@angular/core";

@Component({
  selector: "app-mat3-fab",
  standalone: false,
  //   imports: [],
  templateUrl: "./mat3-fab.component.html",
  styleUrl: "./mat3-fab.component.scss",
})
export class Mat3FabComponent {
  @Input() icon: string;
  @Input() color: string = "default";
  @Input() variant: "small" | "default" | "large" | "extended" = "default";

  @Output() click: EventEmitter<void> = new EventEmitter<void>();

  @HostBinding("attr.tabindex") tabindex = -1;

  onClick(event: Event) {
    event.stopPropagation();
  }
}
