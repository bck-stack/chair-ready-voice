// Booking engine tests. The clock is frozen on Wednesday 7 October 2026 (BST, UTC+1) unless a test moves it.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "./d1.mjs";
import * as E from "../src/engine.js";

const SLUG = "fade-and-co";
const WED = "2026-10-07", THU = "2026-10-08", SAT = "2026-10-10", SUN = "2026-10-11", NEXT_SAT = "2026-10-17";
const london = (date, time) => new Date(`${date}T${time}:00+01:00`);
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);

let db;
beforeEach(async () => {
  mock.timers.enable({ apis: ["Date"], now: london(WED, "09:00") });
  db = await demoDb();
});
afterEach(() => { db.close(); mock.timers.reset(); });

const messages = async (kind) => (await db.prepare("SELECT * FROM messages WHERE kind = ? ORDER BY id").bind(kind).all()).results;
const booked = async (date) => (await db.prepare("SELECT * FROM bookings WHERE status = 'booked' AND substr(start,1,10) = ? ORDER BY start").bind(date).all()).results;

test("the frozen clock is what the engine sees", () => {
  assert.deepEqual(E.localNow("Europe/London"), { date: WED, time: "09:00", dow: 3 });
});

test("free times respect opening hours, the break, existing bookings and service length", async () => {
  const r = await E.freeTimes(db, SLUG, THU, "skin fade");
  assert.equal(r.open, true);
  assert.equal(r.service, "Skin Fade");
  assert.equal(r.minutes, 45);
  // Thursday: 10:00–19:00, break 13:30–14:00, seeded bookings 10:00–10:45, 11:30–12:30, 14:30–15:00, 16:00–16:20, 17:30–18:15.
  assert.deepEqual(r.times, ["10:45", "12:30", "12:45", "15:00", "15:15", "16:30", "16:45", "18:15"]);

  // The same invariants, checked for every service on every open day of the week.
  for (let i = 0; i < 8; i++) {
    const date = E.addDays(WED, i);
    const h = await db.prepare("SELECT * FROM hours WHERE business = ? AND dow = ?").bind(SLUG, E.dowOf(date)).first();
    const busy = (await booked(date)).map((b) => [toMin(b.start.slice(11)), toMin(b.end.slice(11))]);
    for (const svc of await E.services(db, SLUG)) {
      const { times } = await E.freeTimes(db, SLUG, date, svc.name);
      if (!h.open) { assert.deepEqual(times, []); continue; }
      for (const t of times) {
        const s = toMin(t), e = s + svc.minutes;
        assert.ok(s >= toMin(h.open) && e <= toMin(h.close), `${date} ${t} ${svc.name} outside hours`);
        assert.ok(e <= toMin("13:30") || s >= toMin("14:00"), `${date} ${t} ${svc.name} overlaps the break`);
        assert.ok(!busy.some(([bs, be]) => s < be && e > bs), `${date} ${t} ${svc.name} overlaps a booking`);
        assert.equal(s % 15, 0);
      }
    }
  }
});

test("a longer service gets fewer start times than a shorter one", async () => {
  const beard = await E.freeTimes(db, SLUG, THU, "beard");
  const cutBeard = await E.freeTimes(db, SLUG, THU, "cut + beard");
  assert.equal(cutBeard.minutes, 60);
  assert.ok(cutBeard.times.every((t) => beard.times.includes(t)));
  assert.ok(cutBeard.times.length < beard.times.length);
  assert.ok(!cutBeard.times.includes("18:15"), "a 60-minute cut at 18:15 would run past closing");
});

test("closed days and past dates have no times", async () => {
  const sun = await E.freeTimes(db, SLUG, SUN, "skin fade");
  assert.equal(sun.open, false);
  assert.match(sun.note, /closed on Sundays/);
  const past = await E.freeTimes(db, SLUG, "2026-10-06", "skin fade");
  assert.deepEqual(past.times, []);
  assert.match(past.note, /past/);
});

