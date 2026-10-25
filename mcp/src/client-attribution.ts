/** Analytics hints only. Never use client-reported headers for access or quotas. */
export type ClientAttribution = {
  client: "chatgpt" | "codex" | "claude" | "gemini" | "openai" | "unknown";
  client_source: "user_agent" | "unknown";
};

export function clientAttribution(headers: Headers): ClientAttribution {
  // Inspect a bounded value and retain only an allowlisted label, never the raw UA.
  const agent = (headers.get("User-Agent") ?? "").slice(0, 512);
  const matches = [
    ["chatgpt", /\bchatgpt\b/i],
    ["codex", /\bcodex\b/i],
    ["claude", /\bclaude\b/i],
    ["gemini", /\bgemini\b/i],
  ] as const;
  const clients = matches.filter(([, pattern]) => pattern.test(agent));
  const match = clients.length === 1 ? clients[0] : undefined;
  if (match) return { client: match[0], client_source: "user_agent" };
  // OpenAI infrastructure may serve multiple products. Do not label it ChatGPT.
  if (!clients.length && /\bopenai\b/i.test(agent)) {
    return { client: "openai", client_source: "user_agent" };
  }
  return { client: "unknown", client_source: "unknown" };
}
