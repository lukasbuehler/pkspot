import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import type {EventSuggestionSchema} from "../../src/db/schemas/EventSuggestionSchema";
import {buildEventSuggestionEmail} from "./eventSuggestionEmail";
import {deliverStaffEmail} from "./staffEmailDelivery";

const resendKey = defineSecret("CONTACT_RESEND_API_KEY");

/** Delivery failures never roll back the saved suggestion. */
export const onEventSuggestionEmailCreate = onDocumentCreated({
  document: "event_suggestions/{suggestionId}",
  region: "europe-west1",
  secrets: [resendKey],
  retry: true,
}, async (event) => {
  if (!event.data) return;
  const suggestion = event.data.data() as EventSuggestionSchema;
  if (suggestion.status !== "submitted") return;
  const id = event.params.suggestionId;
  await deliverStaffEmail({
    deliveryPath: `event_suggestion_email_delivery/${id}`,
    idempotencyKey: `event-suggestion-${id}`,
    createdAtMs: event.data.createTime.toMillis(),
    apiKey: () => resendKey.value(),
    email: buildEventSuggestionEmail(id, suggestion),
  });
});