test("past times today are excluded, with a 30-minute buffer", async () => {
  mock.timers.setTime(london(WED, "15:10").getTime());
  const r = await E.freeTimes(db, SLUG, WED, "classic cut");
  assert.ok(r.times.length > 0);
  assert.ok(r.times.every((t) => t >= "15:45"), r.times.join(","));
  assert.equal(r.times[0], "15:45");
  // Later days are unaffected by the time of day.
  assert.equal((await E.freeTimes(db, SLUG, THU, "classic cut")).times[0], "10:45");
});

test("after the last slot today, the note says so instead of claiming the day is fully booked", async () => {
  mock.timers.setTime(london(WED, "18:50").getTime());
  const r = await E.freeTimes(db, SLUG, WED, "classic cut");
  assert.deepEqual(r.times, []);
  assert.doesNotMatch(r.note, /Fully booked/);
  assert.match(r.note, /no more free times today/i);
});

test("Saturday carries the £5 deposit, weekdays don't", async () => {
  const sat = await E.freeTimes(db, SLUG, NEXT_SAT, "skin fade");
  assert.equal(sat.deposit, 5);
  assert.equal((await E.freeTimes(db, SLUG, THU, "skin fade")).deposit, 0);

  const b = await E.book(db, SLUG, { service: "skin fade", date: NEXT_SAT, time: sat.times[0], customer: "Jordan Lee", phone: "07700 900555" });
  assert.equal(b.deposit, 5);
  const [conf] = await messages("confirmation");
  assert.match(conf.body, /£5 deposit/);
  assert.match(conf.body, new RegExp(`pay\\.example/${b.booking_id}`));

  const w = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  assert.equal(w.deposit, 0);
  assert.doesNotMatch((await messages("confirmation"))[1].body, /deposit/);
});

test("the seeded Saturday is full for every service", async () => {
  for (const svc of await E.services(db, SLUG)) {
    const r = await E.freeTimes(db, SLUG, SAT, svc.name);
    assert.deepEqual(r.times, [], svc.name);
    assert.match(r.note, /waitlist/);
  }
});

test("booking a free time stores it, confirms to the customer and notes it for the owner", async () => {
  const b = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "12:30", customer: "Jordan Lee", phone: "07700 900555" });
  assert.equal(b.ends, "13:15");
  assert.equal(b.service, "Skin Fade");
  assert.equal(b.confirmation_sent_to, "07700 900555");
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(b.booking_id).first();
  assert.equal(row.start, `${THU} 12:30`);
  assert.equal(row.source, "voice");
  assert.equal((await messages("confirmation")).length, 1);
  assert.match((await messages("owner_note"))[0].body, /New booking by voice: Jordan Lee/);
  assert.ok(!(await E.freeTimes(db, SLUG, THU, "skin fade")).times.includes("12:30"));
});

test("booking a taken time fails with a helpful message naming the nearest free times", async () => {
  await assert.rejects(
    E.book(db, SLUG, { service: "skin fade", date: THU, time: "16:00", customer: "Jordan Lee", phone: "07700 900555" }),
    (e) => {
      assert.ok(e instanceof E.BookingError);
      assert.equal(e.message, "16:00 isn't free on Thursday 8 October. Closest free times: 15:00, 15:15, 16:30, 16:45, 18:15.");
      return true;
    },
  );
  await assert.rejects(E.book(db, SLUG, { service: "skin fade", date: SAT, time: "10:00", customer: "Jordan Lee", phone: "07700 900555" }),
    /Saturday 10 October has no free times for a Skin Fade\. Fully booked — the waitlist is open\./);
  await assert.rejects(E.book(db, SLUG, { service: "skin fade", date: THU, time: "12:30", customer: "", phone: "07700 900555" }), /name and mobile/);
  await assert.rejects(E.book(db, SLUG, { service: "perm", date: THU, time: "12:30", customer: "Jordan Lee", phone: "07700 900555" }), /No service called "perm"/);
  await assert.rejects(E.book(db, SLUG, { service: "   ", date: THU, time: "12:30", customer: "Jordan Lee", phone: "07700 900555" }), /No service called/);
  assert.equal((await booked(THU)).length, 5, "nothing was written");
});

