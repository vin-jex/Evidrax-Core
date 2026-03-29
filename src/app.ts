import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import config from './config';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './config/swagger';

import authRoutes from './routes/auth';
import evidenceRoutes from './routes/evidence';
import aiRoutes from './routes/ai';
import logsRoutes from './routes/logs';
import adminRoutes from './routes/admin';
import statsRoutes from './routes/stats';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin:
        config.env === 'production'
          ? process.env.FRONTEND_URL
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    morgan(config.env === 'production' ? 'combined' : 'dev', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests - please try again later' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many auth attempts - please try again later' },
  });

  app.use('/api/', limiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/bootstrap', authLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/evidence', evidenceRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/stats', statsRoutes);

  // ── Swagger docs ──────────────────────────────────────────────────────────
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Evidrax-Core API Docs',
      customCss: `
        .swagger-ui .topbar { background: #0f172a; }
        .swagger-ui .topbar-wrapper img { content: none; }
        .swagger-ui .topbar-wrapper::before {
          content: '⚖️ Evidrax-Core API';
          color: #f8fafc;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .swagger-ui .info .title { color: #1e293b; }
      `,
    }),
  );

  // Expose raw OpenAPI spec as JSON
  app.get('/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'evidrax-core', env: config.env, docs: '/docs' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}
