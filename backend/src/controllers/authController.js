/**
 * Auth Controller
 *
 * POST /api/v1/auth/register  → Create user + wallet, return tokens
 * POST /api/v1/auth/login     → Verify credentials, return tokens
 * POST /api/v1/auth/refresh   → Rotate refresh token, return new access token
 * POST /api/v1/auth/logout    → Invalidate refresh token (specific device)
 * GET  /api/v1/auth/me        → Return current user profile
 * PATCH /api/v1/auth/me       → Update profile/preferences
 */

'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletMember = require('../models/WalletMember');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * withSession — runs `fn(session)` inside a MongoDB ACID transaction
 * when the server is a replica set. Falls back gracefully to no-session
 * mode on a standalone dev node (avoids "Transaction numbers are only
 * allowed on a replica set member" error).
 */
const withSession = async (fn) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    // Standalone MongoDB doesn't support multi-doc transactions.
    // Retry without a session so dev environments work out-of-the-box.
    if (err.code === 20 || (err.message && err.message.includes('replica set'))) {
      logger.warn('[DB] Standalone MongoDB detected — retrying without session (dev mode)');
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

// ── Helper: build token response ──────────────────────────────────────────
const sendTokens = async (user, statusCode, res) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Persist hashed refresh token for this device
  await user.addRefreshToken(refreshToken);

  // Update last login
  user.lastLoginAt = new Date();
  await user.save();

  res.status(statusCode).json({
    status: 'success',
    data: {
      accessToken,
      refreshToken,
      expiresIn: 604800, // 7 days in seconds (matches JWT_EXPIRES_IN)
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        preferences: user.preferences,
      },
    },
  });
};

// ── POST /register ────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, preferences } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return next(new AppError('firstName, lastName, email, and password are required.', 400, 'MISSING_FIELDS'));
    }

    if (password.length < 8) {
      return next(new AppError('Password must be at least 8 characters.', 422, 'WEAK_PASSWORD'));
    }

    // Check for duplicate email within this tenant (before session)
    const existing = await User.findOne({ tenantId: req.tenant._id, email });
    if (existing) {
      return next(new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN'));
    }

    // Atomically create user + default wallet (with replica-set fallback)
    const user = await withSession(async (session) => {
      const opts = session ? { session } : {};

      const [newUser] = await User.create(
        [{ tenantId: req.tenant._id, firstName, lastName, email,
           passwordHash: password, preferences: preferences || {} }],
        opts
      );

      const [wallet] = await Wallet.create(
        [{ tenantId: req.tenant._id, ownerId: newUser._id,
           name: `${firstName}'s Wallet`, type: 'personal',
           currency: preferences?.currency || 'USD' }],
        opts
      );

      await WalletMember.create(
        [{ walletId: wallet._id, userId: newUser._id, tenantId: req.tenant._id,
           role: 'owner', status: 'accepted', acceptedAt: new Date() }],
        opts
      );

      return newUser;
    });

    logger.info(`[Auth] New user registered: ${user.email} (tenant: ${req.tenant.slug})`);
    await sendTokens(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /login ───────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required.', 400, 'MISSING_FIELDS'));
    }

    // Include passwordHash (excluded by default)
    const user = await User.findOne({ tenantId: req.tenant._id, email, isActive: true })
      .select('+passwordHash +refreshTokenHashes');

    // Use same error message for wrong email or password (prevent user enumeration)
    const INVALID_CREDS = new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');

    if (!user) return next(INVALID_CREDS);

    const passwordValid = await user.verifyPassword(password);
    if (!passwordValid) return next(INVALID_CREDS);

    logger.info(`[Auth] Login: ${user.email} (tenant: ${req.tenant.slug})`);
    await sendTokens(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /refresh ─────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return next(new AppError('Refresh token is required.', 400, 'MISSING_REFRESH_TOKEN'));
    }

    // Verify the token signature and expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return next(new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN'));
    }

    const user = await User.findById(decoded.sub)
      .select('+refreshTokenHashes');

    if (!user || !user.isActive) {
      return next(new AppError('User not found or deactivated.', 401, 'USER_NOT_FOUND'));
    }

    // Verify this exact token is stored (bcrypt comparison)
    const bcrypt = require('bcryptjs');
    const checks = await Promise.all(
      user.refreshTokenHashes.map((h) => bcrypt.compare(refreshToken, h))
    );
    const valid = checks.some(Boolean);

    if (!valid) {
      // Token reuse attack — invalidate ALL tokens for this user
      user.refreshTokenHashes = [];
      await user.save();
      return next(new AppError('Refresh token reuse detected. All sessions revoked.', 401, 'TOKEN_REUSE'));
    }

    // Rotate: remove old token, issue new pair
    await user.removeRefreshToken(refreshToken);

    // Re-fetch user without select override for sendTokens
    const freshUser = await User.findById(user._id).select('+refreshTokenHashes');
    await sendTokens(freshUser, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /logout ──────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const user = await User.findById(req.user._id).select('+refreshTokenHashes');
      if (user) await user.removeRefreshToken(refreshToken);
    }

    res.json({ status: 'success', message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── GET /me ───────────────────────────────────────────────────────────────
exports.getMe = (req, res) => {
  res.json({
    status: 'success',
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        fullName: req.user.fullName,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        platformRole: req.user.platformRole,
        preferences: req.user.preferences,
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt,
      },
    },
  });
};

// ── PATCH /me ─────────────────────────────────────────────────────────────
exports.updateMe = async (req, res, next) => {
  try {
    const allowed = ['firstName', 'lastName', 'avatarUrl', 'preferences'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ status: 'success', data: { user } });
  } catch (err) {
    next(err);
  }
};