test("phone matching ignores spaces, dashes and the +44 prefix", async () => {
  await E.book(db, SLUG, { service: "classic cut", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  for (const p of ["07700900555", "+44 7700 900555", "+447700900555", "0044 7700 900 555", "07700-900-555"]) {
    const r = await E.findBookings(db, SLUG, p);
    assert.equal(r.length, 1, p);
    assert.equal(r[0].customer, "Jordan Lee");
  }
  assert.deepEqual(await E.findBookings(db, SLUG, "07700 900556"), []);
});

test("find_my_booking only returns upcoming, active bookings", async () => {
  const b = await E.book(db, SLUG, { service: "classic cut", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  await db.prepare("INSERT INTO bookings (business, service_id, customer, phone, start, end) VALUES (?, 2, 'Jordan Lee', '07700 900555', '2026-10-01 10:00', '2026-10-01 10:30')").bind(SLUG).run();
  assert.deepEqual((await E.findBookings(db, SLUG, "07700900555")).map((r) => r.booking_id), [b.booking_id]);
  await E.cancel(db, SLUG, { booking_id: b.booking_id, phone: "07700900555" });
  assert.deepEqual(await E.findBookings(db, SLUG, "07700900555"), []);
});

test("reschedule moves the booking — it does not duplicate it", async () => {
  const b = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  const r = await E.reschedule(db, SLUG, { booking_id: b.booking_id, phone: "+44 7700 900555", date: "2026-10-09", time: "15:00" });
  assert.equal(r.rescheduled, true);
  assert.equal(r.to, "Friday 9 October 15:00");
  const mine = await E.findBookings(db, SLUG, "07700 900555");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].booking_id, r.new_booking_id);
  assert.equal(mine[0].date, "2026-10-09");
  assert.equal(mine[0].time, "15:00");
  assert.equal((await db.prepare("SELECT status FROM bookings WHERE id = ?").bind(b.booking_id).first()).status, "cancelled");
  assert.ok((await E.freeTimes(db, SLUG, THU, "skin fade")).times.includes("10:45"), "the old slot is free again");
});

test("reschedule can move a booking to an overlapping time on the same day", async () => {
  const b = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "15:00", customer: "Jordan Lee", phone: "07700 900555" });
  const r = await E.reschedule(db, SLUG, { booking_id: b.booking_id, phone: "07700 900555", date: THU, time: "15:15" });
  assert.equal(r.to, "Thursday 8 October 15:15");
  const mine = await E.findBookings(db, SLUG, "07700 900555");
  assert.deepEqual(mine.map((m) => m.time), ["15:15"]);
});

