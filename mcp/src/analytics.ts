import type { Environment } from "./runtime";
import type { Metric } from "./server";

export async function capture(env: Environment, metric: Metric, fetcher: typeof fetch = fetch): Promise<void> {
  if (!env.POSTHOG_API_KEY) return;
  // Event-only analytics. No arguments, returned records, IPs, host identity,
  // conversation IDs or stable visitor IDs. Do not add request autocapture here.
  const host = env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (!["https://eu.i.posthog.com", "https://us.i.posthog.com"].includes(host)) return;
  try {
    await fetcher(`${host}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.POSTHOG_API_KEY, event: "mcp_tool_completed",
        distinct_id: crypto.randomUUID(), properties: { ...metric, surface: "mcp",
          $process_person_profile: false, $geoip_disable: true } }),
      signal: AbortSignal.timeout(2000), redirect: "manual",
    });
  } catch { /* Analytics must not affect discovery or emit sensitive diagnostics. */ }
}
