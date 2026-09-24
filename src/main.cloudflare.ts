/// <reference types="@angular/localize" />

import {
  BootstrapContext,
  bootstrapApplication,
} from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.cloudflare";

const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);

export default bootstrap;
