import 'dotenv/config';

import { createApp } from './app.js';
import { connectDB, disconnectDB, describeTarget } from './config/db.js';

/**
 * Entry point: check configuration, connect to MongoDB, then listen.
 */

const PORT = Number(process.env.PORT) || 5000;

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
    console.log(
      'AI narration: off (GEMINI_API_KEY is blank) — using the rule-based writer.'
    );
  }
}

async function start() {
  checkEnvironment();

  await connectDB(process.env.MONGODB_URI);

  console.log(`\nDatabase: ${describeTarget()}`);

  const app = createApp();

  // 0.0.0.0 is required for cloud deployment platforms such as Render.
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nAPI listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health\n`);
  });

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