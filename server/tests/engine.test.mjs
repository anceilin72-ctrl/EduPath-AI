/**
 * Engine test suite — run with `npm run test:engine`.
 *
 * Dependency-free on purpose: plain ESM and node:assert, no test framework to
 * install. Run it with `node tests/engine.test.mjs`.
 *
 * WHAT THIS IS GUARDING AGAINST
 * -----------------------------
 * The failure mode that matters most here is not a crash — it is a roadmap that
 * looks plausible and is quietly wrong. Three specific ways that happens:
 *
 *   1. The "generator" stops generating. If every learner aiming at a role gets
 *      the same plan regardless of what they know or how much time they have,
 *      the project has become a lookup table with extra steps. The
 *      differentiation tests below fail loudly if that ever creeps in.
 *
 *   2. Prerequisite order breaks. A plan that puts React before JavaScript is
 *      worse than no plan. Two invariants check this on every role.
 *
 *   3. Fixed-duration reality gets divided by effort. A four-year nursing degree
 *      must not become "eight months if you study 30 hours a week".
 */

import assert from 'node:assert/strict';
import { validateCatalog, allNodes, allRoles } from '../src/data/index.js';
import { generateRoadmap } from '../src/engine/generate.js';
import { buildNodeIndex, collectRequiredNodes } from '../src/engine/graph.js';
import { analyseGap } from '../src/services/resumeService.js';

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
// A fixed clock. Without this, "projected finish date" changes every run and
// the determinism test below would be meaningless.
const NOW = new Date('2026-01-05T00:00:00.000Z');

const index = buildNodeIndex(allNodes);
const roleOf = (key) => {
  const role = allRoles.find((r) => r.key === key);
  assert.ok(role, `fixture error: no role "${key}" in the catalog`);
  return role;
};

const build = (roleKey, profile = {}) =>
  generateRoadmap({ role: roleOf(roleKey), nodes: index, profile, now: NOW });

/** Compact fingerprint of a plan's *shape*, for comparing two plans. */
const shapeOf = (roadmap) =>
  [
    roadmap.totals.hours,
    roadmap.totals.weeks,
    roadmap.totals.nodeCount,
    roadmap.totals.phaseCount,
    roadmap.readiness.percentComplete,
  ].join('|');

/** Fingerprint of *which* steps are in the plan, ignoring timing. */
const contentOf = (roadmap) =>
  roadmap.phases
    .flatMap((phase) => phase.nodes.map((n) => n.nodeKey))
    .sort()
    .join(',');

/** Flat position lookup: nodeKey -> { phase, position } */
function positionMap(roadmap) {
  const positions = new Map();
  roadmap.phases.forEach((phase, phaseIdx) => {
    phase.nodes.forEach((node, nodeIdx) => {
      positions.set(node.nodeKey, { phase: phaseIdx, position: nodeIdx });
    });
  });
  return positions;
}

// ============================================================================
section('Catalog integrity');

let catalogStats;
test('catalog validates: no dangling prerequisites, duplicates or cycles', () => {
  const result = validateCatalog();
  catalogStats = result.stats;
  assert.ok(result.stats.nodeCount > 150, 'expected a substantial catalog');
  assert.equal(result.stats.roleCount, 30, 'the brief called for ~30 roles');
});

test('every node is reachable from at least one role', () => {
  // An unreachable node is maintenance cost that can never appear in a plan.
  assert.equal(catalogStats.orphanNodeCount, 0);
});

test('all six domains carry both nodes and roles', () => {
  for (const domain of ['technology', 'business', 'creative', 'healthcare', 'government', 'education']) {
    assert.ok(catalogStats.nodesByDomain[domain] > 0, `${domain} has no nodes`);
    assert.ok(catalogStats.rolesByDomain[domain] > 0, `${domain} has no roles`);
  }
});

// ============================================================================
section('Every role generates a usable plan');

test('all 30 roles generate without throwing', () => {
  for (const role of allRoles) {
    const roadmap = build(role.key, { educationLevel: 'bachelors', hoursPerWeek: 10 });
    assert.ok(roadmap.phases.length > 0, `${role.key} produced no phases`);
    assert.ok(roadmap.totals.hours > 0, `${role.key} produced zero hours`);
    assert.ok(roadmap.totals.weeks > 0, `${role.key} produced zero weeks`);
    assert.equal(roadmap.roleKey, role.key);
  }
});

