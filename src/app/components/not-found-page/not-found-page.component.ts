import {
  ChangeDetectionStrategy,
  Component,
  inject,
  RESPONSE_INIT,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-not-found-page",
  templateUrl: "./not-found-page.component.html",
  styleUrls: ["./not-found-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, RouterLink],
})
export class NotFoundPageComponent {
  private readonly responseInit = inject(RESPONSE_INIT);

  constructor() {
    if (this.responseInit) this.responseInit.status = 404;
  }
}
