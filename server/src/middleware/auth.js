import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

/**
 * Issue a signed token for a user.
 *
 * The payload carries only the user id. Putting the profile in the token would
 * mean a stale token keeps showing old data after the user edits their profile,
 * so the middleware below re-reads the user on every request instead.
 */
export function signToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    // Refuse rather than fall back to a default secret — a hardcoded fallback
    // that reaches production is a real vulnerability, and a loud failure here
    // costs one minute of setup.
    throw new Error('JWT_SECRET is not set. Copy server/.env.example to server/.env and set it.');
  }

  return jwt.sign({ sub: user._id.toString() }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Reject the request unless it carries a valid bearer token for a live user.
 * On success, `req.user` is the full user document.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing bearer token.');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Distinguish expiry from tampering: the client should silently re-login
      // on expiry, but a malformed token is worth surfacing differently.
      throw err.name === 'TokenExpiredError'
        ? ApiError.unauthorized('Your session has expired. Please sign in again.')
        : ApiError.unauthorized('Invalid session token.');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      // Token is validly signed but the account is gone.
      throw ApiError.unauthorized('That account no longer exists.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export default requireAuth;
