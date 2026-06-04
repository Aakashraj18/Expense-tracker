/**
 * Auth Routes
 * All routes require X-API-Key (tenant identification).
 * Protected routes additionally require a Bearer JWT.
 */

'use strict';

const express = require('express');
const { tenantApiKeyAuth } = require('../../middleware/tenantAuth');
const { authenticate } = require('../../middleware/authenticate');
const authController = require('../../controllers/authController');

const router = express.Router();

// All auth routes require a valid tenant API key
router.use(tenantApiKeyAuth);

router.post('/register', authController.register);
router.post('/login',    authController.login);
router.post('/refresh',  authController.refreshToken);

// Protected (requires valid access token)
router.use(authenticate);
router.post('/logout',   authController.logout);
router.get('/me',        authController.getMe);
router.patch('/me',      authController.updateMe);

module.exports = router;
