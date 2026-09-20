/**
 * Narrative test suite — `npm run test:narrative`.
 *
 * The AI call itself is not tested here; it needs a key and a network. What is
 * tested is everything that makes the AI safe to switch on, plus the rule-based
 * writer that runs when it is off — which is the default.
 *
 * WHAT THIS IS GUARDING AGAINST
 * -----------------------------
 *   1. The validator letting an invented figure through. A model that turns "75
 *      weeks" into "about 6 months" has changed the advice, not the wording, and
 *      that is the one thing the AI must never be able to do.
 *
 *   2. The validator being so strict that a faithful rewrite gets rejected —
 *      which would silently mean the AI layer never works at all.
 *
 *   3. The rule-based writer degrading into one template with the numbers swapped.
 *      If a beginner and a career-changer read the same paragraph, the narrative
 *      has stopped being about them.
 *
 *   4. The narrative failing a roadmap request. It is decoration; it must always
 *      resolve, whatever the environment looks like.
 */

import assert from 'node:assert/strict';
import { allNodes, allRoles } from '../src/data/index.js';
import { generateRoadmap } from '../src/engine/generate.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import {
  writeSummary,
  writePhaseNotes,
  allowedNumbers,
  validateNarrative,
  buildNarrative,
} from '../src/services/narrative.js';

// ---------------------------------------------------------------- tiny runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error('use testAsync for async tests');
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message.split('\n').join('\n        ')}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message.split('\n').join('\n        ')}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

// ------------------------------------------------------------------- fixtures
const NOW = new Date('2026-01-05T00:00:00.000Z');
const index = buildNodeIndex(allNodes);

const build = (roleKey, profile = {}) => {
  const role = allRoles.find((r) => r.key === roleKey);
  assert.ok(role, `fixture error: no role "${roleKey}"`);
  return generateRoadmap({ role, nodes: index, profile, now: NOW });
};

const beginner = build('fullstack-developer', { hoursPerWeek: 10 });
const experienced = build('fullstack-developer', {
  knownNodeKeys: ['react', 'nodejs-express', 'mongodb', 'sql'],
  hoursPerWeek: 20,
});
const nurse = build('staff-nurse', { hoursPerWeek: 10 });
const rushed = build('frontend-developer', {
  hoursPerWeek: 5,
  targetDate: new Date('2026-04-01T00:00:00.000Z'),
});

// =====================================================================
section('The rule-based writer produces something worth reading');

