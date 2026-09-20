/**
 * Inspector — shows what is actually stored in your database.
 *
 *   npm run data           a readable summary of every collection and account
 *   npm run data -- --full also prints one complete document per collection,
 *                          as raw JSON, so you can see the real shape
 *
 * This exists for two reasons. First, "where is my data?" is a fair question
 * when the database lives in someone else's cloud and nothing on your machine
 * shows it to you. Second, it is the fastest way to answer an examiner asking
 * whether passwords are stored safely: the script reports that the field holds a
 * bcrypt hash and never prints the hash itself.
 *
 * It only reads. Nothing here writes, updates or deletes.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectDB, disconnectDB, describeTarget } from './config/db.js';
import User from './models/User.js';
import Roadmap from './models/Roadmap.js';
import Progress from './models/Progress.js';

const FULL = process.argv.includes('--full');

/** What each collection is for, keyed by the name Mongoose gives it. */
const PURPOSE = {
  careernodes: ['catalog', 'the 188 career steps — written by npm run seed'],
  roles: ['catalog', 'the 30 target roles — written by npm run seed'],
  users: ['yours', 'one document per account, created when you sign up'],
  roadmaps: ['yours', 'one document per generated plan, kept as a snapshot'],
  progresses: ['yours', 'one row per step you tick complete'],
};

async function inspect() {
  console.log('\nCareer Roadmap Generator — what is in your database\n');

  process.stdout.write(`Connecting to ${describeTarget()}... `);
  await connectDB();
  console.log('ok');

  const { name: dbName, host } = mongoose.connection;
  console.log(`  server    ${host ?? describeHost(process.env.MONGODB_URI)}`);
  console.log(`  database  ${dbName}`);

  await showCollections();
  await showAccounts();
  showUploads();

  console.log(`\n${browserHint(dbName)}\n`);

  await disconnectDB();
}

/** Where to click to see the same documents in a graphical tool. */
function browserHint(dbName) {
  const uri = process.env.MONGODB_URI ?? '';

  if (/mongodb\+srv:\/\//.test(uri)) {
    return (
      'To see the same thing in a browser: Atlas > Database > Browse Collections,\n' +
      `then open the "${dbName}" database.`
    );
  }

  return (
    'To see the same thing in a window: open MongoDB Compass, connect to\n' +
    `mongodb://127.0.0.1:27017, and open the "${dbName}" database on the left.`
  );
}

/* ------------------------------------------------------------------ */
/* collections                                                         */
/* ------------------------------------------------------------------ */

async function showCollections() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const names = collections.map((c) => c.name).sort();

  console.log('\nCollections');

  if (names.length === 0) {
    console.log('  (none yet — run npm run seed to load the career catalog)');
    return;
  }

  const width = Math.max(...names.map((n) => n.length));

  for (const name of names) {
    const count = await mongoose.connection.db.collection(name).countDocuments();
    const [owner, purpose] = PURPOSE[name] ?? ['', ''];
    const label = owner ? `${owner.padEnd(7)} ${purpose}` : '';
    console.log(`  ${name.padEnd(width)}  ${String(count).padStart(5)}   ${label}`);
  }

  if (FULL) {
    for (const name of names) {
      const sample = await mongoose.connection.db.collection(name).findOne();
      if (!sample) continue;
      console.log(`\n--- one document from ${name} ------------------------------`);
      console.log(JSON.stringify(redact(sample), null, 2));
    }
  }
}

/* ------------------------------------------------------------------ */
/* accounts                                                            */
/* ------------------------------------------------------------------ */

