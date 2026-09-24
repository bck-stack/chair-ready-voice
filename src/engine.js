// Booking engine shared by the MCP server and the Alexa+ simulator.
// All times are local wall-clock strings in the business's timezone.

const pad = (n) => String(n).padStart(2, "0");
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export class BookingError extends Error {}

/** Current local date/time for a timezone: { date: "YYYY-MM-DD", time: "HH:MM", dow } */
export function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, dow: new Date(date + "T12:00:00Z").getUTCDay() };
}

export function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dowOf = (date) => new Date(date + "T12:00:00Z").getUTCDay();
export const spoken = (date) => {
  const d = new Date(date + "T12:00:00Z");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}`;
};

export async function business(db, slug) {
  const b = await db.prepare("SELECT * FROM businesses WHERE slug = ?").bind(slug).first();
  if (!b) throw new BookingError(`Unknown business "${slug}".`);
  return b;
}

export async function services(db, slug) {
  const { results } = await db.prepare("SELECT id, name, minutes, price FROM services WHERE business = ? ORDER BY id").bind(slug).all();
  return results;
}

/** Match a spoken service name ("skin fade", "beard") to a service row. */
export async function findService(db, slug, name) {
  const all = await services(db, slug);
  const q = String(name || "").toLowerCase().trim();
  const hit = all.find((s) => s.name.toLowerCase() === q)
    || all.find((s) => s.name.toLowerCase().includes(q))
    || all.find((s) => q.split(/\s+/).some((w) => w.length > 3 && s.name.toLowerCase().includes(w)));
  if (!hit) throw new BookingError(`No service called "${name}". Available: ${all.map((s) => s.name).join(", ")}.`);
  return hit;
}

function depositFor(b, date) {
  const days = String(b.deposit_days || "").split(",").filter(Boolean).map(Number);
  return days.includes(dowOf(date)) ? b.deposit_amount : 0;
}

/** Free start times for a service on a date (15-minute grid). */
export async function freeTimes(db, slug, date, serviceName) {
  const b = await business(db, slug);
  const svc = await findService(db, slug, serviceName);
  const h = await db.prepare("SELECT * FROM hours WHERE business = ? AND dow = ?").bind(slug, dowOf(date)).first();
  const base = { date, day: spoken(date), service: svc.name, minutes: svc.minutes, price: svc.price, deposit: depositFor(b, date) };
  if (!h || !h.open) return { ...base, open: false, times: [], note: `${b.name} is closed on ${DAYS[dowOf(date)]}s.` };
  const now = localNow(b.timezone);
  if (date < now.date) return { ...base, open: false, times: [], note: "That date is in the past." };
  const { results: taken } = await db.prepare(
    "SELECT start, end FROM bookings WHERE business = ? AND status = 'booked' AND substr(start,1,10) = ?",
  ).bind(slug, date).all();
  const busy = taken.map((t) => [toMin(t.start.slice(11)), toMin(t.end.slice(11))]);
  if (h.break_start) busy.push([toMin(h.break_start), toMin(h.break_end)]);
  const earliest = date === now.date ? Math.ceil((toMin(now.time) + 30) / 15) * 15 : 0;
  const times = [];
  for (let t = toMin(h.open); t + svc.minutes <= toMin(h.close); t += 15) {
    if (t < earliest) continue;
    if (busy.some(([s, e]) => t < e && t + svc.minutes > s)) continue;
    times.push(toHHMM(t));
  }
  return { ...base, open: true, times, note: times.length ? null : "Fully booked — the waitlist is open." };
}

/** Next days with availability, for "when's your next free slot?" */
export async function nextAvailable(db, slug, serviceName, fromDate, days = 7) {
  const b = await business(db, slug);
  const start = fromDate || localNow(b.timezone).date;
  const out = [];
  for (let i = 0; i < days && out.length < 3; i++) {
    const r = await freeTimes(db, slug, addDays(start, i), serviceName);
    if (r.times.length) out.push({ date: r.date, day: r.day, first_times: r.times.slice(0, 4), deposit: r.deposit });
  }
  return out;
}

async function log(db, slug, recipient, kind, body) {
  await db.prepare("INSERT INTO messages (business, recipient, kind, body) VALUES (?, ?, ?, ?)").bind(slug, recipient, kind, body).run();
}

export async function book(db, slug, { service, date, time, customer, phone, source = "voice" }) {
  const b = await business(db, slug);
  if (!customer || !phone) throw new BookingError("I need the customer's name and mobile number to book.");
  const avail = await freeTimes(db, slug, date, service);
  if (!avail.times.includes(time)) {
    throw new BookingError(avail.times.length
      ? `${time} isn't free on ${avail.day}. Closest free times: ${avail.times.slice(0, 5).join(", ")}.`
      : `${avail.day} has no free times for a ${avail.service}. ${avail.note || ""}`);
  }
  const svc = await findService(db, slug, service);
  const end = toHHMM(toMin(time) + svc.minutes);
  const r = await db.prepare(
    "INSERT INTO bookings (business, service_id, customer, phone, start, end, deposit, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(slug, svc.id, customer, phone, `${date} ${time}`, `${date} ${end}`, avail.deposit, source).run();
  const id = r.meta.last_row_id;
  const first = customer.split(" ")[0];
  const dep = avail.deposit ? ` A £${avail.deposit} deposit holds the slot — pay link: https://pay.example/${id}.` : "";
  await log(db, slug, `${customer} · ${phone}`, "confirmation",
    `Nice one ${first} — you're booked in at ${b.name} for a ${svc.name}, ${avail.day} at ${time}.${dep} Reply C to cancel. — ${b.owner}`);
  await log(db, slug, `${b.owner} (owner)`, "owner_note", `New booking by voice: ${customer}, ${svc.name}, ${avail.day} ${time}. Nothing for you to do.`);
  return { booking_id: id, business: b.name, service: svc.name, day: avail.day, date, time, ends: end, price: svc.price, deposit: avail.deposit, confirmation_sent_to: phone };
}

