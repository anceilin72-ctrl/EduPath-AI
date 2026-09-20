/**
 * Progress / dashboard test suite — run with `npm run test:progress`.
 *
 * Dependency-free like the engine suite: `progressService.js` imports nothing, so
 * the dashboard maths can be verified without a database, without Express and
 * without installing a test framework.
 *
 * WHAT THIS IS GUARDING AGAINST
 * -----------------------------
 *   1. "Next up" telling a learner to start something they cannot start yet, or
 *      — worse — going permanently empty because it waits on a prerequisite that
 *      was pruned from the plan for being already known.
 *
 *   2. The two completion percentages collapsing into the same number. If they
 *      never differ there is no point reporting both, and on a plan containing a
 *      four-year degree the step count badly flatters real progress.
 *
 *   3. Phase tallies drifting out of agreement with the plan totals, which is how
 *      a progress bar ends up showing 103%.
 */

import assert from 'node:assert/strict';
import { allNodes, allRoles } from '../src/data/index.js';
import { generateRoadmap } from '../src/engine/generate.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import { summariseProgress, progressByNodeKey, flattenNodes, studyStreak } from '../src/services/progressService.js';

// ---------------------------------------------------------------- tiny runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
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

/**
 * Stand-ins for Progress documents. The service only reads plain fields, so
 * these are enough — and building them by hand keeps the test honest about what
 * the service actually depends on.
 */
const row = (nodeKey, status, extra = {}) => ({
  nodeKey,
  status,
  hoursLogged: 0,
  startedAt: null,
  completedAt: null,
  notes: '',
  updatedAt: NOW,
  ...extra,
});

/** Mark the first `count` steps of a plan complete, in plan order. */
const completeFirst = (roadmap, count) =>
  flattenNodes(roadmap)
    .slice(0, count)
    .map((n) => row(n.nodeKey, 'completed'));

const fullstack = build('fullstack-developer', { hoursPerWeek: 10 });
const nurse = build('staff-nurse', { hoursPerWeek: 10 });

// =====================================================================
section('A fresh plan reads as untouched');

test('nothing is complete and both percentages are zero', () => {
  const s = summariseProgress(fullstack, []);
  assert.equal(s.completedNodes, 0);
  assert.equal(s.percentByNodes, 0);
  assert.equal(s.percentByHours, 0);
  assert.equal(s.remainingNodes, s.totalNodes);
  assert.equal(s.isComplete, false);
});

test('step count and total hours match the plan itself', () => {
  const s = summariseProgress(fullstack, []);
  assert.equal(s.totalNodes, fullstack.totals.nodeCount);
  assert.equal(s.totalHours, fullstack.totals.hours);
});

test('phase tallies add up to the plan totals', () => {
  const s = summariseProgress(fullstack, []);
  assert.equal(s.phases.length, fullstack.totals.phaseCount);
  assert.equal(
    s.phases.reduce((sum, p) => sum + p.total, 0),
    s.totalNodes,
    'phase step counts must sum to the plan step count'
  );
  assert.equal(
    s.phases.reduce((sum, p) => sum + p.hours, 0),
    s.totalHours,
    'phase hours must sum to the plan hours'
  );
});

// =====================================================================
section('"Next up" only ever suggests things that can actually be started');

test('every suggestion has all its in-plan prerequisites satisfied', () => {
  const s = summariseProgress(fullstack, []);
  const inPlan = new Set(flattenNodes(fullstack).map((n) => n.nodeKey));

  assert.ok(s.nextUp.length > 0, 'a fresh plan must have somewhere to begin');

  for (const item of s.nextUp) {
    const node = index.get(item.nodeKey);
    const blocking = (node.prerequisites ?? []).filter((p) => inPlan.has(p));
    assert.deepEqual(
      blocking,
      [],
      `"${item.nodeKey}" was suggested but still depends on ${blocking.join(', ')}`
    );
  }
});

test('it suggests at most three things, so the dashboard stays actionable', () => {
  const s = summariseProgress(fullstack, []);
  assert.ok(s.nextUp.length <= 3, `expected at most 3 suggestions, got ${s.nextUp.length}`);
});

