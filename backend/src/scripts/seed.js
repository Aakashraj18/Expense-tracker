/**
 * Database Seed Script
 *
 * Creates an initial tenant for development.
 * Run: node src/scripts/seed.js
 */

'use strict';

const config = require('../config/env');
const { connect } = require('../config/database');
const Tenant = require('../models/Tenant');
const logger = require('../utils/logger');

const seed = async () => {
  await connect();

  // Wait for connection
  await new Promise((r) => setTimeout(r, 1000));

  logger.info('[Seed] Checking for existing dev tenant...');

  const existing = await Tenant.findOne({ slug: 'dev-tenant' });
  if (existing) {
    logger.info('[Seed] Dev tenant already exists. Skipping.');
    process.exit(0);
  }

  const { raw, hash, prefix } = Tenant.generateApiKey();

  const tenant = await Tenant.create({
    name: 'Development Tenant',
    slug: 'dev-tenant',
    ownerEmail: 'dev@expensetracker.local',
    plan: 'enterprise',
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
  });

  logger.info('═══════════════════════════════════════════════════════');
  logger.info('[Seed] ✅ Dev tenant created successfully!');
  logger.info(`[Seed]   Tenant ID : ${tenant._id}`);
  logger.info(`[Seed]   API Key   : ${raw}`);
  logger.info('[Seed]   ⚠️  Save this key — it will NOT be shown again!');
  logger.info('═══════════════════════════════════════════════════════');

  process.exit(0);
};

seed().catch((err) => {
  logger.error('[Seed] Failed:', err.message);
  process.exit(1);
});
