-- Chair Ready Voice — appointment data for small, single-owner businesses.
-- Times are stored as local wall-clock strings (YYYY-MM-DD HH:MM) in the business's timezone.
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS waitlist;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS hours;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS businesses;

CREATE TABLE businesses (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  address TEXT NOT NULL,
  timezone TEXT NOT NULL,
  owner TEXT NOT NULL,
  deposit_days TEXT NOT NULL DEFAULT '',   -- comma-separated weekdays (0=Sun) that need a deposit
  deposit_amount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business TEXT NOT NULL REFERENCES businesses(slug),
  name TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE hours (
  business TEXT NOT NULL REFERENCES businesses(slug),
  dow INTEGER NOT NULL,               -- 0=Sun … 6=Sat
  open TEXT, close TEXT,              -- NULL = closed
  break_start TEXT, break_end TEXT,
  PRIMARY KEY (business, dow)
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business TEXT NOT NULL REFERENCES businesses(slug),
  service_id INTEGER NOT NULL REFERENCES services(id),
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',  -- booked | cancelled
  deposit INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'voice',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX bookings_day ON bookings(business, start);

CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business TEXT NOT NULL REFERENCES businesses(slug),
  day TEXT NOT NULL,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business TEXT NOT NULL REFERENCES businesses(slug),
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