test('finishing a step promotes whatever it was blocking', () => {
  const nodes = flattenNodes(fullstack);
  const inPlan = new Set(nodes.map((n) => n.nodeKey));

  // Find a step that is blocked by exactly one in-plan prerequisite.
  const blocked = nodes.find((n) => {
    const deps = (n.prerequisites ?? []).filter((p) => inPlan.has(p));
    return deps.length === 1;
  });
  assert.ok(blocked, 'fixture error: expected at least one singly-blocked step');

  const prereq = blocked.prerequisites.filter((p) => inPlan.has(p))[0];

  const before = summariseProgress(fullstack, []);
  assert.ok(
    !before.nextUp.some((i) => i.nodeKey === blocked.nodeKey),
    `"${blocked.nodeKey}" should not be suggested while "${prereq}" is outstanding`
  );

  // Complete everything ahead of it as well, so it is genuinely next in order.
  const upTo = nodes.findIndex((n) => n.nodeKey === blocked.nodeKey);
  const after = summariseProgress(fullstack, completeFirst(fullstack, upTo));

  assert.ok(
    after.nextUp.some((i) => i.nodeKey === blocked.nodeKey),
    `"${blocked.nodeKey}" should be suggested once "${prereq}" is done`
  );
});

test('prerequisites pruned for being already known do not block anything', () => {
  /**
   * This is the subtle one. Someone who already knows React gets html-css and
   * javascript pruned out of their plan — but the React step still lists them as
   * prerequisites. If a missing prerequisite counted as unsatisfied, the
   * dashboard would tell this learner they can't start anything, forever.
   */
  const experienced = build('fullstack-developer', {
    knownNodeKeys: ['react', 'nodejs-express', 'mongodb'],
    hoursPerWeek: 15,
  });

  const s = summariseProgress(experienced, []);
  assert.ok(s.totalNodes > 0, 'fixture error: the pruned plan is empty');
  assert.ok(
    s.nextUp.length > 0,
    'an experienced learner must still be shown somewhere to start'
  );
});

test('a finished plan has nothing left to suggest', () => {
  const all = flattenNodes(fullstack).map((n) => row(n.nodeKey, 'completed'));
  const s = summariseProgress(fullstack, all);

  assert.deepEqual(s.nextUp, []);
  assert.equal(s.isComplete, true);
  assert.equal(s.percentByNodes, 100);
  assert.equal(s.percentByHours, 100);
  assert.equal(s.remainingNodes, 0);
});

// =====================================================================
section('Completion counting');

test('"skipped" counts as done, so a plan can still reach 100%', () => {
  const nodes = flattenNodes(fullstack);
  const rows = nodes.map((n, i) => row(n.nodeKey, i === 0 ? 'skipped' : 'completed'));
  const s = summariseProgress(fullstack, rows);

  assert.equal(s.isComplete, true, 'a deliberately skipped step must not block completion');
  assert.equal(s.percentByNodes, 100);
});

test('"in-progress" is tracked but does not count as complete', () => {
  const first = flattenNodes(fullstack)[0].nodeKey;
  const s = summariseProgress(fullstack, [row(first, 'in-progress')]);

  assert.equal(s.inProgressNodes, 1);
  assert.equal(s.completedNodes, 0);
  assert.equal(s.percentByNodes, 0);
});

test('logged hours are reported separately from the estimate', () => {
  const first = flattenNodes(fullstack)[0];
  // Someone who took much longer than the estimate suggested.
  const s = summariseProgress(fullstack, [
    row(first.nodeKey, 'completed', { hoursLogged: first.estimatedHours * 3 }),
  ]);

  assert.equal(s.hoursCompleted, first.estimatedHours, 'estimated hours credited');
  assert.equal(s.hoursLogged, first.estimatedHours * 3, 'actual hours recorded as given');
  assert.notEqual(s.hoursCompleted, s.hoursLogged, 'the two must not be conflated');
});

test('a phase is only marked complete when every step in it is', () => {
  const s0 = summariseProgress(fullstack, []);
  const firstPhase = s0.phases[0];

  const partial = summariseProgress(fullstack, completeFirst(fullstack, firstPhase.total - 1));
  assert.equal(partial.phases[0].isComplete, false);
  assert.ok(partial.phases[0].percentComplete > 0 && partial.phases[0].percentComplete < 100);

  const done = summariseProgress(fullstack, completeFirst(fullstack, firstPhase.total));
  assert.equal(done.phases[0].isComplete, true);
  assert.equal(done.phases[0].percentComplete, 100);
});

// =====================================================================
section('The two percentages measure genuinely different things');