test('phase week ranges are contiguous and strictly advancing', () => {
  for (const role of allRoles) {
    const { phases } = build(role.key, { hoursPerWeek: 12 });
    let expectedStart = 1;
    for (const phase of phases) {
      assert.equal(phase.startWeek, expectedStart, `${role.key} phase ${phase.index} start`);
      assert.ok(phase.endWeek >= phase.startWeek, `${role.key} phase ${phase.index} ends before it starts`);
      assert.equal(phase.endWeek - phase.startWeek + 1, phase.weeks, `${role.key} week span mismatch`);
      expectedStart = phase.endWeek + 1;
    }
  }
});

test('no phase is empty and every phase has a title and focus', () => {
  for (const role of allRoles) {
    for (const phase of build(role.key, { hoursPerWeek: 10 }).phases) {
      assert.ok(phase.nodes.length > 0, `${role.key} phase ${phase.index} is empty`);
      assert.ok(phase.title, `${role.key} phase ${phase.index} has no title`);
      assert.ok(phase.focus, `${role.key} phase ${phase.index} has no focus line`);
    }
  }
});

// ============================================================================
section('Prerequisite ordering (the correctness invariant)');

test('within a plan, no step precedes its own prerequisites', () => {
  for (const role of allRoles) {
    const roadmap = build(role.key, { hoursPerWeek: 10 });
    const positions = positionMap(roadmap);

    for (const [nodeKey, here] of positions) {
      for (const prereq of index.get(nodeKey).prerequisites ?? []) {
        const there = positions.get(prereq);
        if (!there) continue; // pruned as already known, or not required for this role

        const ordered =
          there.phase < here.phase || (there.phase === here.phase && there.position < here.position);

        assert.ok(
          ordered,
          `${role.key}: "${prereq}" (phase ${there.phase + 1}, pos ${there.position}) ` +
            `must come before "${nodeKey}" (phase ${here.phase + 1}, pos ${here.position})`
        );
      }
    }
  }
});

test('invariant holds at every availability level, not just the default', () => {
  // Availability changes how phases are packed, so it can change ordering bugs
  // from invisible to visible. Sweep it.
  for (const hoursPerWeek of [3, 5, 10, 20, 40, 60]) {
    for (const role of allRoles) {
      const positions = positionMap(build(role.key, { hoursPerWeek }));
      for (const [nodeKey, here] of positions) {
        for (const prereq of index.get(nodeKey).prerequisites ?? []) {
          const there = positions.get(prereq);
          if (!there) continue;
          assert.ok(
            there.phase < here.phase || (there.phase === here.phase && there.position < here.position),
            `${role.key} @ ${hoursPerWeek}h/wk: "${prereq}" must precede "${nodeKey}"`
          );
        }
      }
    }
  }
});

// ============================================================================
section('Differentiation — the plan must actually respond to the learner');

test('four different learners get four materially different plans', () => {
  const learners = {
    'A: absolute beginner, 10h/wk': { hoursPerWeek: 10 },
    'B: knows React already, 10h/wk': { hoursPerWeek: 10, knownNodeKeys: ['react'] },
    'C: beginner with 30h/wk': { hoursPerWeek: 30 },
    'D: beginner, 5h/wk, tight deadline': {
      hoursPerWeek: 5,
      targetDate: '2026-09-01',
      educationLevel: 'class-10',
    },
  };

  const shapes = new Map();
  for (const [label, profile] of Object.entries(learners)) {
    shapes.set(label, shapeOf(build('fullstack-developer', profile)));
  }

  const distinct = new Set(shapes.values());
  assert.equal(
    distinct.size,
    Object.keys(learners).length,
    `plans collapsed to ${distinct.size} distinct shape(s):\n` +
      [...shapes].map(([label, shape]) => `          ${label} -> ${shape}`).join('\n')
  );
});

test('all 30 roles produce distinct step sets', () => {
  // If two roles resolved to the same steps, one of them is mis-specified.
  const seen = new Map();
  for (const role of allRoles) {
    const content = contentOf(build(role.key, { hoursPerWeek: 10, educationLevel: 'bachelors' }));
    const clash = seen.get(content);
    assert.ok(!clash, `${role.key} and ${clash} resolve to an identical step set`);
    seen.set(content, role.key);
  }
});