const norm = (p) => String(p || "").replace(/\D/g, "").slice(-9);

export async function findBookings(db, slug, phone) {
  const b = await business(db, slug);
  const now = localNow(b.timezone);
  const { results } = await db.prepare(
    `SELECT bk.id, bk.customer, bk.phone, bk.start, bk.deposit, s.name service FROM bookings bk JOIN services s ON s.id = bk.service_id
     WHERE bk.business = ? AND bk.status = 'booked' AND bk.start >= ? ORDER BY bk.start`,
  ).bind(slug, `${now.date} 00:00`).all();
  return results.filter((r) => norm(r.phone) === norm(phone)).map((r) => ({
    booking_id: r.id, customer: r.customer, service: r.service, day: spoken(r.start.slice(0, 10)), date: r.start.slice(0, 10), time: r.start.slice(11), deposit: r.deposit,
  }));
}

async function ownBooking(db, slug, id, phone) {
  const bk = await db.prepare("SELECT bk.*, s.name service FROM bookings bk JOIN services s ON s.id = bk.service_id WHERE bk.id = ? AND bk.business = ?").bind(id, slug).first();
  if (!bk || bk.status !== "booked") throw new BookingError("I couldn't find an active booking with that reference.");
  if (norm(bk.phone) !== norm(phone)) throw new BookingError("That booking belongs to a different phone number.");
  return bk;
}

