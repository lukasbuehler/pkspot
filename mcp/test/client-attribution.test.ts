import { describe, expect, it } from "vitest";
import { clientAttribution } from "../src/client-attribution";

describe("best-effort MCP client attribution", () => {
  it.each([
    ["ChatGPT/1.0", "chatgpt"], ["codex-cli/1.0", "codex"],
    ["Claude/1.0", "claude"], ["Gemini/1.0", "gemini"],
    ["OpenAI-MCP/1.0", "openai"],
  ])("classifies %s without retaining its raw value", (agent, client) => {
    expect(clientAttribution(new Headers({ "User-Agent": agent }))).toEqual({
      client, client_source: "user_agent",
    });
  });
  it.each(["", "node", "python-httpx/0.28", "mychatgptproxy", "ChatGPT Claude", "x".repeat(512) + " ChatGPT"])(
    "keeps absent, generic, ambiguous and overlong hints unknown (%s)", agent => {
      expect(clientAttribution(new Headers({ "User-Agent": agent }))).toEqual({
        client: "unknown", client_source: "unknown",
      });
    },
  );
  it("does not infer a client from origin or forwarding headers", () => {
    expect(clientAttribution(new Headers({ Origin: "https://chatgpt.com", "X-Client-Name": "Claude" })).client).toBe("unknown");
  });
});