test('more weekly hours compresses the calendar without changing the workload', () => {
  const slow = build('fullstack-developer', { hoursPerWeek: 5 });
  const fast = build('fullstack-developer', { hoursPerWeek: 40 });

  assert.equal(slow.totals.hours, fast.totals.hours, 'the work itself should not change');
  assert.equal(slow.totals.nodeCount, fast.totals.nodeCount, 'the steps should not change');
  assert.ok(
    fast.totals.weeks < slow.totals.weeks,
    `40h/wk (${fast.totals.weeks}w) should finish sooner than 5h/wk (${slow.totals.weeks}w)`
  );
});

test('the same inputs always produce byte-identical output', () => {
  const profile = { hoursPerWeek: 12, knownNodeKeys: ['javascript', 'sql'], educationLevel: 'bachelors' };
  const first = JSON.stringify(build('data-analyst', profile));
  const second = JSON.stringify(build('data-analyst', profile));
  assert.equal(first, second);
});

// ============================================================================
section('Prior knowledge and pruning');

test('knowing React prunes React and drops the plan below the beginner plan', () => {
  const beginner = build('frontend-developer', { hoursPerWeek: 10 });
  const knowsReact = build('frontend-developer', { hoursPerWeek: 10, knownNodeKeys: ['react'] });

  assert.ok(
    knowsReact.totals.nodeCount < beginner.totals.nodeCount,
    'an experienced learner must not be handed the beginner plan'
  );
  assert.ok(knowsReact.readiness.hoursSaved > 0, 'hoursSaved should reflect the pruning');
  assert.ok(
    knowsReact.readiness.percentComplete > beginner.readiness.percentComplete,
    'readiness should rise with prior knowledge'
  );
});

test('knowing React implies knowing JavaScript, and says so', () => {
  const roadmap = build('frontend-developer', { hoursPerWeek: 10, knownNodeKeys: ['react'] });
  const skippedKeys = roadmap.skipped.map((entry) => entry.nodeKey);

  assert.ok(skippedKeys.includes('react'), 'React itself should be skipped');
  assert.ok(skippedKeys.includes('javascript'), 'JavaScript should be inferred as known');

  const js = roadmap.skipped.find((entry) => entry.nodeKey === 'javascript');
  assert.equal(js.inferred, true, 'inferred knowledge must be flagged as an assumption');
  assert.match(js.reason, /already know/i, 'the assumption must be explained to the learner');

  const react = roadmap.skipped.find((entry) => entry.nodeKey === 'react');
  assert.equal(react.inferred, false, 'an explicitly declared skill is not an inference');
});

test('pruned steps never reappear in the plan', () => {
  const roadmap = build('fullstack-developer', {
    hoursPerWeek: 10,
    knownNodeKeys: ['react', 'nodejs-express'],
  });
  const planned = new Set(roadmap.phases.flatMap((p) => p.nodes.map((n) => n.nodeKey)));
  for (const entry of roadmap.skipped) {
    assert.ok(!planned.has(entry.nodeKey), `${entry.nodeKey} was both skipped and scheduled`);
  }
});

test('a learner who already meets everything is told to stop studying', () => {
  const role = roleOf('content-writer');
  const everything = [...collectRequiredNodes(role, index, { includeOptional: false }).keys()];
  const roadmap = build('content-writer', { hoursPerWeek: 10, knownNodeKeys: everything });

  assert.equal(roadmap.readiness.remainingNodeCount, 0);
  assert.equal(roadmap.readiness.percentComplete, 100);
  assert.equal(roadmap.phases.length, 0);
  assert.ok(
    roadmap.notes.some((note) => note.level === 'success'),
    'expected a success note pointing at applications rather than more study'
  );
});

// ============================================================================
section('Self-rated skill levels');

/**
 * These guard the promise the setup wizard makes on screen. A learner ticks a skill
 * and picks beginner / intermediate / advanced, and the plan is supposed to respond
 * to that choice. Three ways it can quietly fail to:
 *
 *   - the level is accepted, stored, and then ignored by the engine;
 *   - "beginner" is read as "knows it" and the step vanishes from the plan;
 *   - the halving is applied to a degree, so a four-year course becomes two.
 */

test('rating a skill intermediate prunes it, exactly like ticking it', () => {
  const ticked = build('frontend-developer', { hoursPerWeek: 10, knownNodeKeys: ['react'] });
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'intermediate' } });

  assert.equal(contentOf(rated), contentOf(ticked), 'the two ways of saying "I know React" must agree');
  assert.equal(rated.totals.hours, ticked.totals.hours);
});

