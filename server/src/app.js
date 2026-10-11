import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config.js';
import { authenticate } from './auth.js';
import { HttpError } from './util.js';
import { publicKeyRaw } from './pass.js';
import { webApp } from './web.js';
import authRoutes from './routes/auth.js';
import userRoutes, { userPhotoRoute } from './routes/users.js';
import documentRoutes, { documentFileRoute } from './routes/documents.js';
import { vehicleRoutes, siteRoutes } from './routes/fleet.js';
import gateRoutes, { publicVerifyRoutes } from './routes/gate.js';
import tripRoutes, { tripTicketRoute } from './routes/trips.js';
import scheduleRoutes from './routes/schedule.js';
import invoiceRoutes, { invoiceHtmlRoute } from './routes/invoices.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';

export function createApp(db) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Inline styles: the verification/invoice pages and react-native-web's runtime styles.
      // blob: covers photo previews from the file picker and the camera scanner's worker.
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'worker-src': ["'self'", 'blob:'],
          'media-src': ["'self'", 'blob:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : !config.isProd,
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'tarakhis', time: new Date().toISOString() }));
  app.get('/api/config', (_req, res) =>
    res.json({ registration_requires_code: Boolean(config.registrationCode), public_url: config.publicUrl || null }),
  );

  // Public routes: pass verification page and signed file links.
  app.use(publicVerifyRoutes(db));
  app.use('/api/users', userPhotoRoute(db));
  app.use('/api/documents', documentFileRoute(db));
  app.use('/api/trips', tripTicketRoute(db));
  app.use('/api/invoices', invoiceHtmlRoute(db));
  app.use('/api/auth', authRoutes(db));
  app.get('/api/pass/public-key', (_req, res) => res.json({ alg: 'Ed25519', key: publicKeyRaw() }));

  // Everything below requires a signed-in user.
  const api = express.Router();
  api.use(authenticate(db));
  api.use('/users', userRoutes(db));
  api.use('/documents', documentRoutes(db));
  api.use('/vehicles', vehicleRoutes(db));
  api.use('/sites', siteRoutes(db));
  api.use('/gate', gateRoutes(db));
  api.use('/trips', tripRoutes(db));
  api.use('/schedule', scheduleRoutes(db));
  api.use('/invoices', invoiceRoutes(db));
  api.use('/notifications', notificationRoutes(db));
  api.use('/', dashboardRoutes(db));
  app.use('/api', api);

  // The web version of the app (and PWA files), when it has been built into mobile/dist.
  app.use(webApp());

  app.use((req, _res, next) => next(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`)));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooBig ? `File is larger than ${config.maxUploadMb} MB` : err.message });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON', message: 'Invalid JSON body' });
    if (String(err.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'DUPLICATE', message: 'This record already exists' });
    console.error(`[${req.method} ${req.path}]`, err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong' });
  });

  return app;
}
