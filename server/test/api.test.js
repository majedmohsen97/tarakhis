import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir (keys, uploads) and in-memory DB for each test run.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarakhis-test-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = ':memory:';
process.env.REGISTRATION_CODE = 'PILOT-2026';
// A stand-in for the exported web app, to test that the server hosts it.
const webDist = path.join(tmp, 'web');
fs.mkdirSync(webDist);
fs.writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>');
process.env.WEB_DIST = webDist;

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const util = await import('../src/util.js');

let server;
let base;

before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = new FormData();
    for (const [k, v] of Object.entries(form)) if (v != null) payload.append(k, v);
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

const today = util.todayLocal();
const inDays = (n) => util.addDays(today, n);

// Shared state built up across the ordered tests below.
const s = {};

test('phone numbers are normalised to +9665XXXXXXXX', () => {
  assert.equal(util.normalizePhone('0501234567'), '+966501234567');
  assert.equal(util.normalizePhone('+966 50 123 4567'), '+966501234567');
  assert.equal(util.normalizePhone('٠٥٠١٢٣٤٥٦٧'), '+966501234567');
  assert.throws(() => util.normalizePhone('0401234567'));
});

test('ID validation distinguishes national ID and iqama', () => {
  assert.equal(util.validateIdNumber('national_id', '1012345678'), '1012345678');
  assert.throws(() => util.validateIdNumber('iqama', '1012345678'));
  assert.throws(() => util.validateIdNumber('iqama', '20123'));
});

test('register company and sign in', async () => {
  const cfg = await call('GET', '/api/config');
  assert.equal(cfg.data.registration_requires_code, true);
  const noCode = await call('POST', '/api/auth/register', {
    body: { company_name: 'X', name: 'X', phone: '0500000099', password: 'password123', invite_code: 'wrong' },
  });
  assert.equal(noCode.status, 403);
  assert.equal(noCode.data.error, 'INVITE_CODE_INVALID');

  const reg = await call('POST', '/api/auth/register', {
    body: { company_name: 'شركة الاختبار', name: 'Owner', phone: '0500000001', password: 'password123', invite_code: 'PILOT-2026' },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.role, 'owner');
  s.owner = reg.data.token;

  const bad = await call('POST', '/api/auth/login', { body: { phone: '0500000001', password: 'wrong-pass' } });
  assert.equal(bad.status, 401);

  const login = await call('POST', '/api/auth/login', { body: { phone: '0500000001', password: 'password123' } });
  assert.equal(login.status, 200);
  const me = await call('GET', '/api/auth/me', { token: login.data.token });
  assert.equal(me.data.company.name, 'شركة الاختبار');
});

test('set up truck, site, driver and gate guard', async () => {
  const v = await call('POST', '/api/vehicles', { token: s.owner, body: { plate_number: 'أ ب ج 1234', type: 'Compactor', capacity_tons: 12 } });
  assert.equal(v.status, 201);
  s.vehicleId = v.data.id;

  const site = await call('POST', '/api/sites', { token: s.owner, body: { name: 'مردم الاختبار', lat: 24.5, lng: 46.9, radius_m: 300 } });
  assert.equal(site.status, 201);
  s.siteId = site.data.id;

  const d = await call('POST', '/api/users', {
    token: s.owner,
    body: { name: 'Driver One', phone: '0500000002', role: 'driver', id_type: 'iqama', id_number: '2123456789', default_vehicle_id: s.vehicleId },
  });
  assert.equal(d.status, 201);
  assert.ok(d.data.temp_password.length >= 10);
  s.driverId = d.data.user.id;
  s.driver = (await call('POST', '/api/auth/login', { body: { phone: '0500000002', password: d.data.temp_password } })).data.token;

  const g = await call('POST', '/api/users', { token: s.owner, body: { name: 'Guard', phone: '0500000003', role: 'gate', password: 'guardpass1' } });
  assert.equal(g.status, 201);
  s.gate = (await call('POST', '/api/auth/login', { body: { phone: '0500000003', password: 'guardpass1' } })).data.token;
});

test('gate denies a driver with missing documents', async () => {
  const pass = await call('GET', '/api/gate/pass', { token: s.driver });
  assert.equal(pass.status, 200);
  assert.match(pass.data.code, /^\d{6}$/);
  const scan = await call('POST', '/api/gate/scan', { token: s.gate, body: { code: pass.data.code, site_id: s.siteId } });
  assert.equal(scan.status, 200);
  assert.equal(scan.data.verdict, 'denied');
  assert.ok(scan.data.reasons.some((r) => r.code === 'DOC_MISSING' && r.requirement === 'driving_license'));
});

test('driver uploads go to review; office uploads are approved', async () => {
  const mine = await call('POST', '/api/documents', {
    token: s.driver,
    form: { owner_type: 'driver', owner_id: String(s.driverId), doc_type: 'driving_license', expiry_date: inDays(400), file: new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }) },
  });
  assert.equal(mine.status, 201);
  assert.equal(mine.data.status, 'pending');
  assert.ok(mine.data.file_url);
  const file = await fetch(base + mine.data.file_url);
  assert.equal(file.status, 200);
  const tampered = await fetch(base + mine.data.file_url.replace(/sig=[^&]+/, 'sig=abc'));
  assert.equal(tampered.status, 403);

  // Drivers cannot upload for someone else.
  const other = await call('POST', '/api/documents', { token: s.driver, form: { owner_type: 'company', doc_type: 'landfill_permit', expiry_date: inDays(10) } });
  assert.equal(other.status, 403);

  const approve = await call('PATCH', `/api/documents/${mine.data.id}`, { token: s.owner, body: { status: 'approved' } });
  assert.equal(approve.data.state, 'valid');

  const docs = [
    { owner_type: 'driver', owner_id: s.driverId, doc_type: 'iqama', expiry_date: inDays(200) },
    { owner_type: 'vehicle', owner_id: s.vehicleId, doc_type: 'vehicle_registration', expiry_date: inDays(300) },
    { owner_type: 'vehicle', owner_id: s.vehicleId, doc_type: 'insurance', expiry_date: inDays(20) },
    { owner_type: 'company', doc_type: 'landfill_permit', expiry_date: inDays(90), site_id: s.siteId },
  ];
  for (const d of docs) {
    const res = await call('POST', '/api/documents', { token: s.owner, form: { ...d, owner_id: d.owner_id ? String(d.owner_id) : undefined, site_id: d.site_id ? String(d.site_id) : undefined } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.status, 'approved');
  }
});

