/**
 * Report Controller
 *
 * Thin HTTP layer on top of the aggregation service.
 * All heavy computation happens inside MongoDB pipelines.
 *
 * GET /wallets/:walletId/reports/summary       → full dashboard data
 * GET /wallets/:walletId/reports/balance       → running balance only
 * GET /wallets/:walletId/reports/categories    → category breakdown
 * GET /wallets/:walletId/reports/trend         → monthly burn rate (N months)
 * GET /wallets/:walletId/reports/budget        → budget vs actual
 * GET /wallets/:walletId/reports/merchants     → top merchants
 * POST /wallets/:walletId/reports/trigger-recurring → manual worker trigger
 */

'use strict';

const {
  getSummary,
  getRunningBalance,
  getCategoryBreakdown,
  getBurnRateTrend,
  getBudgetStatus,
  getTopMerchants,
} = require('../services/aggregationService');

const { processRecurringTransactions } = require('../workers/recurringWorker');
const { AppError } = require('../middleware/errorHandler');

// ── Extract common query filters ───────────────────────────────────────────
const extractFilters = (query) => ({
  startDate: query.startDate || null,
  endDate: query.endDate || null,
  category: query.category || null,
  type: query.type || null,
});

// ── GET /summary ───────────────────────────────────────────────────────────
exports.getSummary = async (req, res, next) => {
  try {
    const filters = extractFilters(req.query);
    const data = await getSummary(req.wallet._id.toString(), filters);
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

// ── GET /balance ───────────────────────────────────────────────────────────
exports.getBalance = async (req, res, next) => {
  try {
    const filters = extractFilters(req.query);
    const balance = await getRunningBalance(req.wallet._id.toString(), filters);
    res.json({ status: 'success', data: { balance } });
  } catch (err) {
    next(err);
  }
};

// ── GET /categories ────────────────────────────────────────────────────────
exports.getCategoryBreakdown = async (req, res, next) => {
  try {
    const filters = extractFilters(req.query);
    const categories = await getCategoryBreakdown(req.wallet._id.toString(), filters);
    res.json({
      status: 'success',
      results: categories.length,
      data: { categories },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /trend ─────────────────────────────────────────────────────────────
exports.getBurnRateTrend = async (req, res, next) => {
  try {
    const months = Math.min(parseInt(req.query.months || 6), 24);
    const trend = await getBurnRateTrend(req.wallet._id.toString(), months);
    res.json({
      status: 'success',
      results: trend.length,
      data: { trend, months },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /budget ────────────────────────────────────────────────────────────
exports.getBudgetStatus = async (req, res, next) => {
  try {
    const budget = await getBudgetStatus(req.wallet._id.toString());
    if (!budget) return next(new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND'));
    res.json({ status: 'success', data: { budget } });
  } catch (err) {
    next(err);
  }
};

// ── GET /merchants ─────────────────────────────────────────────────────────
exports.getTopMerchants = async (req, res, next) => {
  try {
    const filters = extractFilters(req.query);
    const limit = Math.min(parseInt(req.query.limit || 10), 50);
    const merchants = await getTopMerchants(req.wallet._id.toString(), filters, limit);
    res.json({
      status: 'success',
      results: merchants.length,
      data: { merchants },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /trigger-recurring ────────────────────────────────────────────────
// Manual trigger for testing or admin use. Not for production polling.
exports.triggerRecurring = async (req, res, next) => {
  try {
    await processRecurringTransactions();
    res.json({
      status: 'success',
      message: 'Recurring transaction processing triggered.',
    });
  } catch (err) {
    next(err);
  }
};
