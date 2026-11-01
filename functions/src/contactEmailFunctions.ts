import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {buildContactEmail} from "./contactEmail";
import {deliverStaffEmail} from "./staffEmailDelivery";

const resendKey = defineSecret("CONTACT_RESEND_API_KEY");

/** Separate deployment keeps existing Discord delivery independent of email setup. */
export const onContactMessageEmailCreate = onDocumentCreated({
  document: "contact_messages/{messageId}",
  region: "europe-west1",
  secrets: [resendKey],
  retry: true,
}, async (event) => {
  if (!event.data) return;
  await deliverStaffEmail({
    deliveryPath: `contact_email_delivery/${event.params.messageId}`,
    idempotencyKey: `contact-${event.params.messageId}`,
    createdAtMs: event.data.createTime.toMillis(),
    apiKey: () => resendKey.value(),
    email: buildContactEmail(event.params.messageId, event.data.data()),
  });
});