test('gate allows a compliant driver and warns about expiring insurance', async () => {
  const pass = await call('GET', '/api/gate/pass', { token: s.driver });
  assert.equal(pass.data.status.verdict, 'allowed');
  // Scan using the full QR URL rather than the short code.
  const scan = await call('POST', '/api/gate/scan', { token: s.gate, body: { code: pass.data.qr_value, site_id: s.siteId } });
  assert.equal(scan.data.verdict, 'allowed');
  assert.ok(scan.data.warnings.some((w) => w.code === 'DOC_EXPIRING' && w.requirement === 'insurance'));
  assert.equal(scan.data.vehicle.plate_number, 'أ ب ج 1234');
  s.token = pass.data.token;

  const page = await call('GET', `/v/${pass.data.token}`);
  assert.equal(page.status, 200);
  assert.match(page.data, /مسموح بالدخول/);
  assert.doesNotMatch(page.data, /2123456789/, 'public page must not expose ID numbers');

  const fake = await call('GET', `/api/verify/${pass.data.token.slice(0, -4)}AAAA`);
  assert.equal(fake.data.valid, false);
});

test('expired document flips the verdict to denied', async () => {
  const res = await call('POST', '/api/documents', { token: s.owner, form: { owner_type: 'vehicle', owner_id: String(s.vehicleId), doc_type: 'operating_card', expiry_date: inDays(-1) } });
  assert.equal(res.status, 201);
  // operating_card is not a gate requirement, so still allowed…
  let v = await call('GET', `/api/verify/${s.token}`);
  assert.equal(v.data.verdict, 'allowed');
  // …but an expired permit replacing the valid one is.
  const permits = await call('GET', '/api/documents?owner_type=company', { token: s.owner });
  const permit = permits.data.find((d) => d.doc_type === 'landfill_permit');
  await call('PATCH', `/api/documents/${permit.id}`, { token: s.owner, body: { expiry_date: inDays(-3) } });
  v = await call('GET', `/api/verify/${s.token}`);
  assert.equal(v.data.verdict, 'denied');
  assert.ok(v.data.reasons.some((r) => r.code === 'DOC_EXPIRED' && r.requirement === 'landfill_permit'));
  const alerts = await call('GET', '/api/alerts', { token: s.owner });
  assert.ok(alerts.data.some((a) => a.kind === 'expired' && a.doc_type === 'landfill_permit'));
  await call('PATCH', `/api/documents/${permit.id}`, { token: s.owner, body: { expiry_date: inDays(90) } });
});

