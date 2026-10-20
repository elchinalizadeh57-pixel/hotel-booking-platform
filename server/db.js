const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS agencies(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, voen TEXT, country TEXT, contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending', credit_limit REAL NOT NULL DEFAULT 0, debt REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hotels(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT, city TEXT, address TEXT, lat REAL, lng REAL,
  stars INTEGER DEFAULT 3, description TEXT, images TEXT DEFAULT '[]', amenities TEXT DEFAULT '[]',
  meal TEXT DEFAULT 'RO', price_model TEXT NOT NULL DEFAULT 'netto', source TEXT DEFAULT 'direct',
  status TEXT NOT NULL DEFAULT 'approved', checkin TEXT DEFAULT '14:00', checkout TEXT DEFAULT '12:00',
  cancel_policy TEXT DEFAULT 'Free cancellation up to 48 hours before check-in', website TEXT, instagram TEXT,
  rating REAL DEFAULT 8.0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, phone TEXT, name TEXT, pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tourist', agency_id INTEGER REFERENCES agencies(id),
  hotel_id INTEGER REFERENCES hotels(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hotel_claims(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), hotel_id INTEGER, new_name TEXT,
  city TEXT, country TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS room_types(
  id INTEGER PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), name TEXT NOT NULL,
  max_guests INTEGER DEFAULT 2, bed TEXT, area INTEGER, amenities TEXT DEFAULT '[]', image TEXT,
  base_price REAL NOT NULL, count INTEGER NOT NULL DEFAULT 5);
CREATE TABLE IF NOT EXISTS inventory(
  room_type_id INTEGER NOT NULL REFERENCES room_types(id), date TEXT NOT NULL, available INTEGER NOT NULL,
  price REAL, closed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room_type_id, date),
  CHECK(available >= 0));
CREATE TABLE IF NOT EXISTS pricing_rules(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL, scope_ref TEXT, percent REAL NOT NULL,
  date_from TEXT, date_to TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY, ref TEXT UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id),
  hotel_id INTEGER NOT NULL REFERENCES hotels(id), room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  check_in TEXT, check_out TEXT, rooms INTEGER, adults INTEGER, children INTEGER,
  guest_name TEXT, guest_email TEXT, guest_phone TEXT, channel TEXT, pay_method TEXT,
  status TEXT NOT NULL, total_usd REAL, currency TEXT, total_cur REAL, snapshot TEXT,
  room_number TEXT, hold_expires TEXT, idem_key TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, idem_key));
CREATE TABLE IF NOT EXISTS booking_history(
  id INTEGER PRIMARY KEY, booking_id INTEGER, status TEXT, note TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, booking_id INTEGER, amount_usd REAL, status TEXT, last4 TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS refunds(
  id INTEGER PRIMARY KEY, booking_id INTEGER, amount_usd REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT, read INTEGER DEFAULT 0, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, detail TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY, channel TEXT NOT NULL, dedupe TEXT UNIQUE, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, done_at TEXT);
CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY, provider TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, adapter TEXT, active INTEGER DEFAULT 1,
  last_sync TEXT, last_status TEXT, last_error TEXT);
CREATE TABLE IF NOT EXISTS supplier_mappings(supplier_id INTEGER, external_id TEXT, kind TEXT, local_id INTEGER, PRIMARY KEY(supplier_id, kind, external_id));
CREATE TABLE IF NOT EXISTS currency_rates(id INTEGER PRIMARY KEY, currency TEXT, per_usd REAL, source TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS cms_pages(slug TEXT, lang TEXT, title TEXT, body TEXT, PRIMARY KEY(slug, lang));
CREATE TABLE IF NOT EXISTS analytics_events(
  id INTEGER PRIMARY KEY, type TEXT, ref TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const add = (t, c, def) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  add('users', 'pw_changed_at', 'INTEGER DEFAULT 0'); add('users', 'mfa_secret', 'TEXT'); add('users', 'mfa_enabled', 'INTEGER DEFAULT 0');
  add('hotels', 'payment_policy', "TEXT DEFAULT 'both'"); add('hotels', 'supplier_id', 'INTEGER'); add('hotels', 'external_id', 'TEXT'); add('room_types', 'external_id', 'TEXT');
  add('bookings', 'external_ref', 'TEXT'); add('bookings', 'provider_ref', 'TEXT');
  return db;
}

module.exports = { openDb };
