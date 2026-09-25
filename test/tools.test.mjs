// Tool catalogue tests: JSON schemas for function calling and zod input validation.
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "./d1.mjs";
import { TOOLS, jsonSchemas, runTool } from "../src/tools.js";

let db;
before(async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T09:00:00+01:00") });
  db = await demoDb();
});
after(() => { db.close(); mock.timers.reset(); });

test("every tool has a valid JSON schema via jsonSchemas()", () => {
  const schemas = jsonSchemas();
  assert.equal(schemas.length, TOOLS.length);
  assert.equal(new Set(schemas.map((s) => s.name)).size, TOOLS.length, "tool names are unique");
  for (const s of schemas) {
    assert.match(s.name, /^[a-z][a-z0-9_]{0,63}$/, s.name);
    assert.ok(s.description.length > 20, `${s.name} has a description`);
    assert.equal(s.parameters.type, "object", s.name);
    assert.equal(s.parameters.$schema, undefined, `${s.name} has no $schema (Workers AI rejects it)`);
    assert.ok(s.parameters.properties && typeof s.parameters.properties === "object", s.name);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)), s.name);
    for (const r of s.parameters.required || []) assert.ok(r in s.parameters.properties, `${s.name}: required ${r} is a property`);
    for (const [k, p] of Object.entries(s.parameters.properties)) {
      assert.ok(p.type || p.anyOf || p.oneOf, `${s.name}.${k} has a type`);
      if (p.pattern) assert.doesNotThrow(() => new RegExp(p.pattern), `${s.name}.${k} pattern compiles`);
    }
    assert.ok(!(s.parameters.required || []).includes("business"), `${s.name}: business is optional`);
  }
  const book = schemas.find((s) => s.name === "book_appointment");
  assert.deepEqual([...book.parameters.required].sort(), ["customer", "date", "phone", "service", "time"]);
});

test("zod validation rejects bad dates", async () => {
  for (const date of ["2026-10-7", "07/10/2026", "tomorrow", "2026-13-01", "2026-02-30", "2026-00-10", "2026-10-32", ""]) {
    await assert.rejects(runTool(db, "find_available_times", { service: "skin fade", date }), /Invalid arguments: date/, date);
  }
  await assert.rejects(runTool(db, "owner_daily_briefing", { date: "2026-02-29" }), /Invalid arguments: date/);
  const leap = await runTool(db, "find_available_times", { service: "skin fade", date: "2028-02-29" });
  assert.equal(leap.day, "Tuesday 29 February");
});

test("zod validation rejects bad times", async () => {
  const base = { service: "skin fade", date: "2026-10-08", customer: "Jordan Lee", phone: "07700 900555" };
  for (const time of ["9:00", "24:00", "10:60", "3pm", "10:00:00", ""]) {
    await assert.rejects(runTool(db, "book_appointment", { ...base, time }), /Invalid arguments: time/, time);
  }
});

test("zod validation rejects missing or malformed fields", async () => {
  await assert.rejects(runTool(db, "book_appointment", { service: "skin fade", date: "2026-10-08", time: "10:45", customer: "J", phone: "07700 900555" }), /customer/);
  await assert.rejects(runTool(db, "find_my_booking", { phone: "123" }), /phone/);
  await assert.rejects(runTool(db, "cancel_appointment", { booking_id: "abc", phone: "07700 900555" }), /booking_id/);
  await assert.rejects(runTool(db, "cancel_appointment", { booking_id: 1.5, phone: "07700 900555" }), /booking_id/);
  await assert.rejects(runTool(db, "find_available_times", { date: "2026-10-08" }), /service/);
  await assert.rejects(runTool(db, "no_such_tool", {}), /Unknown tool/);
});

test("business defaults to fade-and-co and valid calls go through", async () => {
  const info = await runTool(db, "get_business_info", {});
  assert.equal(info.name, "Fade & Co.");
  assert.equal(info.today, "2026-10-07");
  assert.equal(info.services.length, 5);
  assert.equal(info.deposit_rule, "£5 deposit on Sat");
  assert.ok(info.hours.includes("Sat: 09:00–17:00 (break 13:30–14:00)"));
  const r = await runTool(db, "find_available_times", { service: "classic cut", date: "2026-10-08" });
  assert.equal(r.times[0], "10:45");
  await assert.rejects(runTool(db, "get_business_info", { business: "nope" }), /Unknown business/);
});

test("placeholder or invented customer details are rejected, so the agent has to ask", async () => {
  const base = { date: "2026-10-10" };
  for (const [customer, phone] of [["unknown", "07700 900555"], ["John Doe", "07700 900555"], ["Jordan Lee", "unknown"], ["Jordan Lee", "07123456789"], ["Jordan Lee", "12345"]]) {
    await assert.rejects(runTool(db, "join_waitlist", { ...base, customer, phone }), /Invalid arguments/, `${customer} / ${phone}`);
  }
  const ok = await runTool(db, "join_waitlist", { ...base, customer: "Jordan Lee", phone: "07700 900555" });
  assert.equal(ok.on_waitlist, true);
});

test("cancel needs the customer's explicit confirmation; booking_id may arrive as a string", async () => {
  const b = await runTool(db, "book_appointment", { service: "beard trim", date: "2026-10-08", time: "12:45", customer: "Priya Shah", phone: "07700 900321" });
  await assert.rejects(runTool(db, "cancel_appointment", { booking_id: b.booking_id, phone: "07700 900321" }), /customer_confirmed/);
  const c = await runTool(db, "cancel_appointment", { booking_id: String(b.booking_id), phone: "07700 900321", customer_confirmed: true });
  assert.equal(c.cancelled, true);
});
