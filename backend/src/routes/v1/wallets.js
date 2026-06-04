/**
 * Wallet Routes
 * All routes: X-API-Key + Bearer JWT required.
 * RBAC enforced per-route via requireWalletPermission middleware.
 */

'use strict';

const express = require('express');
const { tenantApiKeyAuth } = require('../../middleware/tenantAuth');
const { authenticate } = require('../../middleware/authenticate');
const { requireWalletPermission } = require('../../middleware/walletPermission');
const walletController = require('../../controllers/walletController');
const transactionController = require('../../controllers/transactionController');

const router = express.Router();

// All wallet routes require tenant + user auth
router.use(tenantApiKeyAuth, authenticate);

// ── Wallet CRUD ───────────────────────────────────────────────────────────
router.get('/',    walletController.listWallets);
router.post('/',   walletController.createWallet);

router.get(
  '/:id',
  requireWalletPermission('read'),
  walletController.getWallet
);

router.patch(
  '/:id',
  requireWalletPermission('write'),    // admin+
  walletController.updateWallet
);

router.delete(
  '/:id',
  requireWalletPermission('manage'),   // owner only
  walletController.archiveWallet
);

// ── Member Management ─────────────────────────────────────────────────────
router.get(
  '/:walletId/members',
  requireWalletPermission('read'),
  walletController.listMembers
);

router.post(
  '/:walletId/members',
  requireWalletPermission('manage'),   // owner only
  walletController.addMember
);

router.patch(
  '/:walletId/members/:userId',
  requireWalletPermission('manage'),   // owner only
  walletController.updateMemberRole
);

router.delete(
  '/:walletId/members/:userId',
  requireWalletPermission('manage'),   // owner only
  walletController.removeMember
);

// ── Transactions (nested under wallet) ────────────────────────────────────
router.get(
  '/:walletId/transactions',
  requireWalletPermission('read'),
  transactionController.listTransactions
);

router.post(
  '/:walletId/transactions',
  requireWalletPermission('write'),    // editor+
  transactionController.createTransaction
);

router.get(
  '/:walletId/transactions/:id',
  requireWalletPermission('read'),
  transactionController.getTransaction
);

router.patch(
  '/:walletId/transactions/:id',
  requireWalletPermission('write'),    // editor+ (further scoped in controller)
  transactionController.updateTransaction
);

router.delete(
  '/:walletId/transactions/:id',
  requireWalletPermission('delete'),   // admin+ (further scoped in controller)
  transactionController.deleteTransaction
);

module.exports = router;
