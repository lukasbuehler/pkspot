import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

export interface CommunityEventAuthoringInput {
  name: string;
  description?: string;
  locality: string;
  countryCode: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  visibility: "public";
  broadcast: boolean;
}

export interface FormalEventSuggestionInput {
  name: string;
  description?: string;
  locality?: string;
  countryCode?: string;
  startsAt: string;
  endsAt: string;
  timeZone?: string;
  organizerName?: string;
  sourceUrl?: string;
}

export interface FormalEventAuthoringInput {
  name: string;
  description?: string;
  locality?: string;
  startsAt: string;
  endsAt: string;
  timeZone?: string;
  organizerName?: string;
  organizationId?: string;
  coverImageUrl?: string;
}

@Injectable({ providedIn: "root" })
export class EventAuthoringService {
  private readonly _functions = inject(FunctionsAdapterService);

  createCommunityEvent(
    input: CommunityEventAuthoringInput,
  ): Promise<{ eventId: string; slug: string }> {
    return this._functions.callAuthenticatedAppChecked<
      CommunityEventAuthoringInput,
      { eventId: string; slug: string }
    >("createCommunityEvent", input);
  }

  updateCommunityEvent(
    eventId: string,
    event: CommunityEventAuthoringInput,
  ): Promise<{ ok: true }> {
    return this._functions.callAuthenticatedAppChecked<
      { eventId: string; event: CommunityEventAuthoringInput },
      { ok: true }
    >("updateCommunityEvent", { eventId, event });
  }

  cancelCommunityEvent(eventId: string): Promise<{ ok: true }> {
    return this._functions.callAuthenticatedAppChecked<
      { eventId: string },
      { ok: true }
    >("cancelCommunityEvent", { eventId });
  }

  createFormalEvent(
    input: FormalEventAuthoringInput,
  ): Promise<{ eventId: string; slug: string }> {
    return this._functions.callAuthenticatedAppChecked<
      FormalEventAuthoringInput,
      { eventId: string; slug: string }
    >("createFormalEvent", input);
  }

  submitFormalEventSuggestion(
    input: FormalEventSuggestionInput,
  ): Promise<{ suggestionId: string }> {
    return this._functions.callAuthenticatedAppChecked<
      FormalEventSuggestionInput,
      { suggestionId: string }
    >("submitEventSuggestion", input);
  }
}
