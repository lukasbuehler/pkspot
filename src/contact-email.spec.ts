import {describe, expect, it} from "vitest";
import {buildContactEmail} from "../functions/src/contactEmail";

describe("contact email", () => {
  it("uses a fixed support recipient and a validated Reply-To", () => {
    const email = buildContactEmail("message-1", {message: "Hello", contact_info: "visitor@example.org"});
    expect(email.to).toEqual(["support@pkspot.app"]);
    expect(email.reply_to).toBe("visitor@example.org");
    expect(email.from).toBe("PK Spot contact <support@pkspot.app>");
  });
  it.each(["visitor@example.org\r\nBcc: other@example.org", "a@b.com,c@d.com", "@instagram", ""])(
    "does not put arbitrary contact text into a header: %s", (contact_info) => {
      expect(buildContactEmail("message-1", {contact_info}).reply_to).toBeUndefined();
    });
});
