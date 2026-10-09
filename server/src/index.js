import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { openDb, backupDb } from './db.js';
import { createApp } from './app.js';
import { hasWebApp } from './web.js';
import { todayLocal } from './util.js';

const db = openDb(config.dbFile);
const app = createApp(db);

// Daily database backup into DATA_DIR/backups, keeping the last BACKUP_KEEP_DAYS copies.
// Copy the backups folder off the server too (e.g. to object storage) for real disaster recovery.
const backupDir = path.join(config.dataDir, 'backups');
function dailyBackup() {
  try {
    const file = path.join(backupDir, `tarakhis-${todayLocal()}.db`);
    if (fs.existsSync(file)) return;
    backupDb(db, file);
    const old = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort().slice(0, -config.backupDays);
    for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });
    console.log(`Backup written: ${file}`);
  } catch (err) {
    console.error('Backup failed:', err.message);
  }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000).unref();

const server = app.listen(config.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`Tarakhis API running on http://localhost:${config.port}`);
  if (lan) console.log(`On your Wi-Fi (for phones running Expo Go): http://${lan}:${config.port}`);
  console.log(hasWebApp() ? 'Serving the web app at /' : 'Web app not built (run: cd mobile && npx expo export -p web)');
  if (config.registrationCode) console.log('Company registration requires the invite code (REGISTRATION_CODE).');
});

// Let the hosting platform stop the container cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