test('schedule: plan the week and copy it forward', async () => {
  const e = await call('POST', '/api/schedule', { token: s.owner, body: { date: today, driver_id: s.driverId, site_id: s.siteId, planned_trips: 2 } });
  assert.equal(e.status, 201);
  assert.equal(e.data.vehicle_id, s.vehicleId, 'defaults to the driver\'s truck');
  s.entryId = e.data.id;
  const dup = await call('POST', '/api/schedule', { token: s.owner, body: { date: today, driver_id: s.driverId } });
  assert.equal(dup.status, 409);
  const mine = await call('GET', '/api/schedule', { token: s.driver });
  assert.equal(mine.data.entries.length, 1);
  const gateView = await call('GET', '/api/schedule', { token: s.gate });
  assert.equal(gateView.status, 200);
  const copy = await call('POST', '/api/schedule/copy-week', { token: s.owner, body: { from_week_start: today, to_week_start: inDays(7) } });
  assert.equal(copy.data.copied, 1);
});

test('trip: geofence arrival, completion and weekly invoice', async () => {
  const start = await call('POST', '/api/trips/start', { token: s.driver, body: { schedule_entry_id: s.entryId, load_type: 'Municipal' } });
  assert.equal(start.status, 201);
  const tripId = start.data.id;
  assert.equal(start.data.site_id, s.siteId);

  const again = await call('POST', '/api/trips/start', { token: s.driver, body: {} });
  assert.equal(again.status, 409);

  // Location sharing requires the driver's consent first.
  let loc = await call('POST', `/api/trips/${tripId}/location`, { token: s.driver, body: { lat: 24.6, lng: 46.9 } });
  assert.equal(loc.status, 403);
  assert.equal(loc.data.error, 'LOCATION_CONSENT_REQUIRED');
  const consent = await call('PATCH', '/api/auth/me', { token: s.driver, body: { location_consent: true } });
  assert.ok(consent.data.user.location_consent_at);

  loc = await call('POST', `/api/trips/${tripId}/location`, { token: s.driver, body: { lat: 24.6, lng: 46.9 } });
  assert.equal(loc.data.status, 'en_route');
  assert.ok(loc.data.distance_to_site_m > 5000);
  loc = await call('POST', `/api/trips/${tripId}/location`, { token: s.driver, body: { lat: 24.5005, lng: 46.9005 } });
  assert.equal(loc.data.status, 'arrived');
  assert.equal(loc.data.arrival_method, 'geofence');

  const live = await call('GET', '/api/trips/live', { token: s.owner });
  assert.equal(live.data.active.length, 1);

  const done = await call('POST', `/api/trips/${tripId}/complete`, {
    token: s.driver,
    form: { weight_tons: '8.5', ticket_number: 'T-991', ticket: new Blob(['fake-jpeg'], { type: 'image/jpeg' }) },
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.status, 'completed');
  assert.ok(done.data.ticket_url);

  const forbiddenForDriver = await call('GET', '/api/invoices', { token: s.driver });
  assert.equal(forbiddenForDriver.status, 403);

  const inv = await call('POST', '/api/invoices/generate', { token: s.owner, body: { week_start: today, client_name: 'أمانة الاختبار', pricing: 'per_ton', unit_price: 45.5 } });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  assert.equal(inv.data.lines.length, 1);
  assert.equal(inv.data.subtotal, Math.round(8.5 * 4550)); // 386.75 SAR
  assert.equal(inv.data.vat_amount, Math.round(inv.data.subtotal * 0.15));
  assert.equal(inv.data.total, inv.data.subtotal + inv.data.vat_amount);

  const none = await call('POST', '/api/invoices/generate', { token: s.owner, body: { week_start: today, client_name: 'x', pricing: 'per_trip', unit_price: 10 } });
  assert.equal(none.data.error, 'NO_TRIPS', 'trips are not invoiced twice');

  const edited = await call('PATCH', `/api/invoices/${inv.data.id}`, {
    token: s.owner,
    body: { lines: [...inv.data.lines.map((l) => ({ ...l, unit_price: l.unit_price / 100 })), { description: 'رسوم إضافية', quantity: 1, unit: 'item', unit_price: 100 }] },
  });
  assert.equal(edited.data.lines.length, 2);
  assert.equal(edited.data.subtotal, Math.round(8.5 * 4550) + 10000);

  const approved = await call('POST', `/api/invoices/${inv.data.id}/approve`, { token: s.owner });
  assert.match(approved.data.number, /^INV-\d{4}-0001$/);
  const locked = await call('PATCH', `/api/invoices/${inv.data.id}`, { token: s.owner, body: { notes: 'x' } });
  assert.equal(locked.status, 409);

  const html = await fetch(base + approved.data.print_url);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /فاتورة ضريبية/);
});

