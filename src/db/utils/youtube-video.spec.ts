import { describe, expect, it } from "vitest";
import { youtubeVideoId } from "./youtube-video";

describe("YouTube video identity", () => {
  it.each([
    "https://www.youtube.com/watch?v=uG9SCwcHA7k&feature=shared",
    "https://youtu.be/uG9SCwcHA7k",
    "https://www.youtube.com/live/uG9SCwcHA7k?si=sharing",
    "https://www.youtube-nocookie.com/embed/uG9SCwcHA7k?si=sharing",
  ])("accepts a known video URL: %s", (url) => {
    expect(youtubeVideoId(url)).toBe("uG9SCwcHA7k");
  });
  it.each([
    "https://youtube.com.evil.test/watch?v=uG9SCwcHA7k",
    "https://evil.test/embed/uG9SCwcHA7k", "javascript:alert(1)",
    '<iframe src="https://www.youtube.com/embed/uG9SCwcHA7k"></iframe>',
    "https://www.youtube.com/@channel/live", "https://youtube.com/watch?v=invalid",
  ])("rejects unsupported input: %s", (url) => expect(youtubeVideoId(url)).toBeNull());
});
