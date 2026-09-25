// Tool catalogue: one definition drives both the MCP server and the Alexa+ simulator's agent.
import { z } from "zod";
import * as E from "./engine.js";

const biz = z.string().default("fade-and-co").describe('Business id. Default "fade-and-co".');
const realDate = (s) => { const d = new Date(s + "T12:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const date = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine(realDate, "not a real calendar date")
  .describe("Date as YYYY-MM-DD in the business's local timezone.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("Start time as HH:MM (24h), must be one of the free times.");
const bookingId = z.coerce.number().int().positive().describe("booking_id from find_my_booking.");
const PLACEHOLDER = /^(unknown|n\/?a|none|null|test|customer|john doe|jane doe|john smith)$/i;
const phone = z.string().refine((v) => v.replace(/\D/g, "").length >= 10 && !/^0?7123456789$|^0+$|123456789/.test(v.replace(/\D/g, "")), {
  message: "ask the customer for their real mobile number (at least 10 digits) — never invent one",
}).describe("Customer's mobile number exactly as they said it.");
const person = z.string().trim().min(2).refine((v) => !PLACEHOLDER.test(v), { message: "ask the customer for their name — never use a placeholder" })
  .describe("Customer's full name exactly as they said it.");

// Output shapes (MCP outputSchema). Tools that return a list are wrapped as { items: [...] } in structuredContent.
const spokenDay = z.string().describe('Date as it should be said aloud, e.g. "Saturday 10 October".');
const hhmm = z.string().describe("HH:MM, 24h local time.");
const money = z.number().describe("Pounds sterling.");
const out = {
  info: {
    name: z.string(), kind: z.string(), address: z.string(), owner: z.string(), timezone: z.string(),
    today: z.string().describe("Today's local date, YYYY-MM-DD."), now: hhmm,
    hours: z.array(z.string()), deposit_rule: z.string(),
    services: z.array(z.object({ id: z.number().int(), name: z.string(), minutes: z.number().int(), price: money })),
  },
  times: {
    date: z.string(), day: spokenDay, service: z.string(), minutes: z.number().int(), price: money,
    deposit: money.describe("Deposit needed to hold a slot on this day (0 = none)."),
    open: z.boolean(), times: z.array(hhmm).describe("Free start times, earliest first."), note: z.string().nullable(),
  },
  next: { items: z.array(z.object({ date: z.string(), day: spokenDay, first_times: z.array(hhmm), deposit: money })) },
  booked: {
    booking_id: z.number().int(), business: z.string(), service: z.string(), day: spokenDay, date: z.string(), time: hhmm, ends: hhmm,
    price: money, deposit: money, confirmation_sent_to: z.string(),
  },
  mine: {
    items: z.array(z.object({
      booking_id: z.number().int(), customer: z.string(), service: z.string(), day: spokenDay, date: z.string(), time: hhmm, deposit: money,
    })),
  },
  moved: { rescheduled: z.boolean(), from: z.string(), to: z.string(), new_booking_id: z.number().int(), service: z.string() },
  cancelled: {
    cancelled: z.boolean(), service: z.string(), day: spokenDay, time: hhmm,
    waitlist_notified: z.number().int().describe("How many waitlisted customers were offered the freed slot."), deposit_refunded: money,
  },
  waitlist: { on_waitlist: z.boolean(), day: spokenDay, position: z.number().int(), already_on_list: z.boolean().optional() },
  briefing: {
    business: z.string(), day: spokenDay, appointments: z.number().int(), takings: money,
    schedule: z.array(z.object({ time: hhmm, until: hhmm, customer: z.string(), service: z.string(), deposit: money, via: z.string() })),
    waitlist: z.number().int(), booked_by_voice_this_week: z.number().int(),
  },
};

export const TOOLS = [
  {
    name: "get_business_info",
    title: "Business info and services",
    description: "Name, address, opening hours rules, deposit rules and the list of services (with length and price) for an appointment business. Call this first if you don't know the services.",
    input: { business: biz },
    output: out.info,
    readOnly: true,
    run: async (db, a) => {
      const b = await E.business(db, a.business);
      const now = E.localNow(b.timezone);
      const { results: hours } = await db.prepare("SELECT * FROM hours WHERE business = ? ORDER BY dow").bind(a.business).all();
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return {
        name: b.name, kind: b.kind, address: b.address, owner: b.owner, timezone: b.timezone, today: now.date, now: now.time,
        hours: hours.map((h) => `${dayNames[h.dow]}: ${h.open ? `${h.open}–${h.close}${h.break_start ? ` (break ${h.break_start}–${h.break_end})` : ""}` : "closed"}`),
        deposit_rule: b.deposit_amount ? `£${b.deposit_amount} deposit on ${b.deposit_days.split(",").map((d) => dayNames[d]).join(", ")}` : "none",
        services: await E.services(db, a.business),
      };
    },
  },
  {
    name: "find_available_times",
    title: "Find free times",
    description: "Free start times for a service on a specific date, computed from opening hours, breaks and existing bookings. Returns an empty list with a note if closed or full.",
    input: { business: biz, service: z.string().describe('Service name, e.g. "skin fade", "beard trim".'), date },
    output: out.times,
    readOnly: true,
    run: (db, a) => E.freeTimes(db, a.business, a.date, a.service),
  },
  {
    name: "next_available",
    title: "Next available days",
    description: "The next up to 3 days that have free times for a service (with the first few times each day). Use when the customer asks 'when's your next slot' or has no date in mind.",
    input: { business: biz, service: z.string(), from_date: date.optional() },
    output: out.next,
    readOnly: true,
    run: (db, a) => E.nextAvailable(db, a.business, a.service, a.from_date),
  },
  {
    name: "book_appointment",
    title: "Book an appointment",
    description: "Books a free time and sends the customer a confirmation. Only call after the customer has chosen a time AND given their name and mobile number. Returns deposit if the day requires one.",
    input: { business: biz, service: z.string(), date, time, customer: person, phone },
    output: out.booked,
    run: (db, a) => E.book(db, a.business, a),
  },
  {
    name: "find_my_booking",
    title: "Find a customer's bookings",
    description: "Upcoming bookings for a mobile number. Use before cancelling or rescheduling to get the booking_id.",
    input: { business: biz, phone },
    output: out.mine,
    readOnly: true,
    run: (db, a) => E.findBookings(db, a.business, a.phone),
  },
  {
    name: "reschedule_appointment",
    title: "Reschedule",
    description: "Moves an existing booking to a new free date/time. Requires booking_id (from find_my_booking) and the same mobile number.",
    input: { business: biz, booking_id: bookingId, phone, date, time },
    output: out.moved,
    run: (db, a) => E.reschedule(db, a.business, a),
  },
  {
    name: "cancel_appointment",
    title: "Cancel",
    description: "Cancels a booking. The freed slot is automatically offered to everyone on that day's waitlist, and the owner is notified. Confirm with the customer before calling.",
    input: { business: biz, booking_id: bookingId, phone, customer_confirmed: z.literal(true).describe("Set to true only after the customer has said yes to cancelling this specific booking.") },
    output: out.cancelled,
    destructive: true,
    run: (db, a) => E.cancel(db, a.business, a),
  },
  {
    name: "join_waitlist",
    title: "Join the waitlist",
    description: "Adds the customer to the waitlist for a full day. They get a message the moment a slot opens.",
    input: { business: biz, date, customer: person, phone },
    output: out.waitlist,
    run: (db, a) => E.joinWaitlist(db, a.business, a),
  },
  {
    name: "owner_daily_briefing",
    title: "Owner's daily briefing",
    description: "For the business owner: the day's appointments in order, takings, waitlist size and how many bookings came in by voice this week.",
    input: { business: biz, date: date.optional() },
    output: out.briefing,
    readOnly: true,
    run: (db, a) => E.ownerBriefing(db, a.business, a.date),
  },
];

/** JSON Schema for LLM function calling (Workers AI). */
export function jsonSchemas() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(z.object(t.input), { io: "input" }); // input view: defaulted fields stay optional
    delete schema.$schema;
    return { name: t.name, description: t.description, parameters: schema };
  });
}

/** Wrap a tool's return value as MCP structuredContent (which must be an object). */
export const structured = (value) => (Array.isArray(value) ? { items: value } : value);

export async function runTool(db, name, args) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new E.BookingError(`Unknown tool ${name}`);
  const parsed = z.object(t.input).safeParse(args || {});
  if (!parsed.success) throw new E.BookingError(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return t.run(db, parsed.data);
}
