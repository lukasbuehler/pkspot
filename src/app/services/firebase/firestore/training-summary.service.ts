import { Injectable, inject } from "@angular/core";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import type {
  GetMySpotRanksRequest,
  GetMySpotRanksResponse,
  SetCheckInSessionDurationRequest,
  SetCheckInSessionDurationResponse,
  TrainingMonthSchema,
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
  __PKSPOT_SCREENSHOT_SPOT_RANKS__?: GetMySpotRanksResponse;
}

/**
 * Reads the person's private training summaries and private Spot ranks. The
 * summaries are written by the server from their session records; ranks are
 * computed on request and only ever describe the caller.
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

  getMySpotRanks(request: GetMySpotRanksRequest = {}): Promise<GetMySpotRanksResponse> {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_SPOT_RANKS__;
    if (fixture) {
      const requested = request.spotIds ? new Set(request.spotIds) : null;
      return Promise.resolve({
        ...fixture,
        ranks: fixture.ranks.filter((rank) => !requested || requested.has(rank.spotId)),
      });
    }
    if (this.fixtureSessions()) return Promise.resolve({ month: "", ranks: [] });
    return this.telemetry.run("training_summary", "getMySpotRanks", () =>
      this.functions.callAuthenticatedAppChecked<GetMySpotRanksRequest, GetMySpotRanksResponse>(
        "getMySpotRanks",
        { timeZone: systemTimeZone(), ...request },
      ),
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

function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
