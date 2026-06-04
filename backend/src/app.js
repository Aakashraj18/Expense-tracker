/**
 * Express Application Factory
 *
 * Separation of app config from server startup allows for:
 *   1. Easy unit testing (import app without binding a port)
 *   2. Clean server.js entry point
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const config = require('./config/env');
const logger = require('./utils/logger');
const v1Router = require('./routes/v1/index');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const createApp = () => {
  const app = express();

  // ── Security Headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.isDev ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    })
  );

  // ── Body Parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // ── NoSQL Injection Prevention ────────────────────────────────────────────
  app.use(mongoSanitize());

  // ── Response Compression ─────────────────────────────────────────────────
  app.use(compression());

  // ── HTTP Request Logging ─────────────────────────────────────────────────
  if (config.isDev) {
    app.use(morgan('dev'));
  } else {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
        skip: (req) => req.url === '/api/v1/health',
      })
    );
  }

  // ── Global Rate Limiter ───────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'fail',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again later.',
    },
  });
  app.use('/api/', limiter);

  // ── Trust Proxy (for accurate IP behind load balancers) ──────────────────
  app.set('trust proxy', 1);

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/v1', v1Router);

  // ── 404 & Error Handling ─────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
