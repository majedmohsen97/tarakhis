import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';
import { badRequest } from './util.js';

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
};

export function uploader({ imagesOnly = false } = {}) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: config.uploadsDir,
      filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '')),
    }),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ok = ALLOWED[file.mimetype] && (!imagesOnly || file.mimetype.startsWith('image/'));
      cb(ok ? null : badRequest('UNSUPPORTED_FILE', imagesOnly ? 'Upload a photo (JPG/PNG/WebP)' : 'Upload a photo or PDF'), Boolean(ok));
    },
  });
}

/** Stored paths are file names inside uploadsDir; never trust a path from the database blindly. */
export function resolveUpload(fileName) {
  if (!fileName) return null;
  const full = path.join(config.uploadsDir, path.basename(fileName));
  return fs.existsSync(full) ? full : null;
}

export function removeUpload(fileName) {
  const full = resolveUpload(fileName);
  if (full) fs.rm(full, { force: true }, () => {});
}
