import {describe, expect, it} from "vitest";
import {buildContactReceipt} from "../functions/src/contactReceipt";

describe("contact receipt", () => {
  it("confirms receipt with an identifiable support sender, without echoing user content", () => {
    const email = buildContactReceipt("message-1", {contact_info: " visitor@example.org ", message: "untrusted content", topic: "untrusted topic"});
    expect(email?.to).toEqual(["visitor@example.org"]);
    expect(email?.reply_to).toBe("support@pkspot.app");
    expect(email?.from).toBe("PK Spot Support <support@pkspot.app>");
    expect(email?.text).toContain("Reference: message-1");
    expect(email?.text).not.toContain("untrusted");
  });
  it.each([undefined, "", "@instagram", "a@b.com,c@d.com", "a@b.com\r\nBcc: c@d.com", "support@pkspot.app"])("skips invalid or internal recipients: %s", contact_info => {
    expect(buildContactReceipt("message-1", {contact_info})).toBeNull();
  });
});
