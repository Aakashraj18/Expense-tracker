/**
 * Database Configuration
 * Handles MongoDB connection lifecycle with retry logic,
 * graceful shutdown, and connection event logging.
 */

'use strict';

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let retryCount = 0;

const connect = async () => {
  try {
    await mongoose.connect(config.mongo.uri, config.mongo.options);
    retryCount = 0;
    logger.info(`[DB] MongoDB connected → ${mongoose.connection.host}`);
  } catch (err) {
    retryCount += 1;
    logger.error(`[DB] Connection failed (attempt ${retryCount}/${MAX_RETRIES}): ${err.message}`);

    if (retryCount < MAX_RETRIES) {
      logger.info(`[DB] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(connect, RETRY_DELAY_MS);
    } else {
      logger.error('[DB] Max retries reached. Shutting down.');
      process.exit(1);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('[DB] MongoDB disconnected. Attempting reconnect...');
  connect();
});

mongoose.connection.on('error', (err) => {
  logger.error(`[DB] Mongoose error: ${err.message}`);
});

// Graceful shutdown
const gracefulDisconnect = async (signal) => {
  logger.info(`[DB] ${signal} received. Closing MongoDB connection...`);
  await mongoose.connection.close();
  logger.info('[DB] MongoDB connection closed.');
  process.exit(0);
};

process.on('SIGINT', () => gracefulDisconnect('SIGINT'));
process.on('SIGTERM', () => gracefulDisconnect('SIGTERM'));

module.exports = { connect };
