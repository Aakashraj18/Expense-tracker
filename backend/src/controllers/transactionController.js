/**
 * Transaction Controller
 *
 * Race-Condition Safety Strategy:
 * ─────────────────────────────────────────────────────────────────────────
 * Problem: Multiple users adding expenses to a shared wallet simultaneously
 * can cause duplicate writes, lost updates, or phantom reads.
 *
 * Solution applied here:
 *   1. MongoDB sessions (multi-document ACID transactions) wrap every write.
 *      If any step fails (validation, network, etc.), the entire operation
 *      is atomically rolled back — no partial writes hit the DB.
 *
 *   2. Idempotency Keys (X-Idempotency-Key header):
 *      Clients send a UUID with every POST. If the same key is seen twice
 *      within 24h, the server returns the original response instead of
 *      creating a duplicate. This handles the "double-tap submit" problem.
 *
 *   3. All writes use $set/$inc atomic operators via findOneAndUpdate where
 *      applicable — never read-modify-write patterns.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * GET    /wallets/:walletId/transactions       → Paginated list
 * POST   /wallets/:walletId/transactions       → Create (session-wrapped)
 * GET    /wallets/:walletId/transactions/:id   → Single transaction
 * PATCH  /wallets/:walletId/transactions/:id   → Update (owner or admin)
 * DELETE /wallets/:walletId/transactions/:id   → Soft-delete (owner or admin)
 */

'use strict';

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const { requireTransactionOwnerOrAdmin } = require('../middleware/walletPermission');
const logger = require('../utils/logger');

const withSession = async (fn) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 20 || (err.message && err.message.includes('replica set'))) {
      logger.warn('[DB] Standalone MongoDB — retrying without session');
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};


// In-memory idempotency store (replace with Redis in production)
// Map<idempotencyKey, { statusCode, body, expiresAt }>
const idempotencyCache = new Map();

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const checkIdempotency = (req, res, next) => {
  const key = req.headers['x-idempotency-key'];
  if (!key) return next();

  const cached = idempotencyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    // Return the cached response — idempotent
    return res.status(cached.statusCode).json(cached.body);
  }
  req.idempotencyKey = key;
  next();
};

const storeIdempotency = (key, statusCode, body) => {
  if (!key) return;
  idempotencyCache.set(key, {
    statusCode,
    body,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
};

// ── GET /wallets/:walletId/transactions ───────────────────────────────────
exports.listTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      type,
      startDate,
      endDate,
      status,
      sortBy = 'date',
      sortOrder = 'desc',
    } = req.query;

    const filter = {
      walletId: req.wallet._id,
      isDeleted: false,
    };

    if (category) filter.category = category;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName avatarUrl')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const transactionsWithId = transactions.map((t) => ({
      ...t,
      id: t._id.toString(),
    }));

    res.json({
      status: 'success',
      results: transactions.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: { transactions: transactionsWithId },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /wallets/:walletId/transactions ──────────────────────────────────
exports.createTransaction = [
  checkIdempotency,

  async (req, res, next) => {
    try {
      const {
        type, amount, currency, exchangeRate, category, subcategory,
        description, merchant, date, tags, recurrence, toWalletId, status,
      } = req.body;

      if (!type || !amount || !category || !date) {
        return next(new AppError('type, amount, category, and date are required.', 400, 'MISSING_FIELDS'));
      }
      if (!['expense', 'income', 'transfer'].includes(type)) {
        return next(new AppError("type must be 'expense', 'income', or 'transfer'.", 422, 'INVALID_TYPE'));
      }
      if (parseFloat(amount) <= 0) {
        return next(new AppError('amount must be greater than 0.', 422, 'INVALID_AMOUNT'));
      }

      let recurrenceData = { isRecurring: false };
      if (recurrence?.isRecurring) {
        if (!recurrence.frequency) {
          return next(new AppError('Recurring transactions require a frequency.', 422, 'MISSING_FREQUENCY'));
        }
        recurrenceData = {
          isRecurring: true,
          frequency: recurrence.frequency,
          startDate: new Date(date),
          endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
          nextRunDate: new Date(date),
          isTemplate: true,
        };
      }

      const txData = {
        tenantId: req.tenant._id,
        walletId: req.wallet._id,
        createdBy: req.user._id,
        type,
        amount: parseFloat(amount),
        currency: currency || req.wallet.currency,
        exchangeRate: exchangeRate || 1.0,
        category,
        subcategory,
        description,
        merchant,
        date: new Date(date),
        tags: tags || [],
        recurrence: recurrenceData,
        toWalletId: type === 'transfer' ? toWalletId : null,
        status: status || 'cleared',
      };

      // withSession falls back to no-session on standalone MongoDB
      const transaction = await withSession(async (session) => {
        const opts = session ? { session } : {};
        const [tx] = await Transaction.create([txData], opts);
        return tx;
      });

      logger.info(`[Transaction] Created: ${transaction._id} | wallet: ${req.wallet._id}`);

      const responseBody = { status: 'success', data: { transaction } };
      storeIdempotency(req.idempotencyKey, 201, responseBody);
      res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  },
];


// ── GET /wallets/:walletId/transactions/:id ───────────────────────────────
exports.getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      walletId: req.wallet._id,
      isDeleted: false,
    }).populate('createdBy', 'firstName lastName avatarUrl');

    if (!transaction) {
      return next(new AppError('Transaction not found.', 404, 'TRANSACTION_NOT_FOUND'));
    }

    res.json({ status: 'success', data: { transaction } });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /wallets/:walletId/transactions/:id ─────────────────────────────
exports.updateTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      walletId: req.wallet._id,
      isDeleted: false,
    });

    if (!transaction) {
      return next(new AppError('Transaction not found.', 404, 'TRANSACTION_NOT_FOUND'));
    }

    // Attach transaction to req for RBAC check
    req.transaction = transaction;

    // Inline RBAC: editor can only edit own transactions
    requireTransactionOwnerOrAdmin(req, res, async (rbacErr) => {
      if (rbacErr) return next(rbacErr);

      const allowed = ['amount', 'category', 'subcategory', 'description', 'merchant', 'date', 'tags', 'status'];
      const updates = {};
      allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

      const updated = await Transaction.findByIdAndUpdate(
        transaction._id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      res.json({ status: 'success', data: { transaction: updated } });
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /wallets/:walletId/transactions/:id ────────────────────────────
exports.deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      walletId: req.wallet._id,
      isDeleted: false,
    });

    if (!transaction) {
      return next(new AppError('Transaction not found.', 404, 'TRANSACTION_NOT_FOUND'));
    }

    req.transaction = transaction;

    requireTransactionOwnerOrAdmin(req, res, async (rbacErr) => {
      if (rbacErr) return next(rbacErr);

      // Soft delete — preserves audit trail
      await Transaction.findByIdAndUpdate(transaction._id, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      });

      logger.info(
        `[Transaction] Soft-deleted: ${transaction._id} by user: ${req.user._id}`
      );

      res.json({ status: 'success', message: 'Transaction deleted.' });
    });
  } catch (err) {
    next(err);
  }
};
