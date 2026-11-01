import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

interface StaffEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
}

/** Resend deduplicates retries for 24 hours. Stop before that boundary if an
 * accepted request timed out locally, so delayed redelivery cannot send twice. */
export async function deliverStaffEmail(input: {
  deliveryPath: string;
  idempotencyKey: string;
  createdAtMs: number;
  apiKey: () => string;
  email: StaffEmail;
}): Promise<void> {
  const delivery = admin.firestore().doc(input.deliveryPath);
  if ((await delivery.get()).data()?.sent_at) return;
  if (Date.now() - input.createdAtMs > 23 * 60 * 60 * 1000) {
    await delivery.set({status: "needs_review", reason: "delivery_window_expired"}, {merge: true});
    logger.error("Staff email requires delivery review", {deliveryPath: input.deliveryPath});
    return;
  }
  const key = input.apiKey().trim();
  if (!key) throw new Error("Staff email credentials are not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey},
    body: JSON.stringify(input.email),
  });
  if (response.status >= 400 && response.status < 500 && response.status !== 409 && response.status !== 429) {
    await delivery.set({status: "needs_review", reason: `provider_rejected_${response.status}`}, {merge: true});
    logger.error("Staff email rejected by provider", {deliveryPath: input.deliveryPath, status: response.status});
    return;
  }
  if (!response.ok) throw new Error(`Staff email provider returned HTTP ${response.status}`);
  await delivery.set({status: "sent", sent_at: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
}