test('advanced prunes the skill and everything underneath it', () => {
  const roadmap = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { javascript: 'advanced' } });
  const skipped = new Map(roadmap.skipped.map((entry) => [entry.nodeKey, entry]));

  assert.ok(skipped.has('javascript'), 'the rated skill itself should go');
  for (const prerequisite of ['html-css', 'programming-logic', 'computer-fundamentals']) {
    assert.ok(skipped.has(prerequisite), `${prerequisite} underpins JavaScript and should be inferred`);
  }
  assert.equal(skipped.get('javascript').level, 'advanced', 'the level must be recorded on the skip');
  assert.match(skipped.get('javascript').reason, /advanced/i, 'the reason should quote the level back');
});

test('beginner keeps the step in the plan at half the hours, flagged as revision', () => {
  const plain = build('frontend-developer', { hoursPerWeek: 10 });
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });

  assert.equal(contentOf(rated), contentOf(plain), 'a beginner rating must not remove anything');

  const react = rated.phases.flatMap((p) => p.nodes).find((n) => n.nodeKey === 'react');
  assert.ok(react, 'React must still be scheduled');
  assert.equal(react.isRevision, true);
  assert.equal(react.selfRatedLevel, 'beginner');
  assert.equal(react.fullHours, 70, 'the original figure stays available for the UI');
  assert.equal(react.estimatedHours, 35, 'half of 70');

  assert.equal(rated.totals.hours, plain.totals.hours - 35, 'the saving must reach the total');
  assert.equal(rated.readiness.revisionCount, 1);
  assert.equal(rated.readiness.revisionCreditHours, 35);
});

test('a beginner rating does not prune the prerequisites', () => {
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });
  const planned = new Set(rated.phases.flatMap((p) => p.nodes.map((n) => n.nodeKey)));

  // Half-remembering React says nothing about knowing JavaScript properly.
  assert.ok(planned.has('javascript'), 'JavaScript must survive a beginner rating of React');
  assert.equal(rated.skipped.length, 0, 'nothing should be skipped on a beginner-only rating');
});

test('a beginner rating outranks the tick and the inference', () => {
  // What the wizard sends: the skill is selected *and* rated. If the tick won,
  // the rating would silently make the plan worse.
  const both = build('frontend-developer', {
    hoursPerWeek: 10,
    knownNodeKeys: ['react'],
    skillLevels: { react: 'beginner' },
  });
  const reactStep = both.phases.flatMap((p) => p.nodes).find((n) => n.nodeKey === 'react');

  assert.ok(reactStep, 'React must stay in the plan when the learner rates themselves a beginner at it');
  assert.equal(reactStep.isRevision, true);

  // And credit inferred from a neighbouring claim is undone too: state management
  // implies React, but the learner has said otherwise about React specifically.
  const inferred = build('frontend-developer', {
    hoursPerWeek: 10,
    knownNodeKeys: ['state-management'],
    skillLevels: { react: 'beginner' },
  });
  assert.ok(
    inferred.phases.flatMap((p) => p.nodes).some((n) => n.nodeKey === 'react'),
    'an explicit beginner rating is better evidence than an inference'
  );
});

test('only the rated step is halved, never its neighbours', () => {
  const plain = build('frontend-developer', { hoursPerWeek: 10 });
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });

  const hoursOf = (roadmap) =>
    new Map(roadmap.phases.flatMap((p) => p.nodes).map((n) => [n.nodeKey, n.estimatedHours]));

  const before = hoursOf(plain);
  for (const [key, hours] of hoursOf(rated)) {
    if (key === 'react') continue;
    assert.equal(hours, before.get(key), `${key} should be untouched`);
  }
});

test('a calendar-bound step rated beginner keeps its full length', () => {
  // "I've started my nursing degree" cannot halve the degree. This is the one that
  // would be most tempting to get wrong and most damaging to get wrong.
  const rated = build('staff-nurse', {
    hoursPerWeek: 20,
    educationLevel: 'class-12',
    skillLevels: { 'bsc-nursing-degree': 'beginner', 'nursing-clinical-rotations': 'beginner' },
  });

  const degreePhase = rated.phases.find((p) => p.nodes.some((n) => n.nodeKey === 'bsc-nursing-degree'));
  const degree = degreePhase.nodes[0];

  assert.equal(degreePhase.weeks, 208, 'four years is still four years');
  assert.equal(degree.estimatedHours, 3200, 'fixed-duration hours must not be halved');
  assert.equal(degree.isRevision, false);
  assert.equal(degree.fullHours, null, 'nothing was adjusted, so there is no "original" to show');
  assert.equal(rated.readiness.revisionCount, 0, 'neither fixed-duration step should be adjusted');
  assert.equal(rated.readiness.revisionCreditHours, 0);
});

