/**
 * Aggregation Service
 *
 * All financial computations run natively on the MongoDB server using
 * aggregation pipelines. This avoids pulling raw documents into Node.js
 * memory and leverages the compound indexes defined on Transaction:
 *   - { walletId, date }      → range scans for balance & trend
 *   - { walletId, category }  → category groupings
 *
 * Exported pipeline builders (each returns a Promise):
 *   getSummary(walletId, filters)       → balance + category breakdown
 *   getCategoryBreakdown(walletId, f)   → per-category spend/income totals
 *   getBurnRateTrend(walletId, months)  → monthly net spend for charts
 *   getBudgetStatus(walletId)           → spend vs monthlyBudget
 *   getTopMerchants(walletId, f)        → ranked merchant spend
 */

'use strict';

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');

// ── Helper: build base $match stage ──────────────────────────────────────
const baseMatch = (walletId, { startDate, endDate, type, category } = {}) => {
  const match = {
    walletId: new mongoose.Types.ObjectId(walletId),
    isDeleted: false,
    status: { $ne: 'void' },
  };
  if (type) match.type = type;
  if (category) match.category = category;
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }
  return { $match: match };
};

// ── Helper: compute next date for a given frequency ───────────────────────
const addFrequency = (date, frequency) => {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1);       break;
    case 'weekly':    d.setDate(d.getDate() + 7);       break;
    case 'biweekly':  d.setDate(d.getDate() + 14);      break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);     break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);     break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
    default: break;
  }
  return d;
};

module.exports.addFrequency = addFrequency;