test('companies cannot see each other\'s data', async () => {
  const other = await call('POST', '/api/auth/register', { body: { company_name: 'Other Co', name: 'Other', phone: '0550000009', password: 'password123', invite_code: 'PILOT-2026' } });
  const t = other.data.token;
  assert.equal((await call('GET', `/api/vehicles/${s.vehicleId}`, { token: t })).status, 404);
  assert.equal((await call('GET', `/api/users/${s.driverId}`, { token: t })).status, 404);
  assert.equal((await call('GET', '/api/documents', { token: t })).data.length, 0);
  const scan = await call('POST', '/api/gate/scan', { token: t, body: { code: s.token } });
  assert.equal(scan.status, 403);
  const sched = await call('POST', '/api/schedule', { token: t, body: { date: today, driver_id: s.driverId } });
  assert.equal(sched.status, 404);
});

test('serves the web app with PWA tags, without hijacking API routes', async () => {
  const deep = await fetch(`${base}/invoices/12`, { headers: { Accept: 'text/html' } });
  assert.equal(deep.status, 200);
  const html = await deep.text();
  assert.match(html, /<div id="root">/);
  assert.match(html, /rel="manifest"/);
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).short_name, 'تراخيص');
  const icon = await fetch(`${base}/icons/icon-192.png`);
  assert.equal(icon.status, 200);
  const missingApi = await call('GET', '/api/does-not-exist');
  assert.equal(missingApi.status, 401, 'unknown API paths stay API errors, not the HTML app');
});

test('database backup produces a readable copy', async () => {
  const { backupDb, openDb: open } = await import('../src/db.js');
  const db = open(':memory:');
  db.exec("INSERT INTO companies (name) VALUES ('Backup Co')");
  const file = path.join(tmp, 'backups', 'b.db');
  backupDb(db, file);
  const copy = open(file);
  assert.equal(copy.prepare('SELECT name FROM companies').get().name, 'Backup Co');
  copy.close();
});

test('managers can set a chosen password or generate a temporary one', async () => {
  const g = (await call('GET', '/api/users?role=gate', { token: s.owner })).data[0];
  const tooShort = await call('POST', `/api/users/${g.id}/reset-password`, { token: s.owner, body: { password: 'short' } });
  assert.equal(tooShort.status, 400);
  const chosen = await call('POST', `/api/users/${g.id}/reset-password`, { token: s.owner, body: { password: 'NewGuardPass9' } });
  assert.equal(chosen.data.temp_password, null);
  const login = await call('POST', '/api/auth/login', { body: { phone: '0500000003', password: 'NewGuardPass9' } });
  assert.equal(login.status, 200);
  const temp = await call('POST', `/api/users/${g.id}/reset-password`, { token: s.owner, body: {} });
  assert.ok(temp.data.temp_password.length >= 10);
  // Non-managers cannot reset passwords.
  assert.equal((await call('POST', `/api/users/${g.id}/reset-password`, { token: s.gate, body: {} })).status, 403);
});

test('roles are enforced', async () => {
  assert.equal((await call('POST', '/api/vehicles', { token: s.driver, body: { plate_number: 'X' } })).status, 403);
  assert.equal((await call('POST', '/api/gate/scan', { token: s.driver, body: { code: '000000' } })).status, 403);
  assert.equal((await call('GET', '/api/gate/pass', { token: s.gate })).status, 403);
  assert.equal((await call('GET', '/api/dashboard', { token: s.gate })).status, 403);
  assert.equal((await call('GET', '/api/dashboard')).status, 401);
  // Disabled users are locked out immediately.
  await call('PATCH', `/api/users/${s.driverId}`, { token: s.owner, body: { active: false } });
  assert.equal((await call('GET', '/api/auth/me', { token: s.driver })).status, 401);
});
