// End-to-end MCP tests: the official SDK client talks Streamable HTTP to the Worker's fetch handler, in-process.
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import worker from "../src/worker.js";
import { TOOLS } from "../src/tools.js";
import { demoDb } from "./d1.mjs";

const URL_ = new URL("https://chair-ready-voice.test/mcp");
let db, env, requests;

async function connect() {
  const client = new Client({ name: "test", version: "1.0.0" });
  const fetch = async (url, init) => {
    const req = new Request(url, init);
    requests.push(req.headers.get("mcp-session-id"));
    return worker.fetch(req, env);
  };
  await client.connect(new StreamableHTTPClientTransport(URL_, { fetch }));
  return client;
}

before(async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T09:00:00+01:00") });
  db = await demoDb();
  env = { DB: db };
  requests = [];
});
after(() => { db.close(); mock.timers.reset(); });

test("initialises on the latest spec version, statelessly", async () => {
  const client = await connect();
  assert.equal(LATEST_PROTOCOL_VERSION, "2025-11-25");
  assert.equal(client.getServerVersion().name, "chair-ready-voice");
  assert.ok(client.getServerCapabilities().tools);
  assert.ok(client.getServerCapabilities().resources);
  assert.ok(client.getServerCapabilities().prompts);
  assert.match(client.getInstructions(), /book_appointment/);
  await client.listTools();
  assert.ok(requests.every((id) => id === null), "no Mcp-Session-Id is ever issued");
  await client.close();
});

test("every tool declares an outputSchema and annotations", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), TOOLS.map((t) => t.name));
  for (const t of tools) {
    assert.equal(t.outputSchema?.type, "object", `${t.name} outputSchema`);
    assert.ok(Object.keys(t.outputSchema.properties).length > 0, t.name);
    assert.equal(typeof t.annotations.readOnlyHint, "boolean", t.name);
    assert.ok(!(t.inputSchema.required || []).includes("business"), `${t.name}: business is optional`);
  }
  assert.equal(tools.find((t) => t.name === "cancel_appointment").annotations.destructiveHint, true);
  assert.equal(tools.find((t) => t.name === "find_available_times").annotations.readOnlyHint, true);
  await client.close();
});

test("a full booking flow returns structuredContent that matches each outputSchema", async () => {
  const client = await connect();
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args }); // the client validates structuredContent against outputSchema
    assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
    assert.ok(r.structuredContent, `${name} has structuredContent`);
    assert.equal(r.content[0].type, "text");
    return r.structuredContent;
  };
  const info = await call("get_business_info", {});
  assert.equal(info.today, "2026-10-07");
  assert.equal(info.timezone, "Europe/London");

  const next = await call("next_available", { service: "skin fade" });
  assert.ok(Array.isArray(next.items) && next.items.length > 0);
  const times = await call("find_available_times", { service: "skin fade", date: "2026-10-08" });
  assert.equal(times.note, null);

  const b = await call("book_appointment", { service: "skin fade", date: "2026-10-08", time: times.times[0], customer: "Test Client", phone: "07700 900999" });
  assert.equal(b.time, "10:45");
  const mine = await call("find_my_booking", { phone: "+44 7700 900999" });
  assert.deepEqual(mine.items.map((m) => m.booking_id), [b.booking_id]);
  const moved = await call("reschedule_appointment", { booking_id: b.booking_id, phone: "07700 900999", date: "2026-10-08", time: "12:30" });
  const wl = await call("join_waitlist", { date: "2026-10-10", customer: "Test Client", phone: "07700 900999" });
  assert.equal(wl.position, 3);
  const c = await call("cancel_appointment", { booking_id: moved.new_booking_id, phone: "07700 900999", customer_confirmed: true });
  assert.equal(c.cancelled, true);
  const brief = await call("owner_daily_briefing", { date: "2026-10-08" });
  assert.equal(brief.appointments, 5);
  await client.close();
});

test("booking errors come back as isError results with a sentence to say aloud", async () => {
  const client = await connect();
  const r = await client.callTool({ name: "book_appointment", arguments: { service: "skin fade", date: "2026-10-08", time: "10:00", customer: "Test Client", phone: "07700 900999" } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /^10:00 isn't free on Thursday 8 October\. Closest free times: /);
  const bad = await client.callTool({ name: "find_available_times", arguments: { service: "skin fade", date: "2026-02-30" } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /date/);
  await client.close();
});

test("the business info resource and the book_haircut prompt", async () => {
  const client = await connect();
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri), ["business://fade-and-co/info"]);
  const { contents } = await client.readResource({ uri: "business://fade-and-co/info" });
  assert.equal(contents[0].mimeType, "application/json");
  const info = JSON.parse(contents[0].text);
  assert.equal(info.name, "Fade & Co.");
  assert.equal(info.services.length, 5);

  const { prompts } = await client.listPrompts();
  const p = prompts.find((x) => x.name === "book_haircut");
  assert.ok(p);
  assert.deepEqual(p.arguments.map((a) => [a.name, a.required ?? false]), [["service", false], ["when", false], ["name", false]]);
  const got = await client.getPrompt({ name: "book_haircut", arguments: { service: "skin fade", when: "tomorrow afternoon", name: "Sam" } });
  assert.equal(got.messages[0].role, "user");
  assert.match(got.messages[0].content.text, /^I'd like to book a skin fade at Fade & Co\. tomorrow afternoon\. My name is Sam\./);
  const plain = await client.getPrompt({ name: "book_haircut", arguments: {} });
  assert.match(plain.messages[0].content.text, /^I'd like to book a haircut at Fade & Co\.\n/);
  await client.close();
});

test("the simulator's JSON endpoints still work", async () => {
  const health = await worker.fetch(new Request("https://x.test/health"), env);
  assert.deepEqual(await health.json(), { ok: true });
  const state = await (await worker.fetch(new Request("https://x.test/api/state?date=2026-10-10"), env)).json();
  assert.equal(state.today, "2026-10-07");
  assert.equal(state.briefing.day, "Saturday 10 October");
  const page = await worker.fetch(new Request("https://x.test/"), env);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal((await worker.fetch(new Request("https://x.test/nope"), env)).status, 404);
});
