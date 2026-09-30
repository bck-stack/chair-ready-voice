// Demo data: Fade & Co., a one-chair barbershop in Dalston, London. Bookings are placed relative to "today".
import { localNow, addDays, dowOf } from "./engine.js";

export async function seed(db) {
  const schema = [
    "DELETE FROM messages", "DELETE FROM waitlist", "DELETE FROM bookings", "DELETE FROM hours", "DELETE FROM services", "DELETE FROM businesses",
  ];
  for (const q of schema) await db.prepare(q).run();
  await db.prepare("DELETE FROM sqlite_sequence").run().catch(() => {});

  await db.prepare(`INSERT INTO businesses (slug, name, kind, address, timezone, owner, deposit_days, deposit_amount)
    VALUES ('fade-and-co', 'Fade & Co.', 'barbershop (one chair)', '1 Example Yard, Dalston, London (fictional demo shop)', 'Europe/London', 'Marcus', '6', 5)`).run();
  const svc = [["Skin Fade", 45, 28], ["Classic Cut", 30, 22], ["Beard Trim & Shape", 20, 14], ["Cut + Beard", 60, 38], ["Kids Cut (under 12)", 30, 16]];
  for (const [n, m, p] of svc) await db.prepare("INSERT INTO services (business, name, minutes, price) VALUES ('fade-and-co', ?, ?, ?)").bind(n, m, p).run();
  const hours = [[0, null, null], [1, null, null], [2, "10:00", "19:00"], [3, "10:00", "19:00"], [4, "10:00", "19:00"], [5, "10:00", "19:00"], [6, "09:00", "17:00"]];
  for (const [d, o, c] of hours) {
    await db.prepare("INSERT INTO hours (business, dow, open, close, break_start, break_end) VALUES ('fade-and-co', ?, ?, ?, ?, ?)")
      .bind(d, o, c, o ? "13:30" : null, o ? "14:00" : null).run();
  }

  const today = localNow("Europe/London").date;
  const people = ["Kwame Asante", "Liam O'Connor", "Dev Patel", "Tyrone Walsh", "Josh Bennett", "Samir Haddad", "Marco Rossi", "Aaron Clarke", "Ellis Grant", "Noah Mensah", "Ricky Evans", "Femi Okafor"];
  const len = { 1: 45, 2: 30, 3: 20, 4: 60, 5: 30 };
  const add = (h, m) => { const t = +h.slice(0, 2) * 60 + +h.slice(3) + m; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  let n = 0;
  const put = async (date, time, sid, deposit = 0) => {
    const who = people[n++ % people.length];
    const phone = `07700 900${String(100 + n).padStart(3, "0")}`;
    await db.prepare("INSERT INTO bookings (business, service_id, customer, phone, start, end, deposit, source) VALUES ('fade-and-co', ?, ?, ?, ?, ?, ?, 'link')")
      .bind(sid, who, phone, `${date} ${time}`, `${date} ${add(time, len[sid])}`, deposit).run();
  };
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i), w = dowOf(d);
    if (w === 6) {
      for (const [t, s] of [["09:00", 1], ["09:45", 2], ["10:15", 4], ["11:15", 1], ["12:00", 5], ["12:30", 2], ["13:00", 3], ["14:00", 4], ["15:00", 1], ["15:45", 3], ["16:05", 3], ["16:30", 2]]) await put(d, t, s, 5);
      await db.prepare("INSERT INTO waitlist (business, day, customer, phone) VALUES ('fade-and-co', ?, 'Tunde Bakare', '07700 900401'), ('fade-and-co', ?, 'Callum Hughes', '07700 900402')").bind(d, d).run();
    } else if (w === 2 || w === 3) {
      await put(d, "10:30", 2); await put(d, "12:00", 1);
    } else if (w === 4 || w === 5) {
      await put(d, "10:00", 1); await put(d, "11:30", 4); await put(d, "14:30", 2); await put(d, "16:00", 3); await put(d, "17:30", 1);
    }
  }
  return { ok: true, today };
}
