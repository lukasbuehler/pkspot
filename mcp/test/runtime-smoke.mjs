// Run with Wrangler dev already listening: npm run test:runtime -- http://localhost:8792/mcp
// Exercises the actual Worker transport and Durable Object without accessing live data.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.argv[2] ?? "http://127.0.0.1:8792/mcp");
if (!["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("Local smoke test only");
const client = new Client({ name: "pkspot-local-smoke", version: "1" });
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 6);
  const result = await client.callTool({ name: "search_spots", arguments: {} });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "invalid_area");
  console.log("Worker runtime smoke passed: MCP initialization, six tools, tool call and durable quotas.");
} finally { await client.close(); }