test('it writes real prose, not a stub', () => {
  const summary = writeSummary(beginner);
  assert.ok(summary.length > 200, `summary is only ${summary.length} chars`);
  assert.ok(!/undefined|null|NaN|\[object/.test(summary), `summary leaked a value: ${summary}`);
  assert.ok(!/^\s*[-*•]/m.test(summary), 'summary should be prose, not a list');
});

test('it names the role and the weekly commitment', () => {
  const summary = writeSummary(beginner);
  assert.ok(summary.includes(beginner.roleTitle), 'the role should be named');
  assert.ok(
    summary.includes(String(beginner.input.hoursPerWeek)),
    'the weekly hours should appear'
  );
});

test('a beginner and an experienced learner get genuinely different accounts', () => {
  const a = writeSummary(beginner);
  const b = writeSummary(experienced);

  assert.notEqual(a, b, 'the two summaries must not be identical');

  // Not just different numbers — a different opening claim.
  assert.ok(/standing start/.test(a), 'a beginner should be told this starts from scratch');
  assert.ok(
    /% of the way|most of the way/.test(b),
    'an experienced learner should be told what they already have counts'
  );
});

test('every role in the catalog produces a clean summary', () => {
  for (const role of allRoles) {
    const roadmap = build(role.key, { hoursPerWeek: 12 });
    const summary = writeSummary(roadmap);

    assert.ok(summary.length > 150, `${role.key}: summary too short (${summary.length})`);
    assert.ok(
      !/undefined|null|NaN|\[object/.test(summary),
      `${role.key}: summary leaked a value — ${summary}`
    );
    assert.ok(summary.includes(role.title), `${role.key}: role title missing from summary`);
  }
});

test('it tells the truth about fixed-length qualifications', () => {
  const summary = writeSummary(nurse);
  assert.ok(
    /fixed length of time|not negotiable/.test(summary),
    `a nursing plan must say the degree cannot be compressed — got: ${summary}`
  );
});

test('it says the opposite where effort genuinely does shorten the path', () => {
  const summary = writeSummary(build('ias-officer', { hoursPerWeek: 15 }));
  assert.ok(
    /effort you control|genuinely shortens/.test(summary),
    `a UPSC plan should say more hours help — got: ${summary}`
  );
});

test('an unreachable target date is described as unreachable, with the shortfall', () => {
  const summary = writeSummary(rushed);
  assert.ok(
    /not reachable|tight/.test(summary),
    `an impossible deadline must be named as such — got: ${summary}`
  );
});

// =====================================================================
section('Phase notes');

test('there is exactly one note per phase, and each names its week window', () => {
  const notes = writePhaseNotes(beginner);
  assert.equal(notes.length, beginner.phases.length);

  notes.forEach((note, i) => {
    const phase = beginner.phases[i];
    assert.ok(note.includes(phase.title), `note ${i} should name its phase`);
    assert.ok(note.includes(String(phase.startWeek)), `note ${i} should give its start week`);
    assert.ok(!/undefined|NaN/.test(note), `note ${i} leaked a value: ${note}`);
  });
});

test('a fixed-length phase is described as a commitment, not a workload', () => {
  const calendarPhaseIndex = nurse.phases.findIndex((p) => p.calendarBound);
  assert.ok(calendarPhaseIndex >= 0, 'fixture error: the nursing plan has no fixed-length phase');

  const note = writePhaseNotes(nurse)[calendarPhaseIndex];
  assert.ok(
    /fixed-length commitment/.test(note),
    `a degree phase should be framed as a commitment — got: ${note}`
  );
});

// =====================================================================
section('The validator rejects invented figures');

const summary = writeSummary(beginner);
const opts = { sourceText: summary };

test('a faithful rewrite is accepted', () => {
  // What a good model actually returns: same figures, warmer wording.
  const rewrite = `Becoming a ${beginner.roleTitle} from scratch means ${beginner.totals.nodeCount} steps and ${beginner.totals.hours} hours of work, grouped into ${beginner.totals.phaseCount} phases. At ${beginner.input.hoursPerWeek} hours a week you are looking at roughly ${beginner.totals.months} months. The order matters more than the pace here, so start at the beginning and let each phase earn you the next one.`;

  const check = validateNarrative(rewrite, beginner, opts);
  assert.ok(check.ok, `a faithful rewrite was rejected: ${check.reason}`);
});

test('a rewrite that recalculates the timeline is rejected', () => {
  const wrong = `Becoming a ${beginner.roleTitle} takes ${beginner.totals.nodeCount} steps and ${beginner.totals.hours} hours. At ${beginner.input.hoursPerWeek} hours a week you could realistically be job-ready in 4 months if you stay focused, which is far quicker than most people expect and well worth the effort involved here.`;

  const check = validateNarrative(wrong, beginner, opts);
  assert.equal(check.ok, false, 'an invented timeline must be rejected');
  assert.match(check.reason, /restated a figure|invented figures/);
});

test('a plausible-looking small number is still caught when it carries a unit', () => {
  /**
   * This is the case a flat allow-list cannot catch. "4" is a legitimate figure
   * somewhere in the plan — a phase index, a step count — so the only way to know
   * that "4 months" is wrong is to check the number against its unit.
   */
  const allowed = allowedNumbers(beginner);
  assert.ok(allowed.has(4), 'fixture assumption: 4 appears somewhere in the plan');

  const wrong = `${summary.slice(0, 260)} Realistically you are looking at 4 months before you are ready to apply anywhere.`;
  const check = validateNarrative(wrong, beginner, opts);

  assert.equal(check.ok, false, '"4 months" must be rejected even though 4 is an allowed number');
  assert.match(check.reason, /restated a figure/);
});

test('a wrong hours figure is caught the same way', () => {
  const wrong = `${summary.slice(0, 260)} All told it comes to about 120 hours of study, which most people find manageable.`;
  const check = validateNarrative(wrong, beginner, opts);
  assert.equal(check.ok, false, 'an invented hours total must be rejected');
});

test("the writer's own output passes its own validator, for every role", () => {
  /**
   * The two halves have to agree. If the validator rejected the rule-based text
   * it was given to rewrite, it would reject every faithful rewrite too — and the
   * AI layer would appear to be broken while quietly being over-policed.
   */
  for (const role of allRoles) {
    const roadmap = build(role.key, { hoursPerWeek: 12 });
    const check = validateNarrative(writeSummary(roadmap), roadmap);
    assert.ok(check.ok, `${role.key}: the writer's own summary was rejected — ${check.reason}`);
  }
});

test('an invented salary claim is rejected', () => {
  const wrong = `${summary} Graduates in this field typically start on around 800000 rupees a year, which makes the investment of time worthwhile for most people who follow through on it properly.`;

  const check = validateNarrative(wrong, beginner, opts);
  assert.equal(check.ok, false, 'an invented salary must be rejected');
});

test('numbers that live inside a step name are allowed through', () => {
  /**
   * "Frontend Portfolio (3 deployed projects)" contains a digit that is not a
   * plan figure. A rewrite quoting it faithfully must not be punished — which is
   * why the source text feeds the allow-list.
   */
  const withStepName = `${summary} The final piece is the Frontend Portfolio (3 deployed projects), which is what turns all of this into something an employer can look at and assess for themselves.`;

  const check = validateNarrative(withStepName, beginner, {
    sourceText: `${summary} Frontend Portfolio (3 deployed projects)`,
  });
  assert.ok(check.ok, `a quoted step name was rejected: ${check.reason}`);
});

test('a bulleted list is rejected', () => {
  const listy = `Here is your plan for the coming months, laid out clearly so you know what to expect:\n- Learn the basics thoroughly\n- Build some projects\n- Apply for roles once the portfolio is ready and you feel confident about it`;
  const check = validateNarrative(listy, beginner, opts);
  assert.equal(check.ok, false);
  assert.match(check.reason, /list/);
});

test('a refusal or meta-commentary is rejected', () => {
  const meta = `As an AI language model, I cannot provide personalised career advice, but I can tell you that this plan looks reasonable and that you should consult a professional advisor before making any significant decisions about your future.`;
  const check = validateNarrative(meta, beginner, opts);
  assert.equal(check.ok, false);
  assert.match(check.reason, /meta-commentary/);
});

test('text that is too short or too long is rejected', () => {
  assert.equal(validateNarrative('Good luck!', beginner, opts).ok, false, 'too short');
  assert.equal(validateNarrative('word '.repeat(500), beginner, opts).ok, false, 'too long');
});

test('non-string input is rejected rather than crashing', () => {
  for (const value of [null, undefined, 42, {}, []]) {
    const check = validateNarrative(value, beginner, opts);
    assert.equal(check.ok, false, `${JSON.stringify(value)} should be rejected`);
  }
});

test('the allow-list contains the plan figures and nothing wild', () => {
  const allowed = allowedNumbers(beginner);

  assert.ok(allowed.has(beginner.totals.hours), 'total hours must be allowed');
  assert.ok(allowed.has(beginner.totals.weeks), 'total weeks must be allowed');
  assert.ok(allowed.has(beginner.input.hoursPerWeek), 'weekly hours must be allowed');
  assert.ok(allowed.has(new Date(beginner.schedule.projectedFinishDate).getFullYear()), 'finish year');
  assert.ok(!allowed.has(999999), 'an arbitrary figure must not be allowed');
  assert.ok(!allowed.has(null) && !allowed.has(undefined), 'no empty entries');
});

// =====================================================================
section('buildNarrative always resolves');

await testAsync('with AI switched off it returns the rule-based text', async () => {
  const narrative = await buildNarrative(beginner, { useAI: false });

  assert.equal(narrative.source, 'rule-based');
  assert.equal(narrative.summary, writeSummary(beginner));
  assert.equal(narrative.phaseNotes.length, beginner.phases.length);
});

await testAsync('with no API key it still returns a usable narrative', async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const narrative = await buildNarrative(beginner);
    assert.equal(narrative.source, 'rule-based', 'no key means no AI');
    assert.ok(narrative.summary.length > 200);
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});

await testAsync('a blank or whitespace-only API key counts as switched off', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '   ';

  try {
    const narrative = await buildNarrative(beginner);
    assert.equal(narrative.source, 'rule-based');
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

await testAsync('a broken API key falls back instead of failing the request', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'obviously-not-a-real-key';

  try {
    // Whatever happens — rejected auth, no network, a thrown import — the caller
    // must still get a narrative back.
    const narrative = await buildNarrative(nurse);
    assert.ok(narrative.summary.length > 200, 'a summary must come back regardless');
    assert.ok(['ai', 'rule-based'].includes(narrative.source));
    assert.equal(narrative.phaseNotes.length, nurse.phases.length);
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

await testAsync('phase notes stay rule-based even when the summary is not', async () => {
  const narrative = await buildNarrative(beginner, { useAI: false });
  assert.deepEqual(narrative.phaseNotes, writePhaseNotes(beginner));
});

// =====================================================================
section('Worked example');

const shown = await buildNarrative(nurse, { useAI: false });
console.log(`
  ${nurse.roleTitle} — ${nurse.input.hoursPerWeek} h/week  (source: ${shown.source})

  ${shown.summary.replace(/(.{74}\s)/g, '$1\n  ')}

  Phase notes:
${shown.phaseNotes.map((n) => `    • ${n.replace(/(.{70}\s)/g, '$1\n      ')}`).join('\n')}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
