/**
 * Wallet Permission Middleware (RBAC)
 *
 * Validates that the authenticated user has the required role
 * on the requested wallet. Must be used AFTER `authenticate`.
 *
 * Usage:
 *   router.delete('/:id', authenticate, requireWalletPermission('delete'), handler)
 *
 * Permission matrix (mirrors WalletMember.js):
 *   read   → owner, admin, editor, viewer
 *   write  → owner, admin, editor
 *   delete → owner, admin
 *   manage → owner (add/remove members, change roles)
 *
 * Attaches req.walletMember and req.wallet to the request.
 */

'use strict';

const Wallet = require('../models/Wallet');
const WalletMember = require('../models/WalletMember');
const { AppError } = require('./errorHandler');

/**
 * requireWalletPermission(action)
 * action: 'read' | 'write' | 'delete' | 'manage'
 *
 * Expects req.params.walletId to be present.
 */
const requireWalletPermission = (action) => async (req, res, next) => {
  try {
    const walletId = req.params.walletId || req.params.id || req.body.walletId;

    if (!walletId) {
      return next(new AppError('Wallet ID is required.', 400, 'MISSING_WALLET_ID'));
    }

    // ── 1. Load wallet (scoped to tenant) ─────────────────────────────────
    const wallet = await Wallet.findOne({
      _id: walletId,
      tenantId: req.tenant._id,
      isArchived: false,
    });

    if (!wallet) {
      return next(new AppError('Wallet not found.', 404, 'WALLET_NOT_FOUND'));
    }

    // ── 2. Load membership record ─────────────────────────────────────────
    const membership = await WalletMember.findOne({
      walletId: wallet._id,
      userId: req.user._id,
      status: 'accepted',
    });

    if (!membership) {
      return next(
        new AppError('You are not a member of this wallet.', 403, 'NOT_A_MEMBER')
      );
    }

    // ── 3. Check permission ───────────────────────────────────────────────
    if (!membership.hasPermission(action)) {
      return next(
        new AppError(
          `Your role '${membership.role}' does not allow '${action}' on this wallet.`,
          403,
          'INSUFFICIENT_ROLE'
        )
      );
    }

    // ── 4. Attach to request ──────────────────────────────────────────────
    req.wallet = wallet;
    req.walletMember = membership;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * requireTransactionOwnerOrAdmin
 *
 * For edit/delete of individual transactions:
 *   - Editors can only edit their OWN transactions
 *   - Admins/Owners can edit any transaction in the wallet
 *
 * Must be used after requireWalletPermission('write') or ('delete').
 * Expects req.transaction to be set by the route handler before calling next.
 */
const requireTransactionOwnerOrAdmin = (req, res, next) => {
  const { walletMember, user, transaction } = req;

  if (!transaction) {
    return next(new AppError('Transaction not loaded.', 500, 'TRANSACTION_NOT_LOADED'));
  }

  const isAdminOrAbove = ['owner', 'admin'].includes(walletMember.role);
  const isOwner = transaction.createdBy.toString() === user._id.toString();

  if (!isAdminOrAbove && !isOwner) {
    return next(
      new AppError(
        'Editors can only modify their own transactions.',
        403,
        'EDITOR_OWN_ONLY'
      )
    );
  }

  next();
};

module.exports = { requireWalletPermission, requireTransactionOwnerOrAdmin };
