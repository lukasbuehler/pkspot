import {buildContactEmail, ContactEmailInput} from "./contactEmail";

/** Never echo submitted text into an email to an unverified address. */
export function buildContactReceipt(id: string, input: ContactEmailInput) {
  const recipient = buildContactEmail(id, input).reply_to;
  if (!recipient || recipient.toLowerCase() === "support@pkspot.app") return null;
  return {
    from: "PK Spot Support <support@pkspot.app>",
    to: [recipient],
    reply_to: "support@pkspot.app",
    subject: "We received your PK Spot message",
    text: "Thanks for contacting PK Spot. Your message has been received.\n\n" +
      "If a reply is needed, we will contact you from support@pkspot.app. " +
      "You can reply to this email if you have anything to add.\n\n" +
      `Reference: ${id}\n\n` +
      "If you did not contact PK Spot, you can ignore this email. " +
      "This receipt does not subscribe you to anything.\n\nPK Spot Support",
  };
}
