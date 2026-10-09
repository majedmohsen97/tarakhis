import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';

const PUBLIC_DIR = path.join(config.root, 'public');

// Added to the exported index.html so phones can "Add to Home Screen" and open it like an app.
const PWA_HEAD = `
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="تراخيص">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="تراخيص — تصاريح وبوابات ورحلات شاحنات النفايات">`;

/**
 * Serves the exported Expo web app (if present) plus PWA files. Unknown non-API paths fall back
 * to index.html so deep links like /invoices/12 work after a refresh.
 */
export function webApp() {
  const router = express.Router();
  router.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1d' }));

  const indexFile = path.join(config.webDist, 'index.html');
  if (!fs.existsSync(indexFile)) return router;

  const html = fs.readFileSync(indexFile, 'utf8').replace('</head>', `${PWA_HEAD}\n</head>`);
  // Hashed bundles can be cached for a long time; index.html must always be fresh.
  router.use(express.static(config.webDist, { index: false, maxAge: '30d', immutable: true }));
  router.get(/^\/(?!api\/|v\/).*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  });
  return router;
}

export const hasWebApp = () => fs.existsSync(path.join(config.webDist, 'index.html'));
