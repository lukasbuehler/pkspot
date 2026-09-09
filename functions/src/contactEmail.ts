export interface ContactEmailInput {
  message?: unknown;
  contact_info?: unknown;
  topic?: unknown;
}

/** User input is body text/Reply-To only; it never controls sender or recipient. */
export function buildContactEmail(id: string, input: ContactEmailInput) {
  const contact = typeof input.contact_info === "string" ? input.contact_info.trim() : "";
  const replyTo = contact.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u.test(contact)
    ? contact : undefined;
  const message = typeof input.message === "string" ? input.message.slice(0, 20_000) : "";
  return {
    from: "PK Spot contact <support@pkspot.app>",
    to: ["support@pkspot.app"],
    subject: "New PK Spot contact message",
    ...(replyTo ? {reply_to: replyTo} : {}),
    text: `Contact message: ${id}\nTopic: ${String(input.topic ?? "general").slice(0, 80)}\nReply contact: ${contact.slice(0, 1000)}\n\n${message}`,
  };
}
