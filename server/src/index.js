import 'dotenv/config';

import { createApp } from './app.js';
import { connectDB, disconnectDB, describeTarget } from './config/db.js';

/**
 * Entry point: check configuration, connect to MongoDB, then listen.
 *
 * The order matters. Connecting first means the server never accepts a request
 * it cannot serve — otherwise the first user gets a confusing 500 while Mongo is
 * still handshaking.
 */

const PORT = Number(process.env.PORT) || 5000;

/**
 * Fail fast on missing configuration, with the fix in the message.
 *
 * Every one of these has bitten someone setting the project up on a new machine,
 * and a clear message here saves a lot of guessing at a stack trace.
 */
function checkEnvironment() {
  const missing = [];

  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');

  if (missing.length > 0) {
    console.error(`\nMissing required environment variable(s): ${missing.join(', ')}`);
    console.error('\nFix it like this, from the server folder:');
    console.error('  Copy-Item .env.example .env');
    console.error('Then open .env and fill in the values.\n');
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    // Not an error. The deterministic engine does all the planning; the AI layer
    // only rewords the explanation, and there is a rule-based writer behind it.
    console.log('AI narration: off (GEMINI_API_KEY is blank) — using the rule-based writer.');
  }
}

async function start() {
  checkEnvironment();

  await connectDB(process.env.MONGODB_URI);

  // Print what we connected to. When something looks stale or empty, the first
  // question is always "which database am I actually talking to?".
  console.log(`\nDatabase: ${describeTarget()}`);

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`\nAPI listening on http://localhost:${PORT}`);
    console.log(`Health check:      http://localhost:${PORT}/api/health\n`);
  });

  /**
   * Close the database connection on shutdown.
   *
   * Without this, nodemon restarting on every file save leaves connections open
   * until the server drops them. Locally that is untidy; against Atlas's free
   * tier, where the connection limit is low, a long editing session can
   * genuinely exhaust it.
   */
  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down.`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('\nThe server failed to start.\n');
  console.error(err.message);
  process.exit(1);
});
