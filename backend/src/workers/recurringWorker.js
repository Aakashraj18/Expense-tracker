/**
 * Recurring Expense Worker
 *
 * Design goals:
 * ─────────────────────────────────────────────────────────────────────────
 * 1. PERSISTENCE: State (nextRunDate) is stored in MongoDB — not in memory.
 *    If the server restarts, the worker simply re-reads due templates from
 *    the DB and continues processing. No jobs are lost.
 *
 * 2. IDEMPOTENCY: Each run checks `nextRunDate <= now` before creating.
 *    Even if the cron fires twice (e.g. after a crash-restart), it won't
 *    create duplicate transactions because the first run updates nextRunDate
 *    to a future date before the second run reads it.
 *
 * 3. CONCURRENCY: `findOneAndUpdate` with `$set: { nextRunDate: futureDate }`
 *    is atomic. If multiple server instances run the worker simultaneously
 *    (e.g., during a rolling deploy), only one will "claim" each template
 *    because the second will find nextRunDate already updated.
 *
 * 4. FAILURE ISOLATION: Each template is processed in a try/catch.
 *    One failed template does not block the others.
 *
 * Schedule: runs every minute (* * * * *) but only creates transactions
 * for templates whose nextRunDate has passed. The frequent check ensures
 * daily subscriptions fire within 1 minute of their scheduled time even
 * after a server restart.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const cron = require('node-cron');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { addFrequency } = require('../services/aggregationService');

// ── Core processing function ───────────────────────────────────────────────
const processRecurringTransactions = async () => {
  const now = new Date();

  // Find all due recurring templates:
  //   - isTemplate: true (the definition, not a generated child)
  //   - nextRunDate <= now (it's time to fire)
  //   - endDate is either not set or in the future
  const dueTemplates = await Transaction.find({
    'recurrence.isRecurring': true,
    'recurrence.isTemplate': true,
    'recurrence.nextRunDate': { $lte: now },
    isDeleted: false,
    $or: [
      { 'recurrence.endDate': null },
      { 'recurrence.endDate': { $gte: now } },
    ],
  }).lean(); // .lean() for read performance — we don't need Mongoose docs

  if (dueTemplates.length === 0) return;

  logger.info(`[RecurringWorker] Processing ${dueTemplates.length} due template(s)`);

  for (const template of dueTemplates) {
    try {
      const nextRunDate = addFrequency(
        template.recurrence.nextRunDate,
        template.recurrence.frequency
      );

      // ── Step 1: Atomically claim this template ───────────────────────────
      // Uses findOneAndUpdate to atomically advance nextRunDate.
      // If two workers run concurrently, only one will match the old
      // nextRunDate value — the other will get null back and skip.
      const claimed = await Transaction.findOneAndUpdate(
        {
          _id: template._id,
          'recurrence.nextRunDate': template.recurrence.nextRunDate, // optimistic lock
        },
        {
          $set: { 'recurrence.nextRunDate': nextRunDate },
        },
        { new: false } // return old doc to confirm we claimed it
      );

      if (!claimed) {
        // Another worker already claimed this template — skip
        logger.warn(`[RecurringWorker] Template ${template._id} already claimed, skipping`);
        continue;
      }

      // ── Step 2: Create the child transaction ─────────────────────────────
      const childDate = new Date(template.recurrence.nextRunDate);

      await Transaction.create({
        tenantId: template.tenantId,
        walletId: template.walletId,
        createdBy: template.createdBy,
        type: template.type,
        amount: template.amount,
        currency: template.currency,
        exchangeRate: template.exchangeRate,
        category: template.category,
        subcategory: template.subcategory,
        description: template.description
          ? `[Auto] ${template.description}`
          : '[Auto] Recurring transaction',
        merchant: template.merchant,
        date: childDate,
        tags: [...(template.tags || []), 'recurring', 'auto-generated'],
        status: 'cleared',
        recurrence: {
          isRecurring: true,
          isTemplate: false,
          frequency: template.recurrence.frequency,
          parentTransactionId: template._id,
          startDate: template.recurrence.startDate,
          endDate: template.recurrence.endDate,
          nextRunDate: null, // children don't schedule future runs
        },
      });

      logger.info(
        `[RecurringWorker] ✅ Created child for template ${template._id} ` +
        `(${template.category}, ${template.amount} ${template.currency}) ` +
        `| next run: ${nextRunDate.toISOString()}`
      );
    } catch (err) {
      // Isolate failure — log and continue with other templates
      logger.error(
        `[RecurringWorker] ❌ Failed to process template ${template._id}: ${err.message}`
      );
    }
  }
};

// ── Worker registration ────────────────────────────────────────────────────
let cronTask = null;

const startWorker = () => {
  if (cronTask) {
    logger.warn('[RecurringWorker] Worker already running, skipping duplicate start');
    return;
  }

  // Run every minute — DB check is cheap, actual work only happens when due
  cronTask = cron.schedule('* * * * *', async () => {
    // Guard: don't run if DB is not connected
    if (mongoose.connection.readyState !== 1) {
      logger.warn('[RecurringWorker] DB not ready, skipping tick');
      return;
    }

    try {
      await processRecurringTransactions();
    } catch (err) {
      logger.error(`[RecurringWorker] Unhandled error in tick: ${err.message}`);
    }
  });

  logger.info('[RecurringWorker] ✅ Started — runs every minute, processes due recurring templates');
};

const stopWorker = () => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[RecurringWorker] Stopped');
  }
};

// Export for use in server.js and for testing
module.exports = {
  startWorker,
  stopWorker,
  processRecurringTransactions, // exported for direct testing/manual trigger
};
