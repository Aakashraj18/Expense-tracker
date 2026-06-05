/**
 * User Model
 *
 * Platform users scoped to a Tenant.
 * Passwords are bcrypt-hashed (never stored plaintext).
 * Refresh tokens stored as hashes for rotation support.
 *
 * A User can belong to multiple Wallets via the WalletMember join collection.
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy ─────────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },

    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => validator.isEmail(v) && v.endsWith('@gmail.com'),
        message: 'Email must be a valid Gmail address (username@gmail.com)',
      },
    },

    avatarUrl: {
      type: String,
      default: null,
    },

    // ── Auth ──────────────────────────────────────────────────────────────
    passwordHash: {
      type: String,
      required: true,
      select: false, // excluded from all queries by default
    },

    // Array of hashed refresh tokens (supports multi-device login)
    refreshTokenHashes: {
      type: [String],
      select: false,
      default: [],
    },

    // ── Account Status ────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
      select: false,
      default: null,
    },

    passwordResetToken: {
      type: String,
      select: false,
      default: null,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // ── Platform Role (tenant-level) ──────────────────────────────────────
    // Wallet-level roles are stored in WalletMember (finer-grained)
    platformRole: {
      type: String,
      enum: ['user', 'tenant_admin'],
      default: 'user',
    },

    // ── Preferences ───────────────────────────────────────────────────────
    preferences: {
      currency: { type: String, default: 'USD', maxlength: 3 },
      timezone: { type: String, default: 'UTC' },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'dark' },
      notificationsEnabled: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ───────────────────────────────────────────────────────
// Unique email per tenant (different tenants may share email addresses)
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, isActive: 1 });

// ── Virtual: Full Name ─────────────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Pre-save: Hash password ────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_ROUNDS);
  next();
});

// ── Instance Method: Verify password ──────────────────────────────────────
userSchema.methods.verifyPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// ── Instance Method: Add refresh token hash ───────────────────────────────
userSchema.methods.addRefreshToken = async function (rawToken) {
  const hash = await bcrypt.hash(rawToken, 8); // lower cost for refresh tokens
  this.refreshTokenHashes.push(hash);
  // Keep only last 5 devices
  if (this.refreshTokenHashes.length > 5) {
    this.refreshTokenHashes = this.refreshTokenHashes.slice(-5);
  }
  return this.save();
};

// ── Instance Method: Remove a specific refresh token ─────────────────────
userSchema.methods.removeRefreshToken = async function (rawToken) {
  const checks = await Promise.all(
    this.refreshTokenHashes.map((h) => bcrypt.compare(rawToken, h))
  );
  this.refreshTokenHashes = this.refreshTokenHashes.filter((_, i) => !checks[i]);
  return this.save();
};

// ── Query Helper: Active users only ───────────────────────────────────────
userSchema.query.active = function () {
  return this.where({ isActive: true });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
