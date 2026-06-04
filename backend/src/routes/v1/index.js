/**
 * API v1 Router
 * Central mount point for all v1 route modules.
 */

'use strict';

const express = require('express');
const tenantRoutes = require('./tenants');
const authRoutes = require('./auth');
const walletRoutes = require('./wallets');

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

router.use('/tenants',  tenantRoutes);
router.use('/auth',     authRoutes);
router.use('/wallets',  walletRoutes);

// Step 3: aggregation + recurring routes (coming next)
// router.use('/reports', reportRoutes);

module.exports = router;