async function showAccounts() {
  // +passwordHash overrides select:false. We report on it; we never print it.
  const users = await User.find().select('+passwordHash').sort({ createdAt: 1 }).lean();

  console.log('\nAccounts');

  if (users.length === 0) {
    console.log('  (none yet — sign up in the app and run this again)');
    return;
  }

  for (const user of users) {
    const profile = user.profile ?? {};
    const levels = Object.entries(profile.skillLevels ?? {});

    console.log(`\n  ${user.name}  <${user.email}>`);
    console.log(`    _id            ${user._id}`);
    console.log(`    signed up      ${date(user.createdAt)}`);
    console.log(`    password       ${describeHash(user.passwordHash)}`);
    console.log(`    setup done     ${profile.onboardedAt ? date(profile.onboardedAt) : 'not yet'}`);
    console.log(`    studying       ${profile.fieldOfStudy || '—'} (${profile.educationLevel || '—'}, ${profile.currentYear || '—'})`);
    console.log(`    study time     ${profile.hoursPerDay ?? '—'} h/day  =  ${profile.hoursPerWeek ?? '—'} h/week`);
    console.log(`    target role    ${profile.targetRoleKey || '—'}`);
    console.log(`    skills ticked  ${(profile.knownNodeKeys ?? []).length}`);

    if (levels.length > 0) {
      console.log(`    skills rated   ${levels.length}`);
      for (const [key, level] of levels) console.log(`      ${key.padEnd(28)} ${level}`);
    }

    if (user.resume) {
      console.log(`    resume         ${user.resume.originalName} (uploaded ${date(user.resume.uploadedAt)})`);
      console.log(`                   stored on disk as ${user.resume.storedName}`);
      console.log(`                   ${(user.resume.detectedNodeKeys ?? []).length} skills detected in it`);
    }

    await showPlans(user._id);
  }
}

async function showPlans(userId) {
  const plans = await Roadmap.find({ userId }).sort({ createdAt: -1 }).lean();

  if (plans.length === 0) {
    console.log('    plans          none generated yet');
    return;
  }

  console.log(`    plans          ${plans.length}`);

  for (const plan of plans) {
    const done = await Progress.countDocuments({
      userId,
      roadmapId: plan._id,
      status: 'completed',
    });
    const rows = await Progress.countDocuments({ userId, roadmapId: plan._id });

    console.log(`      ${plan.roleTitle}${plan.isArchived ? '  (archived)' : ''}`);
    console.log(`        _id          ${plan._id}`);
    console.log(`        generated    ${date(plan.generatedAt ?? plan.createdAt)}`);
    console.log(`        size         ${plan.totals?.nodeCount ?? 0} steps in ${plan.totals?.phaseCount ?? 0} phases, ${plan.totals?.hours ?? 0} h over ${plan.totals?.weeks ?? 0} weeks`);
    console.log(`        readiness    ${plan.readiness?.percentHoursComplete ?? 0}% by hours (${plan.readiness?.percentComplete ?? 0}% by step count)`);
    console.log(`        skipped      ${(plan.skipped ?? []).length} steps you already had`);
    console.log(`        narrative    written by ${plan.narrative?.source ?? '—'}`);
    console.log(`        progress     ${done} of ${rows} tracked steps completed`);
  }
}

/* ------------------------------------------------------------------ */
/* files on disk                                                       */
/* ------------------------------------------------------------------ */

function showUploads() {
  // Same expression the upload middleware uses, so this points at the real folder.
  const dir = path.resolve(process.cwd(), 'uploads');

  console.log('\nFiles on your own disk');
  console.log(`  ${dir}`);

  if (!fs.existsSync(dir)) {
    console.log('    (no folder yet — it is created on the first resume upload)');
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));

  if (files.length === 0) {
    console.log('    (empty)');
    return;
  }

  for (const file of files) {
    const { size } = fs.statSync(path.join(dir, file));
    console.log(`    ${file}  ${Math.round(size / 1024)} KB`);
  }

  console.log('  Resume files stay on this machine. Only the filename goes to the database.');
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Describe the hash without revealing it. $2a$10$ is the algorithm, not a secret. */
function describeHash(hash) {
  if (!hash) return 'no hash stored (this should not happen)';
  const cost = hash.split('$')[2];
  return `bcrypt hash, ${hash.length} characters, cost ${cost ?? '?'} — not stored in readable form`;
}

/** Never print credentials, even to a terminal. */
function describeHost(uri = '') {
  const match = uri.match(/@([^/?]+)/);
  return match ? match[1] : 'unknown';
}

function date(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

/** Strip the one field that must never reach a screen or a screenshot. */
function redact(document) {
  if (!document || typeof document !== 'object') return document;
  const copy = { ...document };

  if ('passwordHash' in copy) copy.passwordHash = '<hidden>';

  // A whole plan is thousands of lines of JSON. One phase shows the shape.
  if (Array.isArray(copy.phases) && copy.phases.length > 1) {
    const rest = copy.phases.length - 1;
    copy.phases = [copy.phases[0], `<${rest} more phase(s), same shape>`];
  }

  return copy;
}

/* ------------------------------------------------------------------ */

inspect().catch(async (err) => {
  console.error(`\nCould not read the database.\n\n${err.message}\n`);
  try {
    await disconnectDB();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
