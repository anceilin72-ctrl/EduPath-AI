/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * handler instead of hanging the request.
 *
 * Express 4 does not catch rejections from async functions. Without this, a
 * failed database call leaves the client waiting until it times out, with
 * nothing in the logs. Every async handler in this project is wrapped.
 */
export default function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
