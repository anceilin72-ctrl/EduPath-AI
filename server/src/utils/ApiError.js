/**
 * An error with an HTTP status attached.
 *
 * Anything thrown that is not an ApiError is treated as an unexpected bug by the
 * error handler and reported as a 500 with its details hidden, so internal
 * messages never leak to the client by accident.
 */
export default class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.expected = true;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'You need to sign in to do that.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to that.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }
}