// ═════════════════════════════════════════════════════════════════════════════
// 1. RUNNING BALANCE
//    Calculates the wallet's current net balance as:
//      SUM(income amounts) - SUM(expense amounts)
//    Transfers are excluded (they don't change net worth).
// ═════════════════════════════════════════════════════════════════════════════
const getRunningBalance = async (walletId, filters = {}) => {
  const pipeline = [
    baseMatch(walletId, filters),
    {
      $group: {
        _id: null,
        totalIncome: {
          $sum: {
            $cond: [
              { $or: [
                { $eq: ['$type', 'income'] },
                { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$subcategory', 'inbound'] }] }
              ]},
              { $multiply: ['$amount', '$exchangeRate'] },
              0
            ],
          },
        },
        totalExpenses: {
          $sum: {
            $cond: [
              { $or: [
                { $eq: ['$type', 'expense'] },
                { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$subcategory', 'outbound'] }] }
              ]},
              { $multiply: ['$amount', '$exchangeRate'] },
              0
            ],
          },
        },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        totalIncome: { $round: ['$totalIncome', 2] },
        totalExpenses: { $round: ['$totalExpenses', 2] },
        netBalance: {
          $round: [{ $subtract: ['$totalIncome', '$totalExpenses'] }, 2],
        },
        transactionCount: 1,
      },
    },
  ];

  const [result] = await Transaction.aggregate(pipeline);
  return result || { totalIncome: 0, totalExpenses: 0, netBalance: 0, transactionCount: 0 };
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. CATEGORY BREAKDOWN
//    Groups expense transactions by category, sorted by total spend desc.
//    Also computes percentage of total spend per category.
//    Uses { walletId, category } compound index for fast execution.
// ═════════════════════════════════════════════════════════════════════════════
const getCategoryBreakdown = async (walletId, filters = {}) => {
  const effectiveFilters = { ...filters, type: 'expense' };

  const pipeline = [
    baseMatch(walletId, effectiveFilters),
    {
      $group: {
        _id: '$category',
        total: { $sum: { $multiply: ['$amount', '$exchangeRate'] } },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' },
        lastTransaction: { $max: '$date' },
      },
    },
    { $sort: { total: -1 } },
    // Second pass: compute percentage of grand total
    {
      $group: {
        _id: null,
        grandTotal: { $sum: '$total' },
        categories: { $push: '$$ROOT' },
      },
    },
    { $unwind: '$categories' },
    {
      $project: {
        _id: 0,
        category: '$categories._id',
        total: { $round: ['$categories.total', 2] },
        count: '$categories.count',
        avgAmount: { $round: ['$categories.avgAmount', 2] },
        lastTransaction: '$categories.lastTransaction',
        percentage: {
          $round: [
            {
              $multiply: [
                { $divide: ['$categories.total', '$grandTotal'] },
                100,
              ],
            },
            1,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ];

  return Transaction.aggregate(pipeline);
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. BURN RATE TREND
//    Groups transactions by month, returns monthly income/expense/net
//    for the last N months. Powers the trend line chart in Step 4.
//    Uses { walletId, date } compound index for efficient date-range scans.
// ═════════════════════════════════════════════════════════════════════════════
const getBurnRateTrend = async (walletId, months = 6) => {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const pipeline = [
    baseMatch(walletId, { startDate }),
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
        },
        income: {
          $sum: {
            $cond: [{ $eq: ['$type', 'income'] }, { $multiply: ['$amount', '$exchangeRate'] }, 0],
          },
        },
        expenses: {
          $sum: {
            $cond: [{ $eq: ['$type', 'expense'] }, { $multiply: ['$amount', '$exchangeRate'] }, 0],
          },
        },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        month: '$_id.month',
        // ISO date string for charting (first day of month)
        period: {
          $dateToString: {
            format: '%Y-%m',
            date: {
              $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 },
            },
          },
        },
        income: { $round: ['$income', 2] },
        expenses: { $round: ['$expenses', 2] },
        net: { $round: [{ $subtract: ['$income', '$expenses'] }, 2] },
        transactionCount: 1,
      },
    },
    { $sort: { year: 1, month: 1 } },
  ];

  return Transaction.aggregate(pipeline);
};

// ═════════════════════════════════════════════════════════════════════════════
// 4. BUDGET STATUS
//    Compares current month's expenses against wallet.monthlyBudget.
//    Returns spend, budget, remaining, and percentage used.
// ═════════════════════════════════════════════════════════════════════════════
const getBudgetStatus = async (walletId) => {
  const wallet = await Wallet.findById(walletId).select('monthlyBudget currency');
  if (!wallet) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const pipeline = [
    baseMatch(walletId, { startDate: startOfMonth, endDate: endOfMonth, type: 'expense' }),
    {
      $group: {
        _id: null,
        spent: { $sum: { $multiply: ['$amount', '$exchangeRate'] } },
        txCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        spent: { $round: ['$spent', 2] },
        txCount: 1,
      },
    },
  ];

  const [result] = await Transaction.aggregate(pipeline);
  const spent = result?.spent || 0;
  const budget = wallet.monthlyBudget || 0;

  return {
    currency: wallet.currency,
    budget,
    spent: Math.round(spent * 100) / 100,
    remaining: budget > 0 ? Math.round((budget - spent) * 100) / 100 : null,
    percentageUsed: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
    isOverBudget: budget > 0 && spent > budget,
    period: {
      start: startOfMonth,
      end: endOfMonth,
    },
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// 5. TOP MERCHANTS
//    Ranks merchants by total spend. Useful for identifying subscriptions.
// ═════════════════════════════════════════════════════════════════════════════
const getTopMerchants = async (walletId, filters = {}, limit = 10) => {
  const pipeline = [
    baseMatch(walletId, { ...filters, type: 'expense' }),
    { $match: { merchant: { $ne: null } } },
    {
      $group: {
        _id: '$merchant',
        total: { $sum: { $multiply: ['$amount', '$exchangeRate'] } },
        count: { $sum: 1 },
        lastDate: { $max: '$date' },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        merchant: '$_id',
        total: { $round: ['$total', 2] },
        count: 1,
        lastDate: 1,
      },
    },
  ];

  return Transaction.aggregate(pipeline);
};

// ═════════════════════════════════════════════════════════════════════════════
// 6. FULL SUMMARY (combined for a single API call)
//    Runs balance + category + budget in parallel for the dashboard.
// ═════════════════════════════════════════════════════════════════════════════
const getSummary = async (walletId, filters = {}) => {
  const [balance, categories, budget, trend, topMerchants] = await Promise.all([
    getRunningBalance(walletId, filters),
    getCategoryBreakdown(walletId, filters),
    getBudgetStatus(walletId),
    getBurnRateTrend(walletId, 6),
    getTopMerchants(walletId, filters, 5),
  ]);

  return { balance, categories, budget, trend, topMerchants };
};

module.exports = {
  getRunningBalance,
  getCategoryBreakdown,
  getBurnRateTrend,
  getBudgetStatus,
  getTopMerchants,
  getSummary,
  addFrequency,
};
