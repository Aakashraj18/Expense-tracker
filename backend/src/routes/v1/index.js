/**
 * API v1 Router
 * Central mount point for all v1 route modules.
 */

'use strict';

const express = require('express');
const tenantRoutes = require('./tenants');

const router = express.Router();

// Health check (unauthenticated)
router.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'Expense Tracker API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

router.use('/tenants', tenantRoutes);

// Placeholder mounts for Steps 2–4 (wired in as built)
// router.use('/auth',         authRoutes);
// router.use('/wallets',      walletRoutes);
// router.use('/transactions', transactionRoutes);

module.exports = router;
