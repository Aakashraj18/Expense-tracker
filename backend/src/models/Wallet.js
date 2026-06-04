/**
 * Wallet Model
 *
 * A Wallet represents a financial account or budget pool.
 * Users join wallets via the WalletMember collection (see WalletMember.js).
 * Transactions are a SEPARATE collection — never embedded — to avoid:
 *   1. MongoDB 16MB document size limit
 *   2. Write lock contention during concurrent transaction inserts
 *
 * Balance is NOT stored here to avoid race conditions.
 * Running balance is computed via aggregation pipeline (Step 3).
 */

'use strict';

const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy ─────────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Wallet name is required'],
      trim: true,
      maxlength: [100, 'Wallet name cannot exceed 100 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    // ── Ownership ─────────────────────────────────────────────────────────
    // The user who created and owns the wallet
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Financial Settings ────────────────────────────────────────────────
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 3,
      default: 'USD',
    },

    // Monthly budget cap (optional). 0 = no limit.
    monthlyBudget: {
      type: Number,
      default: 0,
      min: [0, 'Monthly budget cannot be negative'],
    },

    // ── Type & Status ─────────────────────────────────────────────────────
    type: {
      type: String,
      enum: ['personal', 'shared', 'business', 'savings'],
      default: 'personal',
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ── Icon & Appearance ─────────────────────────────────────────────────
    color: {
      type: String,
      default: '#6366f1', // Indigo
      match: [/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'],
    },

    icon: {
      type: String,
      default: 'wallet',
      maxlength: 50,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ───────────────────────────────────────────────────────
walletSchema.index({ tenantId: 1, ownerId: 1 });
walletSchema.index({ tenantId: 1, isArchived: 1, createdAt: -1 });

// ── Virtual: Members (populated via WalletMember) ─────────────────────────
walletSchema.virtual('members', {
  ref: 'WalletMember',
  localField: '_id',
  foreignField: 'walletId',
});

// ── Virtual: Transactions count (populated via Transaction) ───────────────
walletSchema.virtual('transactionCount', {
  ref: 'Transaction',
  localField: '_id',
  foreignField: 'walletId',
  count: true,
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