test('on a plan with a degree in it, steps and hours disagree sharply', () => {
  /**
   * The nursing path contains a four-year degree worth hundreds of hours next to
   * short skills worth twenty. Ticking off the small ones first moves the step
   * count a long way and the hour count barely at all — which is exactly why the
   * dashboard reports both instead of picking one.
   */
  const nodes = flattenNodes(nurse);
  const cheapest = [...nodes].sort((a, b) => a.estimatedHours - b.estimatedHours).slice(0, 3);
  const rows = cheapest.map((n) => row(n.nodeKey, 'completed'));

  const s = summariseProgress(nurse, rows);

  assert.ok(s.percentByNodes > s.percentByHours, 'step count should flatter progress here');
  assert.ok(
    s.percentByNodes - s.percentByHours >= 5,
    `expected a meaningful gap, got ${s.percentByNodes}% by steps vs ${s.percentByHours}% by hours`
  );
});

test('percentages stay within 0–100 across a full walk of the plan', () => {
  const nodes = flattenNodes(nurse);

  for (let i = 0; i <= nodes.length; i += 1) {
    const s = summariseProgress(nurse, completeFirst(nurse, i));
    assert.ok(s.percentByNodes >= 0 && s.percentByNodes <= 100, `step % out of range at ${i}`);
    assert.ok(s.percentByHours >= 0 && s.percentByHours <= 100, `hour % out of range at ${i}`);
    assert.equal(s.completedNodes + s.remainingNodes, s.totalNodes);
  }
});

// =====================================================================
section('Robustness against messy data');

test('progress rows for steps not in the plan are ignored, not counted', () => {
  // Can happen after a regenerate removes a step. The summary must not credit it.
  const clean = summariseProgress(fullstack, []);
  const noisy = summariseProgress(fullstack, [row('quantum-alchemy', 'completed')]);

  assert.equal(noisy.completedNodes, clean.completedNodes);
  assert.equal(noisy.percentByNodes, 0);
});

test('an empty plan does not divide by zero', () => {
  const s = summariseProgress({ phases: [] }, []);
  assert.equal(s.totalNodes, 0);
  assert.equal(s.percentByNodes, 0);
  assert.equal(s.percentByHours, 0);
  assert.equal(s.isComplete, false, 'an empty plan is not a finished plan');
});

test('the keyed progress map exposes no internal database fields', () => {
  const first = flattenNodes(fullstack)[0].nodeKey;
  const map = progressByNodeKey([row(first, 'in-progress', { _id: 'abc123', __v: 0 })]);

  assert.deepEqual(Object.keys(map), [first]);
  assert.deepEqual(
    Object.keys(map[first]).sort(),
    ['completedAt', 'hoursLogged', 'notes', 'startedAt', 'status', 'updatedAt'].sort()
  );
});

// =====================================================================
section('The study streak');

/**
 * The streak is the one number on the dashboard whose only job is to be motivating,
 * which makes it the easiest one to fudge. It is derived from completion timestamps
 * rather than stored, so these tests are what keep it honest: a fresh account must
 * read zero, a gap must break the run, and studying twice in one evening must not
 * count as two days.
 *
 * `now` is injected everywhere so the suite does not start failing at midnight.
 */

/** A completed row, `daysAgo` days before NOW, at the given local hour. */
const completedAt = (nodeKey, daysAgo, hour = 12) => {
  const at = new Date(NOW);
  at.setUTCDate(at.getUTCDate() - daysAgo);
  at.setUTCHours(hour, 0, 0, 0);
  return row(nodeKey, 'completed', { completedAt: at });
};

// Offset fixed at 0 so "days ago" arithmetic above lines up with the day boundaries
// the function uses. India (330) is exercised separately below.
const streakOf = (rows, offsetMinutes = 0) => studyStreak(rows, { now: NOW, offsetMinutes });

test('a fresh account reads zero rather than one', () => {
  const s = streakOf([]);
  assert.equal(s.days, 0);
  assert.equal(s.longest, 0);
  assert.equal(s.activeToday, false);
  assert.equal(s.lastActiveAt, null);
  assert.equal(s.activeDays, 0);
});

test('one step finished today is a one-day streak', () => {
  const s = streakOf([completedAt('a', 0)]);
  assert.equal(s.days, 1);
  assert.equal(s.activeToday, true);
  assert.equal(s.activeDays, 1);
});

test('consecutive days accumulate', () => {
  const s = streakOf([completedAt('a', 0), completedAt('b', 1), completedAt('c', 2)]);
  assert.equal(s.days, 3);
  assert.equal(s.longest, 3);
});