test('a beginner rating on an effort step is halved even in a calendar-bound plan', () => {
  const rated = build('staff-nurse', {
    hoursPerWeek: 20,
    educationLevel: 'class-12',
    skillLevels: { 'emergency-first-aid': 'beginner' },
  });
  const step = rated.phases.flatMap((p) => p.nodes).find((n) => n.nodeKey === 'emergency-first-aid');

  assert.equal(step.isRevision, true, 'effort is still effort, degree or no degree');
  assert.equal(step.estimatedHours, 13, 'half of 25, rounded');
});

test('phase hours and totals still agree once steps are adjusted', () => {
  // The bug this catches: the packer halves a step for the phase total but the step
  // row prints its full figure, so a phase visibly does not add up.
  const rated = build('fullstack-developer', {
    hoursPerWeek: 12,
    skillLevels: { react: 'beginner', javascript: 'beginner', 'html-css': 'beginner' },
  });

  let sum = 0;
  for (const phase of rated.phases) {
    const inPhase = phase.nodes.reduce((total, n) => total + n.estimatedHours, 0);
    assert.equal(phase.hours, inPhase, `${phase.title} does not add up`);
    sum += inPhase;
  }
  assert.equal(rated.totals.hours, sum, 'the plan total must be the sum of its phases');
});

test('readiness in hours accounts for everything: met + remaining = required', () => {
  const rated = build('frontend-developer', {
    hoursPerWeek: 10,
    knownNodeKeys: ['html-css'],
    skillLevels: { react: 'beginner', typescript: 'advanced' },
  });
  const { requiredHours, metHours } = rated.readiness;

  assert.equal(metHours + rated.totals.hours, requiredHours, 'no hours may go missing');
  assert.ok(metHours > 0 && metHours < requiredHours);
});

test('levels raise readiness measured in hours', () => {
  const plain = build('frontend-developer', { hoursPerWeek: 10 });
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });

  assert.equal(plain.readiness.percentHoursComplete, 0, 'a standing start is 0%');
  assert.ok(
    rated.readiness.percentHoursComplete > 0,
    'half of React is real progress and should show as readiness'
  );
  assert.equal(
    rated.readiness.percentComplete,
    plain.readiness.percentComplete,
    'counting steps cannot see a partial step — which is why hours are what the UI shows'
  );
});

test('the learner is told, in words, that beginner steps stayed in as revision', () => {
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });
  const note = rated.notes.find((n) => /revision/i.test(n.message));

  assert.ok(note, 'a halved step is surprising enough to need explaining');
  assert.equal(note.level, 'info');
});

test('unknown keys and unrated skills are ignored rather than crashing the plan', () => {
  const plain = build('frontend-developer', { hoursPerWeek: 10 });
  const noise = build('frontend-developer', {
    hoursPerWeek: 10,
    // A stale key from an old profile, and a skill this role does not require.
    skillLevels: { 'not-a-real-skill': 'advanced', 'tally-accounting': 'beginner' },
  });

  assert.equal(shapeOf(noise), shapeOf(plain));
  assert.equal(noise.readiness.revisionCount, 0);
});

test('levels are echoed back, so the saved plan records what it was built from', () => {
  const rated = build('frontend-developer', { hoursPerWeek: 10, skillLevels: { react: 'beginner' } });
  assert.deepEqual(rated.input.skillLevels, { react: 'beginner' });
});

test('gap analysis and the engine report the same readiness', () => {
  // The skill-gap screen is shown immediately before the plan. Two different
  // percentages on two consecutive screens is the kind of thing that makes a
  // learner stop trusting the whole app, so this is checked, not assumed.
  const cases = [
    {},
    { knownNodeKeys: ['html-css'] },
    { skillLevels: { react: 'beginner' } },
    { skillLevels: { javascript: 'advanced' } },
    { knownNodeKeys: ['react'], skillLevels: { react: 'beginner', typescript: 'intermediate' } },
  ];

  for (const profile of cases) {
    const roadmap = build('frontend-developer', { hoursPerWeek: 10, ...profile });
    const gap = analyseGap({
      role: roleOf('frontend-developer'),
      index,
      knownNodeKeys: profile.knownNodeKeys ?? [],
      skillLevels: profile.skillLevels ?? {},
    });

    assert.equal(
      gap.percentReady,
      roadmap.readiness.percentHoursComplete,
      `readiness disagrees for ${JSON.stringify(profile)}`
    );
    assert.equal(gap.hoursRemaining, roadmap.totals.hours, 'remaining hours must match too');
  }
});

