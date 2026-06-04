/**
 * Tenant Model
 *
 * Represents a client application registered on this platform.
 * Each Tenant gets a unique, hashed API key for backend-to-backend auth.
 * All platform resources (Users, Wallets, Transactions) are scoped by tenantId.
 *
 * Multi-tenancy strategy: shared database, discriminated by tenantId.
 * Indexes ensure queries never scan across tenant boundaries.
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const config = require('../config/env');

const tenantSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      maxlength: [100, 'Tenant name cannot exceed 100 characters'],
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'],
    },

    // ── API Key (for server-to-server requests) ────────────────────────────
    // Stored as a SHA-256 HMAC hash — never in plaintext.
    // The raw key is shown ONCE at creation time.
    apiKeyHash: {
      type: String,
      required: true,
      select: false, // never returned in queries by default
    },

    apiKeyPrefix: {
      // First 8 chars of raw key for identification (e.g. "sk_live_ab12cd34")
      type: String,
      required: true,
    },

    // ── Configuration ─────────────────────────────────────────────────────
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Rate limit override (null = use global default)
    rateLimitOverride: {
      type: Number,
      default: null,
    },

    // ── Contact ───────────────────────────────────────────────────────────
    ownerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    webhookUrl: {
      type: String,
      default: null,
    },

    // ── Metadata ─────────────────────────────────────────────────────────
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Note: slug uniqueness is enforced by `unique: true` on the field definition above.
// Adding a separate schema.index for slug would create a duplicate — omitted intentionally.
tenantSchema.index({ isActive: 1, createdAt: -1 });

// ── Static: Hash API key using HMAC-SHA256 ─────────────────────────────────
tenantSchema.statics.hashApiKey = function (rawKey) {
  return crypto
    .createHmac('sha256', config.encryption.secret)
    .update(rawKey)
    .digest('hex');
};

// ── Static: Generate a new API key pair ────────────────────────────────────
tenantSchema.statics.generateApiKey = function () {
  const raw = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
  const hash = this.hashApiKey(raw);
  const prefix = raw.slice(0, 16); // "sk_live_" + 8 chars
  return { raw, hash, prefix };
};

// ── Instance: Verify a provided API key ────────────────────────────────────
tenantSchema.methods.verifyApiKey = function (rawKey) {
  const hash = this.constructor.hashApiKey(rawKey);
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(this.apiKeyHash)
  );
};

// ── Virtual: User count (populated separately) ─────────────────────────────
tenantSchema.virtual('users', {
  ref: 'User',
  localField: '_id',
  foreignField: 'tenantId',
  count: true,
});

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;
