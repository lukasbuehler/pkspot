import { Injectable, inject } from "@angular/core";
import { type Observable, of } from "rxjs";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import type {
  DeleteMySpotRankRequest,
  LocalLegendSettingsSchema,
  SetCheckInSessionDurationRequest,
  SetLocalLegendParticipationRequest,
  SetLocalLegendParticipationResponse,
  SetCheckInSessionDurationResponse,
  TrainingMonthSchema,
  TrainingRanksSchema,
  TrainingSpotSchema,
} from "../../../../db/schemas/TrainingSummarySchema";
import {
  buildTrainingMonthSummary,
  buildTrainingSpotSummary,
  sessionMonthKey,
} from "../../../../db/utils/training-summary";
import { FeatureTelemetryService } from "../../feature-telemetry.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { SessionRecordsService } from "./session-records.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_TRAINING_SESSIONS__?: SessionRecordDocument[];
  __PKSPOT_SCREENSHOT_SPOT_RANKS__?: TrainingRanksSchema;
  /** On, off, or null for "not chosen yet". */
  __PKSPOT_SCREENSHOT_LOCAL_LEGEND__?: boolean | null;
}

/**
 * Reads the person's private training summaries and private Spot ranks. The
 * server writes both: summaries on every session write, ranks once a night.
 * They are plain owner-only documents, so the Firestore cache serves repeats.
 */
@Injectable({ providedIn: "root" })
export class TrainingSummaryService {
  private readonly telemetry = inject(FeatureTelemetryService);
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly functions = inject(FunctionsAdapterService);
  private readonly auth = inject(AuthenticationService);
  private readonly sessions = inject(SessionRecordsService);

  /**
   * Every month with training, oldest first. History recorded before the
   * server summaries existed is derived from the session records instead, so
   * nobody sees an empty history while the backfill is pending.
   */
  async listMyMonths(): Promise<TrainingMonthSchema[]> {
    const fixture = this.fixtureSessions();
    const stored = fixture
      ? []
      : await this.firestore.getCollection<TrainingMonthSchema>(
          `users/${this.requireUserId()}/training_months`,
        );
    const months = stored.length > 0
      ? stored
      : TrainingSummaryService.deriveMonths(fixture ?? (await this.sessions.listMine(null)));
    return [...months].sort((left, right) => left.month.localeCompare(right.month));
  }

  async getMySpot(spotId: string): Promise<TrainingSpotSchema | null> {
    const fixture = this.fixtureSessions();
    if (fixture) {
      return buildTrainingSpotSummary(spotId, TrainingSummaryService.deriveMonths(fixture), Date.now());
    }
    return this.firestore.getDocument<TrainingSpotSchema>(
      `users/${this.requireUserId()}/training_spots/${spotId}`,
    );
  }

  /** One month's summary, or null when the person did not train that month. */
  async getMyMonth(month: string): Promise<TrainingMonthSchema | null> {
    const fixture = this.fixtureSessions();
    if (fixture) {
      return TrainingSummaryService.deriveMonths(fixture).find((item) => item.month === month) ?? null;
    }
    return this.firestore.getDocument<TrainingMonthSchema>(
      `users/${this.requireUserId()}/training_months/${month}`,
    );
  }

  /** Follows one month's summary, so a fresh check-in shows up once the server counted it. */
  watchMyMonth(month: string): Observable<TrainingMonthSchema | null> {
    if (this.fixtureSessions()) return of(null);
    return this.firestore.documentSnapshots<TrainingMonthSchema>(
      `users/${this.requireUserId()}/training_months/${month}`,
    );
  }

  /** The person's own published Spot ranks for a month. */
  async getMyRanks(month: string): Promise<TrainingRanksSchema | null> {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_SPOT_RANKS__;
    if (fixture) return fixture.month === month ? fixture : null;
    if (this.fixtureSessions()) return null;
    return this.firestore.getDocument<TrainingRanksSchema>(
      `users/${this.requireUserId()}/training_ranks/${month}`,
    );
  }

  /** Every month with published ranks, newest first. */
  async listMyRanks(): Promise<TrainingRanksSchema[]> {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_SPOT_RANKS__;
    if (fixture) return [fixture];
    if (this.fixtureSessions()) return [];
    const ranks = await this.firestore.getCollection<TrainingRanksSchema>(
      `users/${this.requireUserId()}/training_ranks`,
    );
    return [...ranks].sort((left, right) => right.month.localeCompare(left.month));
  }

  /** The person's Local Legend choice, or null before they chose. */
  async getLocalLegend(): Promise<LocalLegendSettingsSchema | null> {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_LOCAL_LEGEND__;
    if (fixture !== undefined) return fixture === null ? null : { enabled: fixture, decided_at_raw_ms: 0 };
    if ((globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_SPOT_RANKS__) return { enabled: true, decided_at_raw_ms: 0 };
    if (this.fixtureSessions()) return null;
    return this.firestore.getDocument<LocalLegendSettingsSchema>(
      `users/${this.requireUserId()}/training_settings/local_legend`,
    );
  }

  setLocalLegend(enabled: boolean): Promise<SetLocalLegendParticipationResponse> {
    return this.telemetry.run("training_summary", "setLocalLegendParticipation", () =>
      this.functions.callAuthenticatedAppChecked<
        SetLocalLegendParticipationRequest,
        SetLocalLegendParticipationResponse
      >("setLocalLegendParticipation", { enabled }),
      true,
    );
  }

  deleteMyRank(request: DeleteMySpotRankRequest): Promise<{ deleted: boolean }> {
    return this.telemetry.run("training_summary", "deleteMySpotRank", () =>
      this.functions.callAuthenticatedAppChecked<DeleteMySpotRankRequest, { deleted: boolean }>(
        "deleteMySpotRank",
        request,
      ),
      true,
    );
  }

  setCheckInSessionDuration(
    request: SetCheckInSessionDurationRequest,
  ): Promise<SetCheckInSessionDurationResponse> {
    return this.telemetry.run("training_summary", "setCheckInSessionDuration", () =>
      this.functions.callAuthenticatedAppChecked<
        SetCheckInSessionDurationRequest,
        SetCheckInSessionDurationResponse
      >("setCheckInSessionDuration", request),
      true,
    );
  }

  /**
   * Client-side equivalent of the server summaries. Verification is not
   * known on the client, so derived months never claim verified days; ranks
   * always come from the server.
   */
  static deriveMonths(sessions: readonly SessionRecordDocument[]): TrainingMonthSchema[] {
    const months = new Set(
      sessions.map((session) => sessionMonthKey(session)).filter((month): month is string => !!month),
    );
    const now = Date.now();
    return [...months]
      .map((month) => buildTrainingMonthSummary(month, sessions, new Set(), now))
      .filter((month): month is TrainingMonthSchema => month !== null);
  }

  private fixtureSessions(): SessionRecordDocument[] | null {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__;
    return fixture ? [...fixture] : null;
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Sign in to see your training statistics.");
    return uid;
  }
}
