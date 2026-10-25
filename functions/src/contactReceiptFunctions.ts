import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {buildContactReceipt} from "./contactReceipt";

const resendKey = defineSecret("CONTACT_RESEND_API_KEY");

/** Independent from support/Discord delivery, including failures and replays. */
export const onContactMessageReceiptCreate = onDocumentCreated({
  document: "contact_messages/{messageId}",
  region: "europe-west1",
  secrets: [resendKey],
  retry: false,
}, async (event) => {
  if (!event.data) return;
  const id = event.params.messageId;
  const email = buildContactReceipt(id, event.data.data());
  if (!email) return; // Handles/contact text remain valid on older clients.
  const db = admin.firestore();
  const delivery = db.doc(`contact_receipt_delivery/${id}`);
  if ((await delivery.get()).data()?.sent_at) return;
  if (Date.now() - event.data.createTime.toMillis() > 23 * 60 * 60 * 1000) {
    await delivery.set({status: "needs_review", reason: "delivery_window_expired"}, {merge: true});
    logger.error("Contact receipt requires delivery review", {messageId: id});
    return;
  }
  const key = resendKey.value().trim();
  if (!key) throw new Error("Contact email credentials are not configured");
  // The public form accepts unverified email addresses. Cap receipts per address
  // to one per hour; the support inbox still receives every submitted message.
  // Retain only one server-owned limit record per address, without plaintext email.
  const recipientHash = createHash("sha256").update(email.to[0].toLowerCase()).digest("hex");
  const limit = db.doc(`contact_receipt_limits/${recipientHash}`);
  const allowed = await db.runTransaction(async (transaction) => {
    const previous = (await transaction.get(limit)).data();
    if (previous?.message_id === id) return true; // Provider idempotency covers redelivery.
    if (typeof previous?.next_allowed_at_ms === "number" && previous.next_allowed_at_ms > Date.now()) return false;
    transaction.set(limit, {message_id: id, next_allowed_at_ms: Date.now() + 60 * 60 * 1000});
    return true;
  });
  if (!allowed) {
    await delivery.set({status: "skipped", reason: "recipient_cooldown"}, {merge: true});
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `contact-receipt-${id}`,
    },
    body: JSON.stringify(email),
  });
  if (!response.ok) throw new Error(`Contact receipt provider returned HTTP ${response.status}`);
  await delivery.set({status: "sent", sent_at: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
});
