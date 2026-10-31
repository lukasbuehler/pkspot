import { restoreApplicationPreloads } from "../../application-preloads";

let application: Promise<typeof import("../../main.bootstrap")> | undefined;

/** Schedule route downloads once the chosen browser entry is ready for them. */
export function loadApplication() {
  if (!application) {
    restoreApplicationPreloads();
    application = import("../../main.bootstrap");
  }
  return application;
}
