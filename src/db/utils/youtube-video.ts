/** Parse only known YouTube URL shapes; never accept arbitrary iframe HTML. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    let id: string | null = null;
    if (url.hostname === "youtu.be") id = parts.length === 1 ? parts[0] : null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v")
        : parts.length === 2 && ["embed", "live", "shorts"].includes(parts[0]) ? parts[1] : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
