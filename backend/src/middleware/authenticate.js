/**
 * Authentication Middleware
 *
 * Verifies the JWT access token on every protected route.
 * Attaches req.user (the authenticated user document).
 * Attaches req.tenant (the tenant the user belongs to).
 *
 * Token format: Authorization: Bearer <access_token>
 */

'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const config = require('../config/env');
const { AppError } = require('./errorHandler');

const authenticate = async (req, res, next) => {
  try {
    // ── 1. Extract token ─────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Provide a Bearer token.', 401, 'MISSING_TOKEN'));
    }

    const token = authHeader.split(' ')[1];

    // ── 2. Verify signature & expiry ─────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      // Let the global error handler normalize JsonWebTokenError / TokenExpiredError
      return next(err);
    }

    // ── 3 & 4. Ensure user and tenant exist and are active (Parallel) ────
    const [user, tenant] = await Promise.all([
      User.findById(decoded.sub).select('-refreshTokenHashes').lean(),
      Tenant.findById(decoded.tenantId).lean()
    ]);

    if (!user || !user.isActive) {
      return next(new AppError('User no longer exists or has been deactivated.', 401, 'USER_NOT_FOUND'));
    }
    if (!tenant || !tenant.isActive) {
      return next(new AppError('Tenant account is inactive.', 401, 'TENANT_INACTIVE'));
    }

    // ── 5. Attach to request ─────────────────────────────────────────────
    req.user = user;
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * requireRole('tenant_admin')
 * Platform-level role check (not wallet-level).
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.platformRole)) {
    return next(
      new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN')
    );
  }
  next();
};

module.exports = { authenticate, requireRole };
