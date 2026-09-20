/**
 * Seeder — loads the career catalog into MongoDB.
 *
 *   npm run seed              upsert everything, leaving user data untouched
 *   npm run seed -- --fresh   delete existing nodes and roles first
 *
 * Two deliberate properties:
 *
 *   1. It validates the catalog *before* opening a database connection, so a
 *      typo in seed data never leaves the database half-written.
 *
 *   2. It upserts on `key` rather than inserting, so running it repeatedly is
 *      safe. Re-running after editing one node updates that node and leaves
 *      user accounts, roadmaps and progress alone.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDB, disconnectDB, describeTarget } from './config/db.js';
import { validateCatalog, allNodes, allRoles } from './data/index.js';
import CareerNode from './models/CareerNode.js';
import Role from './models/Role.js';

const FRESH = process.argv.includes('--fresh');

async function seed() {
  console.log('\nCareer Roadmap Generator — database seed\n');

  // ---- 1. validate before touching anything -------------------------------
  process.stdout.write('Validating catalog... ');
  const { stats, warnings } = validateCatalog();
  console.log('ok');

  console.log(`  ${stats.nodeCount} career steps across ${Object.keys(stats.nodesByDomain).length} domains`);
  console.log(`  ${stats.roleCount} target roles`);
  console.log(`  ${stats.calendarBoundNodeCount} steps have a fixed institutional duration`);
  for (const warning of warnings) console.log(`  note: ${warning}`);

  // ---- 2. connect ---------------------------------------------------------
  process.stdout.write(`\nConnecting to ${describeTarget()}... `);
  await connectDB();
  console.log(`ok (${mongoose.connection.name})`);

  // ---- 3. optional wipe ---------------------------------------------------
  if (FRESH) {
    console.log('\n--fresh: clearing existing catalog (user data is not touched)');
    const [nodesDeleted, rolesDeleted] = await Promise.all([
      CareerNode.deleteMany({}),
      Role.deleteMany({}),
    ]);
    console.log(`  removed ${nodesDeleted.deletedCount} nodes, ${rolesDeleted.deletedCount} roles`);
  }

  // ---- 4. upsert ----------------------------------------------------------
  console.log('\nWriting catalog...');

  const nodeResult = await CareerNode.bulkWrite(
    allNodes.map((node) => ({
      updateOne: {
        filter: { key: node.key },
        update: { $set: node },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const roleResult = await Role.bulkWrite(
    allRoles.map((role) => ({
      updateOne: {
        filter: { key: role.key },
        update: { $set: role },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  console.log(
    `  career steps: ${nodeResult.upsertedCount} inserted, ${nodeResult.modifiedCount} updated`
  );
  console.log(`  roles:        ${roleResult.upsertedCount} inserted, ${roleResult.modifiedCount} updated`);

  // ---- 5. verify what actually landed -------------------------------------
  // Trusting the write result is not the same as checking the database.
  const [nodeCount, roleCount] = await Promise.all([
    CareerNode.countDocuments(),
    Role.countDocuments(),
  ]);

  console.log(`\nDatabase now holds ${nodeCount} career steps and ${roleCount} roles.`);

  if (nodeCount < allNodes.length || roleCount < allRoles.length) {
    throw new Error(
      `Expected at least ${allNodes.length} nodes and ${allRoles.length} roles. ` +
        'Something did not write. Try: npm run seed -- --fresh'
    );
  }

  console.log('\nSeed complete. Start the API with: npm run dev\n');
}

seed()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`\nSeed failed.\n\n${err.message}\n`);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