export async function cancel(db, slug, { booking_id, phone }) {
  const b = await business(db, slug);
  const bk = await ownBooking(db, slug, booking_id, phone);
  await db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(bk.id).run();
  const date = bk.start.slice(0, 10), time = bk.start.slice(11);
  await log(db, slug, `${bk.customer} · ${bk.phone}`, "cancellation", `No worries ${bk.customer.split(" ")[0]}, your ${bk.service} on ${spoken(date)} at ${time} is cancelled.${bk.deposit ? ` Your £${bk.deposit} deposit will be refunded.` : ""} — ${b.owner}`);
  const { results: wl } = await db.prepare("SELECT * FROM waitlist WHERE business = ? AND day = ? ORDER BY created_at").bind(slug, date).all();
  for (const w of wl) {
    await log(db, slug, `${w.customer} · ${w.phone}`, "waitlist_offer", `Good news ${w.customer.split(" ")[0]}! ${time} on ${spoken(date)} just opened at ${b.name}. First to reply YES gets it. — ${b.owner}`);
  }
  await log(db, slug, `${b.owner} (owner)`, "owner_note", `${spoken(date)} ${time} was cancelled. ${wl.length ? `Offered it to ${wl.length} on the waitlist — nothing for you to do.` : "Slot is open again online."}`);
  return { cancelled: true, service: bk.service, day: spoken(date), time, waitlist_notified: wl.length, deposit_refunded: bk.deposit };
}

export async function reschedule(db, slug, { booking_id, phone, date, time }) {
  const bk = await ownBooking(db, slug, booking_id, phone);
  const nb = await book(db, slug, { service: bk.service, date, time, customer: bk.customer, phone: bk.phone, source: "voice-reschedule" });
  await cancel(db, slug, { booking_id: bk.id, phone });
  return { rescheduled: true, from: `${spoken(bk.start.slice(0, 10))} ${bk.start.slice(11)}`, to: `${nb.day} ${nb.time}`, new_booking_id: nb.booking_id, service: nb.service };
}

export async function joinWaitlist(db, slug, { date, customer, phone }) {
  const b = await business(db, slug);
  if (!customer || !phone) throw new BookingError("I need a name and mobile number for the waitlist.");
  await db.prepare("INSERT INTO waitlist (business, day, customer, phone) VALUES (?, ?, ?, ?)").bind(slug, date, customer, phone).run();
  const { count } = await db.prepare("SELECT COUNT(*) count FROM waitlist WHERE business = ? AND day = ?").bind(slug, date).first();
  await log(db, slug, `${customer} · ${phone}`, "waitlist_join", `You're on the waitlist for ${spoken(date)} at ${b.name}. If a slot opens we'll text you first. — ${b.owner}`);
  return { on_waitlist: true, day: spoken(date), position: count };
}

export async function ownerBriefing(db, slug, date) {
  const b = await business(db, slug);
  const day = date || localNow(b.timezone).date;
  const { results } = await db.prepare(
    `SELECT bk.customer, bk.start, bk.end, bk.deposit, bk.source, s.name service, s.price FROM bookings bk JOIN services s ON s.id = bk.service_id
     WHERE bk.business = ? AND bk.status = 'booked' AND substr(bk.start,1,10) = ? ORDER BY bk.start`,
  ).bind(slug, day).all();
  const { count: wl } = await db.prepare("SELECT COUNT(*) count FROM waitlist WHERE business = ? AND day = ?").bind(slug, day).first();
  const { count: voice } = await db.prepare("SELECT COUNT(*) count FROM bookings WHERE business = ? AND source LIKE 'voice%' AND created_at >= datetime('now','-7 days')").bind(slug).first();
  return {
    business: b.name, day: spoken(day), appointments: results.length,
    takings: results.reduce((s, r) => s + r.price, 0),
    schedule: results.map((r) => ({ time: r.start.slice(11), until: r.end.slice(11), customer: r.customer, service: r.service, deposit: r.deposit, via: r.source })),
    waitlist: wl, booked_by_voice_this_week: voice,
  };
}

export async function recentMessages(db, slug, limit = 12) {
  const { results } = await db.prepare("SELECT recipient, kind, body, created_at FROM messages WHERE business = ? ORDER BY id DESC LIMIT ?").bind(slug, limit).all();
  return results;
}
