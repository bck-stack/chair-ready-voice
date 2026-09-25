// A tiny in-memory stand-in for Cloudflare D1, backed by better-sqlite3.
// Implements only what src/ uses: prepare(sql).bind(...).first() / .all() / .run() → { meta: { last_row_id, changes } }.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { seed } from "../src/seed.js";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : p))); }
  get stmt() { return this.db.prepare(this.sql); }
  async first(column) {
    const s = this.stmt;
    const row = s.reader ? s.get(...this.params) ?? null : (s.run(...this.params), null);
    return column && row ? row[column] : row;
  }
  async all() {
    const s = this.stmt;
    const results = s.reader ? s.all(...this.params) : (s.run(...this.params), []);
    return { results, success: true, meta: {} };
  }
  async run() {
    const s = this.stmt;
    if (s.reader) return { results: s.all(...this.params), success: true, meta: { changes: 0, last_row_id: 0 } };
    const r = s.run(...this.params);
    return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class MemoryD1 {
  constructor() { this.sqlite = new Database(":memory:"); this.sqlite.exec(SCHEMA); }
  prepare(sql) { return new Statement(this.sqlite, sql); }
  async batch(statements) { return Promise.all(statements.map((s) => s.run())); }
  async exec(sql) { this.sqlite.exec(sql); return { count: 1 }; }
  close() { this.sqlite.close(); }
}

/** Fresh database with the Fade & Co. demo data, seeded relative to the (mocked) current date. */
export async function demoDb() {
  const db = new MemoryD1();
  await seed(db);
  return db;
}
