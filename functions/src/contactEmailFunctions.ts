import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {buildContactEmail} from "./contactEmail";

const resendKey = defineSecret("CONTACT_RESEND_API_KEY");

/** Separate deployment keeps existing Discord delivery independent of email setup. */
export const onContactMessageEmailCreate = onDocumentCreated({
  document: "contact_messages/{messageId}",
  region: "europe-west1",
  secrets: [resendKey],
  retry: true,
}, async (event) => {
  if (!event.data) return;
  const delivery = admin.firestore().doc(`contact_email_delivery/${event.params.messageId}`);
  if ((await delivery.get()).data()?.sent_at) return;
  // Resend retains idempotency keys for 24 hours. Do not blindly resend after
  // that boundary: an earlier accepted request may have timed out locally.
  if (Date.now() - event.data.createTime.toMillis() > 23 * 60 * 60 * 1000) {
    await delivery.set({status: "needs_review", reason: "delivery_window_expired"}, {merge: true});
    logger.error("Contact email requires delivery review", {messageId: event.params.messageId});
    return;
  }
  const key = resendKey.value().trim();
  if (!key) throw new Error("Contact email credentials are not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `contact-${event.params.messageId}`,
    },
    body: JSON.stringify(buildContactEmail(event.params.messageId, event.data.data())),
  });
  if (!response.ok) throw new Error(`Contact email provider returned HTTP ${response.status}`);
  await delivery.set({status: "sent", sent_at: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
});
