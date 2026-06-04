/**
 * Tenant Registration Routes
 *
 * POST /api/v1/tenants/register
 *   Creates a new tenant and returns the raw API key (shown ONCE).
 *
 * GET /api/v1/tenants/me
 *   Returns current tenant info (requires X-API-Key header).
 */

'use strict';

const express = require('express');
const Tenant = require('../../models/Tenant');
const { tenantApiKeyAuth } = require('../../middleware/tenantAuth');
const { AppError } = require('../../middleware/errorHandler');

const router = express.Router();

// ── POST /register ─────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { name, slug, ownerEmail, plan } = req.body;

    if (!name || !slug || !ownerEmail) {
      return next(new AppError('name, slug, and ownerEmail are required', 400, 'MISSING_FIELDS'));
    }

    const { raw, hash, prefix } = Tenant.generateApiKey();

    const tenant = await Tenant.create({
      name,
      slug,
      ownerEmail,
      plan: plan || 'free',
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
    });

    res.status(201).json({
      status: 'success',
      message: 'Tenant registered. Store your API key securely — it will NOT be shown again.',
      data: {
        tenant: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          createdAt: tenant.createdAt,
        },
        // This is the ONLY time the raw key is exposed
        apiKey: raw,
        apiKeyPrefix: prefix,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /me ───────────────────────────────────────────────────────────────
router.get('/me', tenantApiKeyAuth, async (req, res) => {
  res.json({
    status: 'success',
    data: {
      tenant: {
        id: req.tenant._id,
        name: req.tenant.name,
        slug: req.tenant.slug,
        plan: req.tenant.plan,
        isActive: req.tenant.isActive,
        createdAt: req.tenant.createdAt,
      },
    },
  });
});

module.exports = router;
