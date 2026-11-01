import {inject, Injectable} from "@angular/core";
import type {EventSuggestionQueueItem, EventSuggestionQueuePage, EventSuggestionSchema} from "../../db/schemas/EventSuggestionSchema";
import {FunctionsAdapterService} from "./firebase/functions-adapter.service";

@Injectable({providedIn: "root"})
export class EventSuggestionsService {
  private readonly functions = inject(FunctionsAdapterService);

  list(status: EventSuggestionSchema["status"], cursor?: string): Promise<EventSuggestionQueuePage> {
    const fixture = (globalThis as {__PKSPOT_SCREENSHOT_EVENT_SUGGESTIONS__?: EventSuggestionQueueItem[]})
      .__PKSPOT_SCREENSHOT_EVENT_SUGGESTIONS__;
    if (fixture) {
      const matching = fixture.filter((item) => item.status === status);
      const offset = cursor ? matching.findIndex((item) => item.id === cursor) + 1 : 0;
      const items = matching.slice(offset, offset + 50);
      return Promise.resolve({items, nextCursor: matching.length > offset + 50 ? items.at(-1)!.id : null});
    }
    return this.functions.callAuthenticatedAppChecked("listEventSuggestions", {status, ...(cursor ? {cursor} : {})});
  }

  review(suggestionId: string, outcome: "approved" | "rejected", note: string): Promise<{ok: true; eventId?: string; slug?: string}> {
    return this.functions.callAuthenticatedAppChecked("reviewEventSuggestion", {suggestionId, outcome, ...(note.trim() ? {note: note.trim()} : {})});
  }
}
