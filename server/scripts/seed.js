// Resets the development database and fills it with a realistic demo company.
// Usage: npm run seed
//
// Demo logins (all share the password below):
//   owner    0500000001   manager (HR) 0500000002   safety 0500000003   gate 0500000004
//   drivers  0500000011 (compliant)  0500000012 (insurance expiring)
//            0500000013 (licence expired → denied)  0500000014 (iqama awaiting review)
const DEMO_PASSWORD = 'Demo@1234';

import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { openDb, q, tx } from '../src/db.js';
import { todayLocal, addDays, weekStart } from '../src/util.js';

if (config.isProd) {
  console.error('Refusing to seed in production.');
  process.exit(1);
}

for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
const db = openDb(config.dbFile);

const today = todayLocal();
const week = weekStart(today);
const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
// Local Riyadh time (UTC+3) → ISO UTC.
const at = (isoDate, hh, mm = 0) => new Date(`${isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`).toISOString();

tx(db, () => {
  const cid = Number(
    q.run(db, 'INSERT INTO companies (name, cr_number, vat_number, city, phone) VALUES (?,?,?,?,?)', 'شركة النخبة لنقل النفايات', '1010123456', '300123456700003', 'الرياض', '0112345678').lastInsertRowid,
  );

  const user = (name, phone, role, extra = {}) =>
    Number(
      q.run(
        db,
        'INSERT INTO users (company_id, name, phone, password_hash, role, lang, id_type, id_number, nationality, license_number) VALUES (?,?,?,?,?,?,?,?,?,?)',
        cid, name, phone, hash, role, extra.lang || 'ar', extra.id_type || null, extra.id_number || null, extra.nationality || null, extra.license_number || null,
      ).lastInsertRowid,
    );

  user('عبدالله القحطاني', '+966500000001', 'owner');
  const manager = user('سارة العتيبي', '+966500000002', 'manager');
  const safety = user('فيصل الدوسري', '+966500000003', 'safety');
  const gate = user('محمد الشهري', '+966500000004', 'gate');

  const vehicle = (plate, type, cap) => Number(q.run(db, 'INSERT INTO vehicles (company_id, plate_number, type, capacity_tons) VALUES (?,?,?,?)', cid, plate, type, cap).lastInsertRowid);
  const v1 = vehicle('أ ب ج 1234', 'ضاغطة نفايات', 12);
  const v2 = vehicle('د ه و 5678', 'قلاب', 20);
  const v3 = vehicle('ر س ص 9012', 'ضاغطة نفايات', 12);
  const v4 = vehicle('ط ع ق 3456', 'حاوية رافعة', 8);

  const driver = (name, phone, vehicleId, extra) => {
    const id = user(name, phone, 'driver', extra);
    // Demo drivers have already agreed to location sharing during trips.
    q.run(db, 'UPDATE users SET default_vehicle_id = ?, location_consent_at = ? WHERE id = ?', vehicleId, new Date().toISOString(), id);
    return id;
  };
  const d1 = driver('Imran Khan', '+966500000011', v1, { id_type: 'iqama', id_number: '2456789012', nationality: 'باكستان', license_number: 'DL-55012', lang: 'en' });
  const d2 = driver('Rajesh Kumar', '+966500000012', v2, { id_type: 'iqama', id_number: '2398765432', nationality: 'الهند', license_number: 'DL-44120', lang: 'en' });
  const d3 = driver('خالد الحربي', '+966500000013', v3, { id_type: 'national_id', id_number: '1087654321', nationality: 'السعودية', license_number: 'DL-10233' });
  const d4 = driver('Abdul Karim', '+966500000014', v4, { id_type: 'iqama', id_number: '2512345678', nationality: 'بنغلاديش', license_number: 'DL-77881', lang: 'en' });

  // Demo coordinates around east Riyadh — replace with your real sites.
  const s1 = Number(q.run(db, 'INSERT INTO sites (company_id, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', cid, 'مردم الرياض الرئيسي', 24.5246, 46.9419, 500).lastInsertRowid);
  const s2 = Number(q.run(db, 'INSERT INTO sites (company_id, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', cid, 'محطة الترحيل - السلي', 24.6447, 46.8288, 300).lastInsertRowid);

  const doc = (ownerType, ownerId, docType, expiryOffset, { number = null, status = 'approved', siteId = null } = {}) =>
    q.run(
      db,
      `INSERT INTO documents (company_id, owner_type, owner_id, doc_type, number, issue_date, expiry_date, site_id, status, uploaded_by, reviewed_by, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      cid, ownerType, ownerId, docType, number, addDays(today, expiryOffset - 365), expiryOffset == null ? null : addDays(today, expiryOffset), siteId, status,
      status === 'pending' ? ownerId : safety, status === 'pending' ? null : safety, status === 'pending' ? null : new Date().toISOString(),
    );

  // Company-level documents
  doc('company', cid, 'commercial_registration', 280, { number: '1010123456' });
  doc('company', cid, 'waste_transporter_qualification', 60, { number: 'WTQ-2026-0419' });
  doc('company', cid, 'mwan_license', 25, { number: 'MWAN-T-8831' });
  doc('company', cid, 'landfill_permit', 120, { number: 'LP-RYD-5520', siteId: s1 });
  doc('company', cid, 'landfill_permit', 45, { number: 'LP-SLY-1180', siteId: s2 });

  // Driver 1 — fully compliant
  doc('driver', d1, 'iqama', 210, { number: '2456789012' });
  doc('driver', d1, 'driving_license', 500, { number: 'DL-55012' });
  doc('vehicle', v1, 'vehicle_registration', 300);
  doc('vehicle', v1, 'insurance', 180);
  doc('vehicle', v1, 'operating_card', 150);
  // Driver 2 — insurance expiring soon (allowed with a warning)
  doc('driver', d2, 'iqama', 90, { number: '2398765432' });
  doc('driver', d2, 'driving_license', 700, { number: 'DL-44120' });
  doc('vehicle', v2, 'vehicle_registration', 240);
  doc('vehicle', v2, 'insurance', 12);
  // Driver 3 — driving licence expired (denied at the gate)
  doc('driver', d3, 'national_id', 1500, { number: '1087654321' });
  doc('driver', d3, 'driving_license', -6, { number: 'DL-10233' });
  doc('vehicle', v3, 'vehicle_registration', 365);
  doc('vehicle', v3, 'insurance', 200);
  // Driver 4 — new iqama uploaded by the driver, waiting for safety review
  doc('driver', d4, 'iqama', 330, { number: '2512345678', status: 'pending' });
  doc('driver', d4, 'driving_license', 400, { number: 'DL-77881' });
  doc('vehicle', v4, 'vehicle_registration', 100);
  doc('vehicle', v4, 'insurance', 160);

  // Weekly plan: Sunday–Thursday for this week and last week.
  const entries = {};
  for (const ws of [addDays(week, -7), week]) {
    for (let i = 0; i < 5; i++) {
      const day = addDays(ws, i);
      for (const [drv, veh, site, shift, trips] of [[d1, v1, s1, 'morning', 3], [d2, v2, s1, 'morning', 2], [d3, v3, s2, 'morning', 2], [d4, v4, s2, 'evening', 2]]) {
        const id = Number(
          q.run(db, 'INSERT INTO schedule_entries (company_id, date, driver_id, vehicle_id, site_id, shift, planned_trips) VALUES (?,?,?,?,?,?,?)', cid, day, drv, veh, site, shift, trips).lastInsertRowid,
        );
        entries[`${drv}:${day}`] = id;
      }
    }
  }

  // Completed trips for past days (last week + earlier this week).
  const completedTrip = (drv, veh, site, day, hour, weight, ticket) => {
    const start = at(day, hour);
    const arrive = at(day, hour, 40);
    const done = at(day, hour + 1, 5);
    q.run(
      db,
      `INSERT INTO trips (company_id, driver_id, vehicle_id, site_id, schedule_entry_id, status, load_type, started_at, arrived_at, arrival_method, completed_at, weight_tons, ticket_number)
       VALUES (?,?,?,?,?,'completed',?,?,?,?,?,?,?)`,
      cid, drv, veh, site, entries[`${drv}:${day}`] ?? null, 'نفايات بلدية', start, arrive, 'geofence', done, weight, ticket,
    );
  };
  let ticket = 4100;
  for (let back = 12; back >= 1; back--) {
    const day = addDays(today, -back);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 5 || dow === 6) continue; // Friday/Saturday off
    completedTrip(d1, v1, s1, day, 7, 9.2 + (back % 3), `T-${ticket++}`);
    completedTrip(d1, v1, s1, day, 10, 8.4 + (back % 2), `T-${ticket++}`);
    completedTrip(d2, v2, s1, day, 8, 15.1 + (back % 4), `T-${ticket++}`);
    if (back > 6) completedTrip(d3, v3, s2, day, 9, 7.8, `T-${ticket++}`);
  }

  // Today: Imran is on the way, Rajesh has arrived.
  const t1 = Number(
    q.run(
      db,
      `INSERT INTO trips (company_id, driver_id, vehicle_id, site_id, schedule_entry_id, status, load_type, started_at, last_lat, last_lng, last_location_at)
       VALUES (?,?,?,?,?,'en_route',?,?,?,?,?)`,
      cid, d1, v1, s1, entries[`${d1}:${today}`] ?? null, 'نفايات بلدية', new Date(Date.now() - 35 * 60000).toISOString(), 24.5821, 46.8712, new Date(Date.now() - 60000).toISOString(),
    ).lastInsertRowid,
  );
  [[24.6302, 46.7905], [24.6105, 46.8231], [24.5953, 46.8504], [24.5821, 46.8712]].forEach(([lat, lng], i) => {
    q.run(db, 'INSERT INTO trip_locations (trip_id, lat, lng, accuracy, recorded_at) VALUES (?,?,?,?,?)', t1, lat, lng, 12, new Date(Date.now() - (30 - i * 9) * 60000).toISOString());
  });
  q.run(
    db,
    `INSERT INTO trips (company_id, driver_id, vehicle_id, site_id, schedule_entry_id, status, load_type, started_at, arrived_at, arrival_method, last_lat, last_lng, last_location_at)
     VALUES (?,?,?,?,?,'arrived',?,?,?,?,?,?,?)`,
    cid, d2, v2, s1, entries[`${d2}:${today}`] ?? null, 'مخلفات بناء', new Date(Date.now() - 80 * 60000).toISOString(), new Date(Date.now() - 12 * 60000).toISOString(), 'gate', 24.5249, 46.9415, new Date(Date.now() - 2 * 60000).toISOString(),
  );

  // Gate activity today.
  const log = (drv, veh, site, verdict, reasons, minsAgo) =>
    q.run(
      db,
      'INSERT INTO gate_logs (company_id, driver_id, vehicle_id, site_id, verdict, reasons, direction, source, scanned_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      cid, drv, veh, site, verdict, JSON.stringify(reasons), 'in', 'app', gate, new Date(Date.now() - minsAgo * 60000).toISOString(),
    );
  log(d2, v2, s1, 'allowed', [], 12);
  log(d3, v3, s2, 'denied', [{ code: 'DOC_EXPIRED', requirement: 'driving_license', doc_type: 'driving_license', expiry_date: addDays(today, -6) }], 95);

  // Draft invoice for last week's trips.
  const lastWeek = addDays(week, -7);
  const lastTrips = q.all(
    db,
    `SELECT t.*, u.name AS driver_name, v.plate_number, s.name AS site_name FROM trips t JOIN users u ON u.id = t.driver_id
     JOIN vehicles v ON v.id = t.vehicle_id JOIN sites s ON s.id = t.site_id
     WHERE t.company_id = ? AND t.status = 'completed' AND date(t.completed_at, '+3 hours') BETWEEN ? AND ? ORDER BY t.completed_at`,
    cid, lastWeek, addDays(lastWeek, 6),
  );
  if (lastTrips.length) {
    const invId = Number(
      q.run(
        db,
        'INSERT INTO invoices (company_id, client_name, client_vat_number, week_start, week_end, currency, vat_rate, created_by) VALUES (?,?,?,?,?,?,?,?)',
        cid, 'أمانة منطقة الرياض', '300000000000003', lastWeek, addDays(lastWeek, 6), config.currency, config.vatRate, manager,
      ).lastInsertRowid,
    );
    let subtotal = 0;
    lastTrips.forEach((t, i) => {
      const price = 4500; // 45.00 SAR per ton
      const amount = Math.round(t.weight_tons * price);
      subtotal += amount;
      const day = new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: config.timeZone });
      q.run(
        db,
        'INSERT INTO invoice_lines (invoice_id, trip_id, description, quantity, unit, unit_price, amount, position) VALUES (?,?,?,?,?,?,?,?)',
        invId, t.id, `${day} · ${t.plate_number} · ${t.driver_name} · ${t.site_name} · #${t.ticket_number}`, t.weight_tons, 'ton', price, amount, i,
      );
      q.run(db, 'UPDATE trips SET invoice_id = ? WHERE id = ?', invId, t.id);
    });
    const vat = Math.round(subtotal * config.vatRate);
    q.run(db, 'UPDATE invoices SET subtotal=?, vat_amount=?, total=? WHERE id=?', subtotal, vat, subtotal + vat, invId);
  }
});

console.log(`Seeded demo company into ${config.dbFile}`);
console.log('Demo logins are listed at the top of scripts/seed.js');
