/// <reference types="@angular/localize" />

import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.server";

// Angular SSR requires passing a context when bootstrapping on the server.
// Use a permissive type to avoid versioned type mismatches while keeping runtime behavior correct.
export default function bootstrap(context: unknown) {
  return (bootstrapApplication as any)(AppComponent, config, context);
}
