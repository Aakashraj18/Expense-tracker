/**
 * Report Routes
 * All routes: X-API-Key + JWT + minimum 'read' wallet permission.
 * Mounted under /wallets/:walletId/reports via the wallets router.
 */

'use strict';

const express = require('express');
const reportController = require('../../controllers/reportController');

const router = express.Router({ mergeParams: true }); // inherit walletId param

router.get('/summary',    reportController.getSummary);
router.get('/balance',    reportController.getBalance);
router.get('/categories', reportController.getCategoryBreakdown);
router.get('/trend',      reportController.getBurnRateTrend);
router.get('/budget',     reportController.getBudgetStatus);
router.get('/merchants',  reportController.getTopMerchants);

// Manual trigger — useful for testing recurring logic
router.post('/trigger-recurring', reportController.triggerRecurring);

module.exports = router;
