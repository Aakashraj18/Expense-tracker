/**
 * Wallet Controller
 *
 * GET    /wallets              → List wallets the user is a member of
 * POST   /wallets              → Create a new wallet
 * GET    /wallets/:id          → Get single wallet + member list
 * PATCH  /wallets/:id          → Update wallet settings (admin+)
 * DELETE /wallets/:id          → Archive wallet (owner only)
 *
 * GET    /wallets/:walletId/members          → List members
 * POST   /wallets/:walletId/members          → Add member (owner only)
 * PATCH  /wallets/:walletId/members/:userId  → Change role (owner only)
 * DELETE /wallets/:walletId/members/:userId  → Remove member (owner only)
 */

'use strict';

const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletMember = require('../models/WalletMember');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
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

// ── GET /wallets ──────────────────────────────────────────────────────────
exports.listWallets = async (req, res, next) => {
  try {
    // Find all wallet IDs where user is an accepted member
    const memberships = await WalletMember.find({
      userId: req.user._id,
      tenantId: req.tenant._id,
      status: 'accepted',
    }).select('walletId role');

    const walletIds = memberships.map((m) => m.walletId);

    const wallets = await Wallet.find({
      _id: { $in: walletIds },
      isArchived: false,
    }).sort({ createdAt: -1 });

    // Attach role to each wallet for convenience
    const roleMap = Object.fromEntries(memberships.map((m) => [m.walletId.toString(), m.role]));
    const walletsWithRole = wallets.map((w) => ({
      ...w.toJSON(),
      myRole: roleMap[w._id.toString()],
    }));

    res.json({ status: 'success', results: wallets.length, data: { wallets: walletsWithRole } });
  } catch (err) {
    next(err);
  }
};

// ── POST /wallets ───────────────────────────────────────────────────────
exports.createWallet = async (req, res, next) => {
  try {
    const { name, description, currency, type, monthlyBudget, color, icon } = req.body;
    if (!name) return next(new AppError('Wallet name is required.', 400, 'MISSING_FIELDS'));

    const wallet = await withSession(async (session) => {
      const opts = session ? { session } : {};
      const [w] = await Wallet.create(
        [{ tenantId: req.tenant._id, ownerId: req.user._id, name, description,
           currency: currency || 'USD', type: type || 'personal',
           monthlyBudget: monthlyBudget || 0, color, icon }],
        opts
      );
      await WalletMember.create(
        [{ walletId: w._id, userId: req.user._id, tenantId: req.tenant._id,
           role: 'owner', status: 'accepted', acceptedAt: new Date() }],
        opts
      );
      return w;
    });

    res.status(201).json({ status: 'success', data: { wallet } });
  } catch (err) {
    next(err);
  }
};

// ── GET /wallets/:id ──────────────────────────────────────────────────────
exports.getWallet = async (req, res, next) => {
  try {
    const members = await WalletMember.find({
      walletId: req.wallet._id,
      status: 'accepted',
    }).populate('userId', 'firstName lastName email avatarUrl');

    res.json({
      status: 'success',
      data: {
        wallet: {
          ...req.wallet.toJSON(),
          myRole: req.walletMember.role,
          members,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /wallets/:id ────────────────────────────────────────────────────
exports.updateWallet = async (req, res, next) => {
  try {
    const allowed = ['name', 'description', 'monthlyBudget', 'color', 'icon'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const wallet = await Wallet.findByIdAndUpdate(req.wallet._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ status: 'success', data: { wallet } });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /wallets/:id ───────────────────────────────────────────────────
exports.archiveWallet = async (req, res, next) => {
  try {
    await Wallet.findByIdAndUpdate(req.wallet._id, { isArchived: true });
    res.json({ status: 'success', message: 'Wallet archived.' });
  } catch (err) {
    next(err);
  }
};

// ── GET /wallets/:walletId/members ────────────────────────────────────────
exports.listMembers = async (req, res, next) => {
  try {
    const members = await WalletMember.find({
      walletId: req.wallet._id,
      status: 'accepted',
    }).populate('userId', 'firstName lastName email avatarUrl platformRole');

    res.json({ status: 'success', results: members.length, data: { members } });
  } catch (err) {
    next(err);
  }
};

// ── POST /wallets/:walletId/members ───────────────────────────────────────
exports.addMember = async (req, res, next) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return next(new AppError('email and role are required.', 400, 'MISSING_FIELDS'));
    }

    if (!WalletMember.ROLES.includes(role) || role === 'owner') {
      return next(new AppError(`Invalid role. Choose from: admin, editor, viewer.`, 422, 'INVALID_ROLE'));
    }

    // Find user in the same tenant
    const targetUser = await User.findOne({ tenantId: req.tenant._id, email, isActive: true });
    if (!targetUser) {
      return next(new AppError('No active user with that email found in this tenant.', 404, 'USER_NOT_FOUND'));
    }

    // Upsert membership (handles re-invite gracefully)
    const membership = await WalletMember.findOneAndUpdate(
      { walletId: req.wallet._id, userId: targetUser._id },
      {
        tenantId: req.tenant._id,
        role,
        status: 'accepted',
        invitedBy: req.user._id,
        acceptedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.status(201).json({ status: 'success', data: { membership } });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /wallets/:walletId/members/:userId ──────────────────────────────
exports.updateMemberRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;

    if (!role || !WalletMember.ROLES.includes(role)) {
      return next(new AppError(`Invalid role. Choose from: ${WalletMember.ROLES.join(', ')}.`, 422, 'INVALID_ROLE'));
    }

    // Prevent demoting the only owner
    if (role !== 'owner') {
      const ownerCount = await WalletMember.countDocuments({
        walletId: req.wallet._id,
        role: 'owner',
        status: 'accepted',
      });
      const isTargetOwner = await WalletMember.findOne({
        walletId: req.wallet._id,
        userId,
        role: 'owner',
      });
      if (ownerCount <= 1 && isTargetOwner) {
        return next(new AppError('Cannot demote the only owner. Assign another owner first.', 409, 'LAST_OWNER'));
      }
    }

    const updated = await WalletMember.findOneAndUpdate(
      { walletId: req.wallet._id, userId },
      { role },
      { new: true, runValidators: true }
    );

    if (!updated) return next(new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND'));

    res.json({ status: 'success', data: { membership: updated } });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /wallets/:walletId/members/:userId ─────────────────────────────
exports.removeMember = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Prevent removing the only owner
    const membership = await WalletMember.findOne({ walletId: req.wallet._id, userId });
    if (membership?.role === 'owner') {
      const ownerCount = await WalletMember.countDocuments({ walletId: req.wallet._id, role: 'owner' });
      if (ownerCount <= 1) {
        return next(new AppError('Cannot remove the only owner.', 409, 'LAST_OWNER'));
      }
    }

    await WalletMember.findOneAndDelete({ walletId: req.wallet._id, userId });
    res.json({ status: 'success', message: 'Member removed.' });
  } catch (err) {
    next(err);
  }
};
