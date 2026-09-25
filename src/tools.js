// Tool catalogue: one definition drives both the MCP server and the Alexa+ simulator's agent.
import { z } from "zod";
import * as E from "./engine.js";

const biz = z.string().default("fade-and-co").describe('Business id. Default "fade-and-co".');
const realDate = (s) => { const d = new Date(s + "T12:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const date = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine(realDate, "not a real calendar date")
  .describe("Date as YYYY-MM-DD in the business's local timezone.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("Start time as HH:MM (24h), must be one of the free times.");
const phone = z.string().min(6).describe("Customer's mobile number.");

export const TOOLS = [
  {
    name: "get_business_info",
    title: "Business info and services",
    description: "Name, address, opening hours rules, deposit rules and the list of services (with length and price) for an appointment business. Call this first if you don't know the services.",
    input: { business: biz },
    readOnly: true,
    run: async (db, a) => {
      const b = await E.business(db, a.business);
      const now = E.localNow(b.timezone);
      const { results: hours } = await db.prepare("SELECT * FROM hours WHERE business = ? ORDER BY dow").bind(a.business).all();
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return {
        name: b.name, kind: b.kind, address: b.address, owner: b.owner, today: now.date, now: now.time,
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
    readOnly: true,
    run: (db, a) => E.freeTimes(db, a.business, a.date, a.service),
  },
  {
    name: "next_available",
    title: "Next available days",
    description: "The next up to 3 days that have free times for a service (with the first few times each day). Use when the customer asks 'when's your next slot' or has no date in mind.",
    input: { business: biz, service: z.string(), from_date: date.optional() },
    readOnly: true,
    run: (db, a) => E.nextAvailable(db, a.business, a.service, a.from_date),
  },
  {
    name: "book_appointment",
    title: "Book an appointment",
    description: "Books a free time and sends the customer a confirmation. Only call after the customer has chosen a time AND given their name and mobile number. Returns deposit if the day requires one.",
    input: { business: biz, service: z.string(), date, time, customer: z.string().min(2).describe("Customer's full name."), phone },
    run: (db, a) => E.book(db, a.business, a),
  },
  {
    name: "find_my_booking",
    title: "Find a customer's bookings",
    description: "Upcoming bookings for a mobile number. Use before cancelling or rescheduling to get the booking_id.",
    input: { business: biz, phone },
    readOnly: true,
    run: (db, a) => E.findBookings(db, a.business, a.phone),
  },
  {
    name: "reschedule_appointment",
    title: "Reschedule",
    description: "Moves an existing booking to a new free date/time. Requires booking_id (from find_my_booking) and the same mobile number.",
    input: { business: biz, booking_id: z.number().int(), phone, date, time },
    run: (db, a) => E.reschedule(db, a.business, a),
  },
  {
    name: "cancel_appointment",
    title: "Cancel",
    description: "Cancels a booking. The freed slot is automatically offered to everyone on that day's waitlist, and the owner is notified. Confirm with the customer before calling.",
    input: { business: biz, booking_id: z.number().int(), phone },
    destructive: true,
    run: (db, a) => E.cancel(db, a.business, a),
  },
  {
    name: "join_waitlist",
    title: "Join the waitlist",
    description: "Adds the customer to the waitlist for a full day. They get a message the moment a slot opens.",
    input: { business: biz, date, customer: z.string().min(2), phone },
    run: (db, a) => E.joinWaitlist(db, a.business, a),
  },
  {
    name: "owner_daily_briefing",
    title: "Owner's daily briefing",
    description: "For the business owner: the day's appointments in order, takings, waitlist size and how many bookings came in by voice this week.",
    input: { business: biz, date: date.optional() },
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

export async function runTool(db, name, args) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new E.BookingError(`Unknown tool ${name}`);
  const parsed = z.object(t.input).safeParse(args || {});
  if (!parsed.success) throw new E.BookingError(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return t.run(db, parsed.data);
}
