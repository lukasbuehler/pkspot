import { inject, Injectable } from "@angular/core";
import {
  SafetyIncidentClassification,
  SafetyIncidentRetentionState,
  SafetyIncidentSchema,
  SafetyIncidentStatus,
  SafetyIncidentUkLink,
} from "../../../../db/schemas/SafetyIncidentSchema";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

export interface SafetyIncidentUpdate {
  status: SafetyIncidentStatus;
  classification: SafetyIncidentClassification;
  uk_link: SafetyIncidentUkLink;
  retention_state: SafetyIncidentRetentionState;
  containment_summary?: string;
  posthog_context?: string;
  external_report_reference?: string;
  notes?: string;
}

@Injectable({ providedIn: "root" })
export class SafetyIncidentsService {
  private readonly _firestore = inject(FirestoreAdapterService);
  private readonly _functions = inject(FunctionsAdapterService);

  getIncident(
    incidentId: string,
  ): Promise<(SafetyIncidentSchema & { id: string }) | null> {
    return this._firestore.getDocument<SafetyIncidentSchema & { id: string }>(
      `safety_incidents/${incidentId}`,
    );
  }

  async updateIncident(
    incidentId: string,
    update: SafetyIncidentUpdate,
  ): Promise<void> {
    await this._functions.call<
      SafetyIncidentUpdate & { incident_id: string },
      { ok: boolean }
    >("updateSafetyIncident", {
      incident_id: incidentId,
      ...update,
    });
  }
}