test('a beginner-rated step stays on the "need to learn" side of the gap screen', () => {
  const gap = analyseGap({
    role: roleOf('frontend-developer'),
    index,
    knownNodeKeys: ['react'],
    skillLevels: { react: 'beginner' },
  });

  assert.ok(!gap.have.some((e) => e.nodeKey === 'react'), 'do not tell them they know it');
  const react = gap.missing.find((e) => e.nodeKey === 'react');
  assert.ok(react, 'it belongs under "need to learn"');
  assert.equal(react.isRevision, true);
  assert.equal(react.revisionHours, 35);
});

// ============================================================================
section('Calendar-bound reality (degrees, articleships, internships)');

test('13 catalog steps are calendar-bound', () => {
  assert.equal(catalogStats.calendarBoundNodeCount, 13);
});

test('a nursing degree stays four years however hard you study', () => {
  const casual = build('staff-nurse', { hoursPerWeek: 5, educationLevel: 'class-12' });
  const intense = build('staff-nurse', { hoursPerWeek: 60, educationLevel: 'class-12' });

  const degreePhaseOf = (roadmap) =>
    roadmap.phases.find((phase) => phase.nodes.some((n) => n.nodeKey === 'bsc-nursing-degree'));

  for (const roadmap of [casual, intense]) {
    const phase = degreePhaseOf(roadmap);
    assert.ok(phase, 'the degree should be in the plan');
    assert.equal(phase.calendarBound, true, 'the degree phase must be flagged calendar-bound');
    assert.equal(phase.weeks, 208, 'four years is four years');
    assert.equal(phase.nodes.length, 1, 'a fixed-duration programme gets a phase to itself');
  }

  assert.equal(
    degreePhaseOf(casual).weeks,
    degreePhaseOf(intense).weeks,
    'study intensity must not shrink a degree'
  );
});

test('every calendar-bound step is isolated and uses its declared duration', () => {
  for (const role of allRoles) {
    for (const phase of build(role.key, { hoursPerWeek: 25, educationLevel: 'bachelors' }).phases) {
      if (!phase.calendarBound) continue;
      assert.equal(phase.nodes.length, 1, `${role.key}: calendar-bound phase must hold exactly one step`);
      assert.equal(
        phase.weeks,
        index.get(phase.nodes[0].nodeKey).fixedDurationWeeks,
        `${role.key}: ${phase.nodes[0].nodeKey} should use its declared duration`
      );
    }
  }
});

test('exams stay effort-based, so study intensity still matters', () => {
  // The opposite of the rule above: UPSC preparation is not a fixed calendar
  // programme, so more hours a week genuinely does shorten it.
  const slow = build('ias-officer', { hoursPerWeek: 10, educationLevel: 'bachelors' });
  const fast = build('ias-officer', { hoursPerWeek: 40, educationLevel: 'bachelors' });

  assert.ok(fast.totals.weeks < slow.totals.weeks, 'exam preparation should respond to effort');
  assert.ok(
    slow.phases.every((phase) => phase.calendarBound === false),
    'no UPSC step should be modelled as a fixed-duration programme'
  );
});

test('the CA path includes the fixed two-year articleship', () => {
  const roadmap = build('chartered-accountant', { hoursPerWeek: 20, educationLevel: 'class-12' });
  const articleship = roadmap.phases.find((p) => p.nodes.some((n) => n.nodeKey === 'ca-articleship'));

  assert.ok(articleship, 'articleship is mandatory and must appear');
  assert.equal(articleship.calendarBound, true);
  assert.equal(articleship.weeks, 104, 'ICAI sets this duration, not the learner');
});

// ============================================================================
section('Advisory notes — the things a schedule cannot fix');

