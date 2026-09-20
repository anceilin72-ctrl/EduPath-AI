import { ZodError } from 'zod';
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';

/** 404 for anything that did not match a route. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not found',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Single error handler for the whole API.
 *
 * The guiding rule: errors we raised deliberately are explained to the client;
 * errors we did not expect are logged in full on the server and reduced to a
 * generic 500 for the client. That way a stack trace or a Mongo connection
 * string never ends up in a browser response.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // --- input that failed schema validation ---------------------------------
  if (err instanceof ZodError) {
    const fieldMessages = err.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));

    // Build a user-friendly summary
    const summary = fieldMessages.length === 1
      ? fieldMessages[0].message
      : `Please fix the following: ${fieldMessages.map(f => f.message).join('; ')}`;

    return res.status(400).json({
      error: 'Invalid request',
      message: summary,
      // Field-level messages so the frontend can highlight the right input.
      fields: fieldMessages,
    });
  }

  // --- mongoose schema validation ------------------------------------------
  if (err instanceof mongoose.Error.ValidationError) {
    const fieldMessages = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message
    }));

    // Build a user-friendly summary
    const summary = fieldMessages.length === 1
      ? fieldMessages[0].message
      : `Please fix the following: ${fieldMessages.map(f => f.message).join('; ')}`;

    return res.status(400).json({
      error: 'Invalid request',
      message: summary,
      fields: fieldMessages,
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      error: 'Invalid request',
      message: `"${err.value}" is not a valid ${err.path}.`,
    });
  }

  // --- file uploads ---------------------------------------------------------
  /**
   * Matched by name rather than by importing multer, so this module stays
   * independent of it. The size limit is the one users actually hit, and the
   * default message ("File too large") does not say what the limit is.
   */
  if (err?.name === 'MulterError') {
    const message =
      {
        LIMIT_FILE_SIZE: 'That file is larger than 2 MB. A resume should be well under that.',
        LIMIT_FILE_COUNT: 'Please upload one file at a time.',
        LIMIT_UNEXPECTED_FILE: 'Send the file in a field named "resume".',
      }[err.code] ?? `Upload failed: ${err.message}`;

    return res.status(400).json({ error: 'Invalid request', message });
  }

  // --- unique index violation ----------------------------------------------
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return res.status(409).json({
      error: 'Conflict',
      message: field === 'email' ? 'An account with that email already exists.' : `That ${field} is already taken.`,
    });
  }

  // --- errors we raised on purpose -----------------------------------------
  if (err instanceof ApiError || err?.expected) {
    return res.status(err.status || 400).json({
      error: err.name === 'ApiError' ? statusLabel(err.status) : 'Error',
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // --- everything else is a bug --------------------------------------------
  console.error('\nUnhandled error:', err);

  const body = {
    error: 'Server error',
    message: 'Something went wrong on our side.',
  };

  // Full detail in development only.
  if (process.env.NODE_ENV !== 'production') {
    body.message = err?.message ?? body.message;
    body.stack = err?.stack;
  }

  return res.status(500).json(body);
}

function statusLabel(status) {
  return (
    {
      400: 'Invalid request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not found',
      409: 'Conflict',
    }[status] ?? 'Error'
  );
}
