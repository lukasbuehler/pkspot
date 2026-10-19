import { Injectable, computed, inject, resource, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { map } from "rxjs";
import { AuthenticationService } from "./firebase/authentication.service";
import { TrainingSummaryService } from "./firebase/firestore/training-summary.service";

/**
 * - `undecided`: signed in, never chose; the app may invite them to join.
 * - `on` / `off`: their choice. Off hides ranks but keeps past ranks.
 * - `unavailable`: signed out or still loading; show nothing about ranks.
 */
export type LocalLegendState = "unavailable" | "undecided" | "on" | "off";

/**
 * Whether the signed-in person takes part in Local Legend, the opt-in private
 * Spot ranking. Only participants are compared; everyone keeps their own
 * private visits and statistics either way.
 */
@Injectable({ providedIn: "root" })
export class LocalLegendService {
  private readonly auth = inject(AuthenticationService);
  private readonly summaries = inject(TrainingSummaryService);

  private readonly uid = toSignal(
    this.auth.authState$.pipe(map((user) => user?.uid ?? null)),
    { initialValue: this.auth.user.uid ?? null },
  );
  private readonly reload = signal(0);
  private readonly settings = resource({
    params: () => {
      const uid = this.uid();
      return uid ? { uid, reload: this.reload() } : undefined;
    },
    loader: async () => {
      try {
        return await this.summaries.getLocalLegend();
      } catch (error) {
        console.warn("[Local Legend] settings unavailable", error);
        return undefined;
      }
    },
  });

  readonly state = computed<LocalLegendState>(() => {
    if (!this.uid() || this.settings.isLoading()) return "unavailable";
    const settings = this.settings.value();
    if (settings === undefined) return "unavailable";
    if (settings === null) return "undecided";
    return settings.enabled ? "on" : "off";
  });
  readonly enabled = computed(() => this.state() === "on");
  readonly saving = signal(false);

  async setEnabled(enabled: boolean): Promise<void> {
    this.saving.set(true);
    try {
      await this.summaries.setLocalLegend(enabled);
      this.settings.set({ enabled, decided_at_raw_ms: Date.now() });
    } catch (error) {
      // Show the stored choice again rather than one that was not saved.
      this.reload.update((value) => value + 1);
      throw error;
    } finally {
      this.saving.set(false);
    }
  }
}
