import { Component, OnInit } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-not-found-page",
  templateUrl: "./not-found-page.component.html",
  styleUrls: ["./not-found-page.component.scss"],
  standalone: true,
  imports: [MatIconModule, MatButtonModule, RouterLink],
})
export class NotFoundPageComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