test('a formal entry requirement the learner has not met is flagged as a blocker', () => {
  const underqualified = build('ias-officer', { hoursPerWeek: 20, educationLevel: 'class-12' });
  const blocker = underqualified.notes.find((note) => note.level === 'blocker');

  assert.ok(blocker, 'UPSC requires a degree — that must be surfaced, not silently ignored');
  assert.match(blocker.message, /bachelor/i);
});

test('a qualified learner gets no blocker', () => {
  const qualified = build('ias-officer', { hoursPerWeek: 20, educationLevel: 'bachelors' });
  assert.ok(!qualified.notes.some((note) => note.level === 'blocker'));
});

test('an impossible deadline is reported honestly with the hours it would take', () => {
  const roadmap = build('fullstack-developer', {
    hoursPerWeek: 5,
    targetDate: '2026-03-01', // ~8 weeks from the fixed clock
  });

  assert.equal(roadmap.schedule.onTrack, false);
  assert.ok(roadmap.schedule.shortfallWeeks > 0);
  assert.ok(roadmap.schedule.requiredHoursPerWeek > 5, 'should state what it would actually take');

  const warning = roadmap.notes.find((note) => note.level === 'warning');
  assert.ok(warning, 'a missed target date must produce a warning');
  assert.match(warning.message, /target date/i);
});

test('a comfortable deadline reports on-track and no warning', () => {
  const roadmap = build('content-writer', { hoursPerWeek: 20, targetDate: '2029-01-01' });
  assert.equal(roadmap.schedule.onTrack, true);
  assert.equal(roadmap.schedule.shortfallWeeks, 0);
  assert.ok(!roadmap.notes.some((note) => note.level === 'warning'));
});

test('an ambitious commitment alongside a job is acknowledged', () => {
  const roadmap = build('backend-developer', { hoursPerWeek: 35, currentStatus: 'working' });
  assert.ok(roadmap.notes.some((note) => note.level === 'info'));
});

// ============================================================================
section('Optional steps');

test('optional steps are excluded by default and included on request', () => {
  const standard = build('college-lecturer', { hoursPerWeek: 15, educationLevel: 'masters' });
  const exhaustive = build('college-lecturer', {
    hoursPerWeek: 15,
    educationLevel: 'masters',
    includeOptional: true,
  });

  const keysOf = (r) => new Set(r.phases.flatMap((p) => p.nodes.map((n) => n.nodeKey)));

  assert.ok(!keysOf(standard).has('phd-research'), 'a PhD is not needed for a first lecturer post');
  assert.ok(keysOf(exhaustive).has('phd-research'), 'the exhaustive plan should include it');
  assert.ok(
    exhaustive.totals.weeks > standard.totals.weeks,
    'adding a four-year doctorate must extend the timeline'
  );
});

// ============================================================================
section('Input validation');

test('zero or negative weekly hours is rejected rather than dividing by zero', () => {
  assert.throws(() => build('frontend-developer', { hoursPerWeek: 0 }), RangeError);
  assert.throws(() => build('frontend-developer', { hoursPerWeek: -5 }), RangeError);
});

test('a missing role or profile fails fast with a clear message', () => {
  assert.throws(() => generateRoadmap({ nodes: index, profile: {} }), /requires a role/);
  assert.throws(() => generateRoadmap({ role: roleOf('frontend-developer'), nodes: index }), /profile/);
});

test('an unknown declared skill is ignored rather than crashing the plan', () => {
  // Resume parsing will produce noise. It must not take the generator down.
  const roadmap = build('frontend-developer', {
    hoursPerWeek: 10,
    knownNodeKeys: ['react', 'quantum-alchemy', ''],
  });
  assert.ok(roadmap.phases.length > 0);
  assert.ok(roadmap.skipped.some((entry) => entry.nodeKey === 'react'));
});

// ============================================================================
// Worked example, printed for the report. Not an assertion — evidence.
section('Sample output: Full-Stack Developer, beginner, 10h/wk');

const sample = build('fullstack-developer', { hoursPerWeek: 10, educationLevel: 'bachelors' });
console.log(
  `  ${sample.totals.nodeCount} steps, ${sample.totals.hours} hours, ` +
    `${sample.totals.weeks} weeks (~${sample.totals.months} months), ${sample.totals.phaseCount} phases`
);
for (const phase of sample.phases) {
  console.log(`  ${phase.title}  [weeks ${phase.startWeek}-${phase.endWeek}, ${phase.hours}h]`);
  console.log(`      ${phase.nodes.map((n) => n.title).join(', ')}`);
}

// ============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
