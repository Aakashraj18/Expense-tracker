/**
 * Transaction Model
 *
 * The core financial record. Deliberately kept as a flat, separate collection
 * (NOT embedded in Wallet) for:
 *   1. Concurrent write safety — multiple users adding expenses simultaneously
 *      without contention on a parent wallet document
 *   2. Unlimited transaction history (no 16MB document cap)
 *   3. Efficient aggregation pipelines that operate on indexed fields
 *
 * Compound Indexes (as specified):
 *   - (walletId, date)     → date-range queries and running balance calc
 *   - (walletId, category) → category-grouped spending reports
 *
 * Recurring Transactions:
 *   recurrence field defines the schedule; the background worker (Step 3)
 *   reads this and creates child transactions automatically.
 */

'use strict';

const mongoose = require('mongoose');

// ── Sub-schemas ────────────────────────────────────────────────────────────

const recurrenceSchema = new mongoose.Schema(
  {
    isRecurring: { type: Boolean, default: false },

    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
      default: null,
    },

    // When did this recurrence series start?
    startDate: { type: Date, default: null },

    // When should it stop? null = indefinite
    endDate: { type: Date, default: null },

    // Next scheduled run date (updated by background worker after each run)
    nextRunDate: { type: Date, default: null, index: true },

    // ID of the parent "template" transaction this was generated from
    parentTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },

    // Is this the template (true) or a generated child (false)?
    isTemplate: { type: Boolean, default: false },
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    url: String,
    mimeType: String,
    sizeBytes: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Main Schema ────────────────────────────────────────────────────────────

const transactionSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy ───────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    // ── Wallet Reference ────────────────────────────────────────────────
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: [true, 'walletId is required'],
      index: true,
    },

    // ── Author ──────────────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Core Financial Fields ────────────────────────────────────────────
    type: {
      type: String,
      enum: ['expense', 'income', 'transfer'],
      required: [true, 'Transaction type is required'],
    },

    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      // Store as positive number; type (expense/income) determines sign in aggregations
      min: [0.01, 'Amount must be greater than 0'],
    },

    currency: {
      type: String,
      uppercase: true,
      trim: true,
      maxlength: 3,
      default: 'USD',
    },

    // Exchange rate relative to wallet's base currency (1.0 if same currency)
    exchangeRate: {
      type: Number,
      default: 1.0,
      min: [0, 'Exchange rate cannot be negative'],
    },

    // ── Classification ───────────────────────────────────────────────────
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      maxlength: 100,
      index: true,
    },

    subcategory: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
    },

    // ── Description ──────────────────────────────────────────────────────
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },

    merchant: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // ── Date ─────────────────────────────────────────────────────────────
    // Use 'date' (actual transaction date) separately from createdAt (record created)
    // This allows backdating entries while preserving accurate audit timestamps
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      index: true,
    },

    // ── Recurring ────────────────────────────────────────────────────────
    recurrence: {
      type: recurrenceSchema,
      default: () => ({ isRecurring: false }),
    },

    // ── Transfer Fields (when type === 'transfer') ────────────────────────
    toWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
    },

    // ── Attachments (receipts, invoices) ─────────────────────────────────
    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    // ── Status ───────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'cleared', 'reconciled', 'void'],
      default: 'cleared',
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes (required by specification) ───────────────────────────
// (walletId, date) → eliminates full collection scans for date-range balance queries
transactionSchema.index({ walletId: 1, date: -1 });

// (walletId, category) → eliminates scans for category-grouped spending reports
transactionSchema.index({ walletId: 1, category: 1 });

// High-concurrency support: tenantId isolation + date sort
transactionSchema.index({ tenantId: 1, walletId: 1, date: -1 });

// Background worker index: find due recurring templates efficiently
transactionSchema.index(
  { 'recurrence.isRecurring': 1, 'recurrence.nextRunDate': 1, 'recurrence.isTemplate': 1 },
  { sparse: true }
);

// Soft-delete filter (most queries will filter isDeleted: false)
transactionSchema.index({ walletId: 1, isDeleted: 1, date: -1 });

// ── Query Helper: Exclude soft-deleted ────────────────────────────────────
transactionSchema.query.active = function () {
  return this.where({ isDeleted: false });
};

// ── Pre-save Validation ───────────────────────────────────────────────────
transactionSchema.pre('save', function (next) {
  if (this.type === 'transfer' && !this.toWalletId) {
    return next(new Error('Transfer transactions must specify toWalletId'));
  }
  if (this.recurrence.isRecurring && !this.recurrence.frequency) {
    return next(new Error('Recurring transactions must specify a frequency'));
  }
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
