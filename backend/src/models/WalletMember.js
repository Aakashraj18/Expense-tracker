/**
 * WalletMember Model  (Join Collection)
 *
 * Implements Role-Based Access Control for shared wallets.
 * Roles:
 *   - owner  : Full control (delete wallet, manage members)
 *   - admin  : Can edit/delete any transaction in the wallet
 *   - editor : Can add transactions, edit own transactions
 *   - viewer : Read-only access to the wallet dashboard
 *
 * Separating this into its own collection enables:
 *   1. Efficient membership queries with covering indexes
 *   2. Atomic role updates without touching Wallet documents
 *   3. Audit-trail support (timestamps on role changes)
 */

'use strict';

const mongoose = require('mongoose');

const ROLES = ['owner', 'admin', 'editor', 'viewer'];

const walletMemberSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },

    // ── RBAC ──────────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: 'viewer',
    },

    // Who added this member (for audit trail)
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Invitation State ──────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'accepted', // 'pending' when invitation emails are implemented
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound Indexes ───────────────────────────────────────────────────────
// Enforce one membership record per user per wallet
walletMemberSchema.index({ walletId: 1, userId: 1 }, { unique: true });

// Efficient lookup: "which wallets does this user belong to?"
walletMemberSchema.index({ userId: 1, tenantId: 1, status: 1 });

// Efficient lookup: "who are the members of this wallet?"
walletMemberSchema.index({ walletId: 1, role: 1, status: 1 });

// ── Static: Role permission helpers ───────────────────────────────────────
walletMemberSchema.statics.ROLES = ROLES;

walletMemberSchema.statics.canWrite = function (role) {
  return ['owner', 'admin', 'editor'].includes(role);
};

walletMemberSchema.statics.canDelete = function (role) {
  return ['owner', 'admin'].includes(role);
};

walletMemberSchema.statics.canManageMembers = function (role) {
  return ['owner'].includes(role);
};

// ── Instance: Permission check shortcuts ──────────────────────────────────
walletMemberSchema.methods.hasPermission = function (action) {
  const permMap = {
    read: ['owner', 'admin', 'editor', 'viewer'],
    write: ['owner', 'admin', 'editor'],
    delete: ['owner', 'admin'],
    manage: ['owner'],
  };
  return (permMap[action] || []).includes(this.role);
};

const WalletMember = mongoose.model('WalletMember', walletMemberSchema);

module.exports = WalletMember;
