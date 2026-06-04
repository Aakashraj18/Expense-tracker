/**
 * JWT Token Utility
 * Signs and verifies access + refresh tokens.
 */

'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Sign a short-lived access token.
 * Payload: { sub: userId, tenantId, role }
 */
const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      tenantId: user.tenantId.toString(),
      role: user.platformRole,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

/**
 * Sign a long-lived refresh token.
 * Minimal payload — no sensitive data.
 */
const signRefreshToken = (user) =>
  jwt.sign(
    { sub: user._id.toString() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

/**
 * Verify a refresh token.
 * Returns decoded payload or throws.
 */
const verifyRefreshToken = (token) =>
  jwt.verify(token, config.jwt.refreshSecret);

module.exports = { signAccessToken, signRefreshToken, verifyRefreshToken };