test('two steps on the same day count once', () => {
  // Otherwise an afternoon of catching up would report a week-long streak.
  const s = streakOf([completedAt('a', 0, 9), completedAt('b', 0, 14), completedAt('c', 0, 22)]);
  assert.equal(s.days, 1);
  assert.equal(s.activeDays, 1);
});

test('a missed day breaks the run', () => {
  //          today  −1   −2 (nothing)  −3
  const s = streakOf([completedAt('a', 0), completedAt('b', 1), completedAt('c', 3)]);
  assert.equal(s.days, 2, 'the gap at −2 ends the current run');
  assert.equal(s.activeDays, 3, 'but all three days still count as study days');
});

test('yesterday keeps the streak alive, because today is not over', () => {
  const s = streakOf([completedAt('a', 1), completedAt('b', 2)]);
  assert.equal(s.days, 2);
  assert.equal(s.activeToday, false, 'honest about not having studied yet today');
});

test('a streak that ended before yesterday has lapsed', () => {
  const s = streakOf([completedAt('a', 2), completedAt('b', 3), completedAt('c', 4)]);
  assert.equal(s.days, 0, 'no current streak');
  assert.equal(s.longest, 3, 'but the best run is still there to beat');
});

test('only "completed" counts — skipping a step is a decision, not study', () => {
  const skipped = row('a', 'skipped', { completedAt: NOW });
  const started = row('b', 'in-progress', { startedAt: NOW });
  const s = streakOf([skipped, started]);
  assert.equal(s.days, 0);
  assert.equal(s.activeDays, 0);
});

test('a completed row with no timestamp is ignored rather than counted as today', () => {
  // Rows written before completedAt existed, or by a direct database edit.
  const s = streakOf([row('a', 'completed')]);
  assert.equal(s.days, 0);
  assert.equal(s.lastActiveAt, null);
});

test('lastActiveAt is the most recent completion, whatever order the rows arrive in', () => {
  const s = streakOf([completedAt('a', 2), completedAt('c', 0, 20), completedAt('b', 1)]);
  assert.equal(new Date(s.lastActiveAt).toISOString(), new Date(NOW).toISOString().replace('T00:', 'T20:'));
});

test('late-night study in India still counts as that day', () => {
  /**
   * The bug this exists for: 00:30 IST is 19:00 the previous day in UTC. Counting in
   * UTC would put the session on the wrong side of a day boundary and break a real
   * streak for anyone who studies after midnight.
   */
  const halfPastMidnightIST = new Date('2026-01-05T19:00:00.000Z'); // 00:30 on the 6th, IST
  const nowIST = new Date('2026-01-06T04:00:00.000Z'); // 09:30 on the 6th, IST

  const rows = [row('a', 'completed', { completedAt: halfPastMidnightIST })];

  const india = studyStreak(rows, { now: nowIST, offsetMinutes: 330 });
  assert.equal(india.activeToday, true, 'the learner studied a few hours ago — that is today');
  assert.equal(india.days, 1);

  const utc = studyStreak(rows, { now: nowIST, offsetMinutes: 0 });
  assert.equal(utc.activeToday, false, 'and in UTC it would land on the previous day');
});

test('the streak spans plans, because study is study', () => {
  const s = streakOf([
    row('a', 'completed', { roadmapId: 'plan-1', completedAt: new Date(NOW) }),
    completedAt('b', 1),
  ]);
  assert.equal(s.days, 2, 'switching target role must not reset the streak');
});

test('a long history stays consistent: current run never exceeds the longest', () => {
  const rows = [0, 1, 2, 5, 6, 7, 8, 9, 20].map((d, i) => completedAt(`n${i}`, d));
  const s = streakOf(rows);
  assert.equal(s.days, 3);
  assert.equal(s.longest, 5);
  assert.ok(s.days <= s.longest, 'the current run is one of the runs');
  assert.equal(s.activeDays, 9);
});

// =====================================================================
section('Worked example');

const example = summariseProgress(fullstack, completeFirst(fullstack, 4));
console.log(`
  Plan:        ${fullstack.roleTitle} at ${fullstack.input.hoursPerWeek} h/week
  Steps:       ${example.completedNodes} of ${example.totalNodes} done  (${example.percentByNodes}% by steps)
  Hours:       ${example.hoursCompleted} of ${example.totalHours} done  (${example.percentByHours}% by hours)
  Phases:      ${example.phases.map((p) => `${p.percentComplete}%`).join('  ')}
  Next up:     ${example.nextUp.map((n) => n.title).join(', ') || '(nothing available)'}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
