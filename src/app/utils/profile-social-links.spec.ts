import { describe, expect, it } from "vitest";
import {
  buildInstagramProfileUrl,
  buildTikTokProfileUrl,
  normalizeDiscordUrl,
  normalizeProfileSocials,
} from "./profile-social-links";

describe("profile social links", () => {
  it("normalizes Instagram and TikTok handles from handles or profile URLs", () => {
    expect(buildInstagramProfileUrl("@pkspot.app")).toBe(
      "https://instagram.com/pkspot.app"
    );
    expect(buildTikTokProfileUrl("https://www.tiktok.com/@parkourspot")).toBe(
      "https://www.tiktok.com/@parkourspot"
    );
  });

  it("accepts Discord invite codes and Discord URLs only", () => {
    expect(normalizeDiscordUrl("Th5vx4KnQb")).toBe(
      "https://discord.gg/Th5vx4KnQb"
    );
    expect(normalizeDiscordUrl("discord.com/users/123")).toBe(
      "https://discord.com/users/123"
    );
    expect(normalizeDiscordUrl("https://example.com/community")).toBeNull();
  });

  it("normalizes the complete editable social profile shape", () => {
    expect(
      normalizeProfileSocials({
        instagram_handle: " @pkspot.app ",
        youtube_handle: "pkspot",
        tiktok_handle: "@parkourspot",
        discord_url: "discord.gg/example",
      })
    ).toEqual({
      instagram_handle: "pkspot.app",
      youtube_handle: "@pkspot",
      tiktok_handle: "parkourspot",
      discord_url: "https://discord.gg/example",
    });
  });
});
