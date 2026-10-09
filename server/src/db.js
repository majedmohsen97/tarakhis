import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cr_number TEXT,
  vat_number TEXT,
  city TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','safety','gate','driver')),
  lang TEXT NOT NULL DEFAULT 'ar',
  active INTEGER NOT NULL DEFAULT 1,
  -- driver profile
  id_type TEXT CHECK (id_type IN ('national_id','iqama') OR id_type IS NULL),
  id_number TEXT,
  nationality TEXT,
  license_number TEXT,
  photo_path TEXT,
  default_vehicle_id INTEGER REFERENCES vehicles(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS users_company ON users(company_id, role);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plate_number TEXT NOT NULL,
  type TEXT,
  capacity_tons REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, plate_number)
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  radius_m INTEGER NOT NULL DEFAULT 400,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('driver','vehicle','company')),
  owner_id INTEGER NOT NULL,
  doc_type TEXT NOT NULL,
  number TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  site_id INTEGER REFERENCES sites(id),
  file_path TEXT,
  file_mime TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS documents_owner ON documents(company_id, owner_type, owner_id, doc_type);

CREATE TABLE IF NOT EXISTS pass_codes (
  code TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  driver_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  date TEXT NOT NULL,
  driver_id INTEGER NOT NULL REFERENCES users(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  site_id INTEGER REFERENCES sites(id),
  shift TEXT NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning','evening','night')),
  planned_trips INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS schedule_company_date ON schedule_entries(company_id, date);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  driver_id INTEGER NOT NULL REFERENCES users(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  site_id INTEGER REFERENCES sites(id),
  schedule_entry_id INTEGER REFERENCES schedule_entries(id),
  status TEXT NOT NULL DEFAULT 'en_route' CHECK (status IN ('en_route','arrived','completed','cancelled')),
  load_type TEXT,
  started_at TEXT NOT NULL,
  arrived_at TEXT,
  arrival_method TEXT,
  completed_at TEXT,
  weight_tons REAL,
  ticket_number TEXT,
  ticket_path TEXT,
  ticket_mime TEXT,
  last_lat REAL,
  last_lng REAL,
  last_location_at TEXT,
  invoice_id INTEGER REFERENCES invoices(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS trips_company_status ON trips(company_id, status);
CREATE INDEX IF NOT EXISTS trips_driver ON trips(driver_id, status);

CREATE TABLE IF NOT EXISTS trip_locations (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trip_locations_trip ON trip_locations(trip_id, recorded_at);

CREATE TABLE IF NOT EXISTS gate_logs (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  driver_id INTEGER NOT NULL REFERENCES users(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  site_id INTEGER REFERENCES sites(id),
  trip_id INTEGER REFERENCES trips(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('allowed','denied')),
  reasons TEXT NOT NULL DEFAULT '[]',
  direction TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','public')),
  scanned_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS gate_logs_company ON gate_logs(company_id, created_at);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  number TEXT,
  client_name TEXT NOT NULL,
  client_vat_number TEXT,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  currency TEXT NOT NULL DEFAULT 'SAR',
  vat_rate REAL NOT NULL,
  subtotal INTEGER NOT NULL DEFAULT 0,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, number)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  trip_id INTEGER REFERENCES trips(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'trip' CHECK (unit IN ('trip','ton','item')),
  unit_price INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Opens (and migrates) the SQLite database. Money is stored in halalas (1 SAR = 100 halalas).
 * Pass ':memory:' for tests.
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Columns added after the first release. Each entry is applied once if the column is missing.
const COLUMN_MIGRATIONS = [
  ['users', 'location_consent_at', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Writes a consistent copy of the database (safe while the server is running). */
export function backupDb(db, targetFile) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.rmSync(targetFile, { force: true });
  db.prepare('VACUUM INTO ?').run(targetFile);
}

export const q = {
  get: (db, sql, ...params) => db.prepare(sql).get(...params),
  all: (db, sql, ...params) => db.prepare(sql).all(...params),
  run: (db, sql, ...params) => db.prepare(sql).run(...params),
};

/** Runs fn inside a transaction; rolls back on error. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
