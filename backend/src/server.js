/**
 * Server Entry Point
 *
 * Boots the database then starts the HTTP server.
 * Handles uncaught exceptions and unhandled promise rejections
 * with graceful shutdown logic.
 */

'use strict';

// Must be first — loads and validates all env vars
const config = require('./config/env');
const { connect: connectDB } = require('./config/database');
const { createApp } = require('./app');
const logger = require('./utils/logger');
const { startWorker, stopWorker } = require('./workers/recurringWorker');

// ── Uncaught Exception Guard ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught Exception — shutting down:', {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

const start = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create Express app
  const app = createApp();

  // 3. Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`[Server] Running in ${config.env} mode on port ${config.port}`);
    logger.info(`[Server] API base: http://localhost:${config.port}/api/v1`);

    // 4. Start recurring expense background worker
    startWorker();
  });

  // ── Unhandled Rejection Guard ──────────────────────────────────────────
  process.on('unhandledRejection', (err) => {
    logger.error('[Server] Unhandled Rejection — shutting down:', {
      message: err.message,
      stack: err.stack,
    });
    stopWorker();
    server.close(() => {
      process.exit(1);
    });
  });

  return server;
};

start();
