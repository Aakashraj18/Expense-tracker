/**
 * Tenant API Key Middleware
 *
 * Validates incoming requests from registered tenant applications
 * using HMAC-SHA256 verified API keys.
 * Attaches the resolved tenant to req.tenant for downstream use.
 */

'use strict';

const Tenant = require('../models/Tenant');
const { AppError } = require('./errorHandler');

const tenantApiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return next(new AppError('Missing X-API-Key header', 401, 'MISSING_API_KEY'));
    }

    // Extract prefix from the raw key to find the tenant efficiently
    const prefix = apiKey.slice(0, 16);

    const tenant = await Tenant.findOne({
      apiKeyPrefix: prefix,
      isActive: true,
    }).select('+apiKeyHash');

    if (!tenant) {
      return next(new AppError('Invalid or revoked API key', 401, 'INVALID_API_KEY'));
    }

    // Constant-time comparison to prevent timing attacks
    if (!tenant.verifyApiKey(apiKey)) {
      return next(new AppError('Invalid or revoked API key', 401, 'INVALID_API_KEY'));
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { tenantApiKeyAuth };
