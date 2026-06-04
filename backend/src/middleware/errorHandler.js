/**
 * Global Error Handler Middleware
 *
 * Catches all errors thrown in route handlers and middleware.
 * Normalizes error shapes for consistent API responses.
 * Never leaks stack traces in production.
 */

'use strict';

const logger = require('../utils/logger');
const config = require('../config/env');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? 'error' : 'fail';
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle Mongoose CastError (invalid ObjectId etc.)
 */
const handleCastError = (err) =>
  new AppError(`Invalid value for field '${err.path}': ${err.value}`, 400, 'INVALID_ID');

/**
 * Handle Mongoose duplicate key error (E11000)
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  return new AppError(`Duplicate value for '${field}'.`, 409, 'DUPLICATE_KEY');
};

/**
 * Handle Mongoose ValidationError
 */
const handleValidationError = (err) => {
  const messages = Object.values(err.errors)
    .map((e) => e.message)
    .join('; ');
  return new AppError(`Validation failed: ${messages}`, 422, 'VALIDATION_ERROR');
};

/**
 * Handle JWT errors
 */
const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN');

const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401, 'TOKEN_EXPIRED');

// ── Main Error Handler ─────────────────────────────────────────────────────

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  // Normalize known error types
  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKeyError(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} → ${statusCode}`, {
      message: error.message,
      stack: err.stack,
      userId: req.user?._id,
      tenantId: req.tenant?._id,
    });
  }

  const response = {
    status,
    code: error.code || 'INTERNAL_ERROR',
    message: statusCode >= 500 && !config.isDev
      ? 'An unexpected error occurred. Please try again.'
      : error.message,
  };

  // Include stack trace in dev only
  if (config.isDev && statusCode >= 500) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// ── 404 Handler ───────────────────────────────────────────────────────────

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

module.exports = { errorHandler, notFoundHandler, AppError };
