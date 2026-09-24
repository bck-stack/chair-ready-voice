// Smoke test: connect with the official MCP client over Streamable HTTP and run a booking.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const URL_ = process.argv[2] || "https://chair-ready-voice.sitecheck-api.workers.dev/mcp";
const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
console.log("protocol:", client.getServerVersion(), "|", (await client.listTools()).tools.map((t) => t.name).join(", "));
const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); console.log(`\n${name}${r.isError ? " (error)" : ""}:`, r.content[0].text.slice(0, 300)); return r; };
const info = JSON.parse((await call("get_business_info", {})).content[0].text);
const next = JSON.parse((await call("next_available", { service: "skin fade" })).content[0].text);
const d = next[0];
const b = JSON.parse((await call("book_appointment", { service: "skin fade", date: d.date, time: d.first_times[0], customer: "Test Client", phone: "07700 900999" })).content[0].text);
await call("find_my_booking", { phone: "07700 900999" });
await call("cancel_appointment", { booking_id: b.booking_id, phone: "07700 900999" });
await call("owner_daily_briefing", {});
await client.close();
