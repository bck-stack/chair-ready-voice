// Smoke test against a live deployment: connect with the official MCP client over Streamable HTTP and run a booking.
// Usage: node test/mcp-client.mjs [https://<your-worker>/mcp]   (the offline suite is `npm test`)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const URL_ = process.argv[2] || "https://chair-ready-voice.sitecheck-api.workers.dev/mcp";
const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
const caps = client.getServerCapabilities();
console.log("server:", client.getServerVersion(), "|", (await client.listTools()).tools.map((t) => t.name).join(", "));
if (caps.resources) console.log("resources:", (await client.listResources()).resources.map((r) => r.uri).join(", "));
if (caps.prompts) console.log("prompts:", (await client.listPrompts()).prompts.map((p) => p.name).join(", "));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n${name}${r.isError ? " (error)" : ""}:`, r.content[0].text.slice(0, 300));
  if (r.isError) throw new Error(`${name} failed`);
  return r.structuredContent;
};
await call("get_business_info", {});
const next = await call("next_available", { service: "skin fade" });
const d = next.items[0];
const b = await call("book_appointment", { service: "skin fade", date: d.date, time: d.first_times[0], customer: "Test Client", phone: "07700 900999" });
await call("find_my_booking", { phone: "07700 900999" });
await call("cancel_appointment", { booking_id: b.booking_id, phone: "07700 900999", customer_confirmed: true });
await call("owner_daily_briefing", {});
await client.close();
