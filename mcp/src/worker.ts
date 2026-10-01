import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { capture } from "./analytics";
import { PublicData, record } from "./data";
import { Discovery, schemas, toolNames, type ToolName } from "./discovery";
import { reserve } from "./quota";
import { createServer } from "./server";
import type { Environment, Execution } from "./runtime";
export { QuotaStore } from "./quota";

const MAX_BODY = 16384;
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error("too large"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(body);
}
function configured(env: Environment): boolean {
  try {
    const origin = new URL(env.TYPESENSE_ORIGIN);
    return origin.protocol === "https:" && !origin.username && !origin.password &&
      origin.pathname === "/" && !origin.search && !origin.hash &&
      Boolean(env.TYPESENSE_SEARCH_KEY) && /^[a-z][a-z0-9-]{4,62}$/.test(env.FIRESTORE_PROJECT_ID) &&
      env.QUOTA_SECRET?.length >= 32;
  } catch { return false; }
}

export async function handle(request: Request, env: Environment, context: Execution): Promise<Response> {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!local && url.origin !== env.PUBLIC_ORIGIN) return new Response(null, { status: 421 });
  // Public ownership challenge, independent of data credentials and discovery quotas.
  if (url.pathname === "/.well-known/openai-apps-challenge" && env.OPENAI_DOMAIN_VERIFICATION_TOKEN) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    return new Response(request.method === "HEAD" ? null : env.OPENAI_DOMAIN_VERIFICATION_TOKEN,
      { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (url.pathname === "/health" && request.method === "GET") {
    return Response.json({ service: "pkspot-mcp", ready: configured(env) }, { status: configured(env) ? 200 : 503 });
  }
  if (url.pathname !== "/mcp") return new Response(null, { status: 404 });
  // Streamable HTTP supports server clients without Origin. Browser requests
  // must be same-origin; a browser challenge or wildcard CORS is not needed.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!configured(env)) return Response.json({ error: "Service not configured" }, { status: 503 });
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return new Response(null, { status: 415 });
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) return new Response(null, { status: 413 });
  // CF-Connecting-IP is set by Cloudflare on public requests. Never use an
  // untrusted forwarded IP, session ID, client name or host metadata as identity.
  const ip = local ? "local-development" : request.headers.get("CF-Connecting-IP");
  if (!ip) return Response.json({ error: "Gateway identity unavailable" }, { status: 503 });
  try {
    // Charge ingress before parsing so malformed, batched and retried requests
    // cannot evade limits. A second reservation bounds data returned by tools.
    const limited = await reserve(env, ip, 0);
    if (limited) return limited;
  } catch { return Response.json({ error: "Quota service unavailable" }, { status: 503 }); }
  let body: string;
  try { body = await readBody(request); }
  catch { return new Response(null, { status: 413 }); }
  let payload: unknown;
  try { payload = JSON.parse(body); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (Array.isArray(payload)) return Response.json({ error: "Batch requests are not supported" }, { status: 400 });
  const rpc = record(payload);
  if (!["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"].includes(String(rpc.method))) {
    return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: "Method not found" } }, { status: 400 });
  }
  if (rpc.method === "tools/call") {
    const params = record(rpc.params);
    if (!toolNames.includes(params.name as ToolName) || !schemas[params.name as ToolName].safeParse(params.arguments ?? {}).success) {
      return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32602, message: "Invalid tool name or arguments" } }, { status: 400 });
    }
    try {
      const limited = await reserve(env, ip, String(params.name).startsWith("search_") ? 10 : 1, false);
      if (limited) return limited;
    } catch { return Response.json({ error: "Quota service unavailable" }, { status: 503 }); }
  }
  const server = createServer(new Discovery(new PublicData(env)), (metric) => context.waitUntil(capture(env, metric)));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    // Buffer the JSON response before closing the stateless transport.
    const response = await transport.handleRequest(new Request(request.url, {
      method: "POST", headers: request.headers, body,
    }));
    return new Response(response.body ? await response.arrayBuffer() : null,
      { status: response.status, headers: response.headers });
  } catch { return Response.json({ error: "Service temporarily unavailable" }, { status: 503 }); }
  finally { await server.close(); }
}

export default {
  async fetch(request: Request, env: Environment, context: Execution): Promise<Response> {
    const response = await handle(request, env, context);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  },
};