test("reschedule to a taken time leaves the original booking alone", async () => {
  const b = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  await assert.rejects(E.reschedule(db, SLUG, { booking_id: b.booking_id, phone: "07700 900555", date: THU, time: "10:00" }), /isn't free/);
  const mine = await E.findBookings(db, SLUG, "07700 900555");
  assert.deepEqual(mine.map((m) => [m.booking_id, m.time]), [[b.booking_id, "10:45"]]);
});

test("only the booking's own phone number can change it", async () => {
  const b = await E.book(db, SLUG, { service: "skin fade", date: THU, time: "10:45", customer: "Jordan Lee", phone: "07700 900555" });
  await assert.rejects(E.cancel(db, SLUG, { booking_id: b.booking_id, phone: "07700 900999" }), /different phone number/);
  await assert.rejects(E.reschedule(db, SLUG, { booking_id: b.booking_id, phone: "07700 900999", date: THU, time: "15:00" }), /different phone number/);
  await assert.rejects(E.cancel(db, SLUG, { booking_id: 99999, phone: "07700 900555" }), /couldn't find an active booking/);
  await E.cancel(db, SLUG, { booking_id: b.booking_id, phone: "07700 900555" });
  await assert.rejects(E.cancel(db, SLUG, { booking_id: b.booking_id, phone: "07700 900555" }), /couldn't find an active booking/);
});

test("cancelling offers the slot to every waitlisted customer and notifies the owner", async () => {
  await E.joinWaitlist(db, SLUG, { date: SAT, customer: "Priya Shah", phone: "07700 900777" });
  const [victim] = await booked(SAT);
  const r = await E.cancel(db, SLUG, { booking_id: victim.id, phone: victim.phone });
  assert.equal(r.cancelled, true);
  assert.equal(r.waitlist_notified, 3);
  assert.equal(r.deposit_refunded, 5);

  const offers = await messages("waitlist_offer");
  assert.deepEqual(offers.map((m) => m.recipient), ["Tunde Bakare · 07700 900401", "Callum Hughes · 07700 900402", "Priya Shah · 07700 900777"]);
  assert.ok(offers.every((m) => m.body.includes("09:00 on Saturday 10 October just opened")));
  const [cancelMsg] = await messages("cancellation");
  assert.match(cancelMsg.body, /£5 deposit will be refunded/);
  const owner = (await messages("owner_note")).at(-1);
  assert.equal(owner.recipient, "Marcus (owner)");
  assert.match(owner.body, /Offered it to 3 on the waitlist/);

  // The slot is bookable again.
  assert.ok((await E.freeTimes(db, SLUG, SAT, "skin fade")).times.includes("09:00"));
});

test("cancelling on a day with no waitlist tells the owner the slot is open again", async () => {
  const [bk] = await booked(THU);
  const r = await E.cancel(db, SLUG, { booking_id: bk.id, phone: bk.phone });
  assert.equal(r.waitlist_notified, 0);
  assert.deepEqual(await messages("waitlist_offer"), []);
  assert.match((await messages("owner_note")).at(-1).body, /Slot is open again online/);
});

test("joining the waitlist twice keeps one place in the queue", async () => {
  const a = await E.joinWaitlist(db, SLUG, { date: SAT, customer: "Priya Shah", phone: "07700 900777" });
  assert.equal(a.position, 3);
  const b = await E.joinWaitlist(db, SLUG, { date: SAT, customer: "Priya Shah", phone: "+44 7700 900777" });
  assert.equal(b.position, 3);
  assert.equal(b.already_on_list, true);
  const { count } = await db.prepare("SELECT COUNT(*) count FROM waitlist WHERE day = ?").bind(SAT).first();
  assert.equal(count, 3);
});

test("next_available skips closed and full days", async () => {
  mock.timers.setTime(london("2026-10-09", "18:50").getTime()); // Friday evening: rest of Friday gone, Saturday full, Sun/Mon closed
  const r = await E.nextAvailable(db, SLUG, "skin fade");
  assert.equal(r[0].date, "2026-10-13");
  assert.equal(r[0].day, "Tuesday 13 October");
  assert.ok(r.length <= 3);
  assert.ok(r.every((d) => d.first_times.length > 0 && d.first_times.length <= 4));
});

test("the owner's briefing lists the day in order with takings and waitlist", async () => {
  await E.book(db, SLUG, { service: "skin fade", date: THU, time: "12:30", customer: "Jordan Lee", phone: "07700 900555" });
  const r = await E.ownerBriefing(db, SLUG, THU);
  assert.equal(r.appointments, 6);
  assert.deepEqual(r.schedule.map((s) => s.time), ["10:00", "11:30", "12:30", "14:30", "16:00", "17:30"]);
  assert.equal(r.takings, 28 + 38 + 28 + 22 + 14 + 28);
  assert.equal(r.booked_by_voice_this_week, 1);
  assert.equal((await E.ownerBriefing(db, SLUG, SAT)).waitlist, 2);
  assert.equal((await E.ownerBriefing(db, SLUG)).day, "Wednesday 7 October");
});
