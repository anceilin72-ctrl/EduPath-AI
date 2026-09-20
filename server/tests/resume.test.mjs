/**
 * Resume scanning + gap analysis test suite — `npm run test:resume`.
 *
 * The extraction step is deliberately excluded: it needs a real PDF and the
 * pdf-parse dependency. Everything below it is pure, and that is the part where a
 * subtle mistake does real damage.
 *
 * WHAT THIS IS GUARDING AGAINST
 * -----------------------------
 *   1. False positives. Crediting a learner with a skill because a substring
 *      appeared somewhere ("excel" inside "excellent") prunes steps they actually
 *      need, and the resulting plan quietly under-prepares them.
 *
 *   2. False negatives on the formatting resumes actually use — "Node.js",
 *      "NODE JS", "HTML / CSS", a title split across two lines by a PDF.
 *
 *   3. Readiness measured by step count instead of hours, which would report
 *      somebody as nearly a nurse while the entire degree is still ahead of them.
 */

import assert from 'node:assert/strict';
import { allNodes, allRoles } from '../src/data/index.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import { scanForSkills, analyseGap, rankRoleFit } from '../src/services/resumeService.js';

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

const index = buildNodeIndex(allNodes);
const roleOf = (key) => {
  const role = allRoles.find((r) => r.key === key);
  assert.ok(role, `fixture error: no role "${key}"`);
  return role;
};

const keysOf = (matches) => matches.map((m) => m.nodeKey);

// A resume written the way people actually write them: inconsistent casing,
// punctuation inside product names, skills buried in prose.
const WEB_DEV_RESUME = `
  PRIYA SHARMA
  B.E. Computer Science, 2024 — Coimbatore

  SKILLS
  JavaScript, React, Node.js, Express, MongoDB, Git, HTML/CSS

  EXPERIENCE
  Web Development Intern, Vertex Labs (Jun 2024 - Dec 2024)
  Built responsive dashboards in React and shipped REST endpoints on an
  Express service backed by MongoDB. Used Git for version control throughout.

  I have excellent written communication and enjoy collaborating with designers.
`;

// =====================================================================
section('Finding what is genuinely there');

test('picks up the obvious skills from a developer resume', () => {
  const found = keysOf(scanForSkills(WEB_DEV_RESUME, index));

  for (const expected of ['javascript', 'react', 'mongodb', 'git-version-control']) {
    assert.ok(found.includes(expected), `expected to find "${expected}" — found ${found.join(', ')}`);
  }
});

test('matches names written with punctuation, spaces or odd casing', () => {
  // Every one of these is the same skill, formatted the way a different person
  // would type it.
  for (const variant of ['Node.js', 'nodejs', 'NODE JS', 'node-js']) {
    const found = keysOf(scanForSkills(`Skills: ${variant}, testing`, index));
    assert.ok(
      found.includes('nodejs-express'),
      `"${variant}" should match the Node/Express step — found ${found.join(', ') || 'nothing'}`
    );
  }
});

test('matches a title that a PDF split across two lines', () => {
  const wrapped = 'Comfortable with data structures\nand algorithms from competitive practice.';
  const found = keysOf(scanForSkills(wrapped, index));
  assert.ok(found.includes('data-structures-algorithms'), `found ${found.join(', ') || 'nothing'}`);
});

test('every match carries the text that triggered it', () => {
  const matches = scanForSkills(WEB_DEV_RESUME, index);
  assert.ok(matches.length > 0);

  for (const match of matches) {
    assert.ok(match.evidence && match.evidence.length > 0, `${match.nodeKey} has no evidence`);
    assert.ok(match.matchedTerm, `${match.nodeKey} has no matched term`);
    assert.ok(['high', 'medium', 'low'].includes(match.confidence));
  }
});

test('strongest evidence is listed first', () => {
  const rank = { high: 0, medium: 1, low: 2 };
  const matches = scanForSkills(WEB_DEV_RESUME, index);
  for (let i = 1; i < matches.length; i += 1) {
    assert.ok(
      rank[matches[i - 1].confidence] <= rank[matches[i].confidence],
      'confidence ordering broke'
    );
  }
});

// =====================================================================
section('Not finding what is not there');

test('a substring inside a longer word is not a match', () => {
  // "excellent" contains "excel"; "management" contains "manage".
  const found = keysOf(scanForSkills('I have excellent communication and management instincts.', index));
  assert.ok(
    !found.includes('excel-spreadsheets'),
    `"excellent" must not credit spreadsheet skills — found ${found.join(', ')}`
  );
});

test('a skill named only by a catalog alias is still found', () => {
  /**
   * The aliases in the catalog exist for exactly this: nobody writes "SQL &
   * Relational Databases" on a resume, they write MySQL or Postgres. Matching
   * those is intended behaviour, not a false positive.
   */
  const found = keysOf(scanForSkills('Databases: MySQL only.', index));
  assert.ok(found.includes('sql'), `found ${found.join(', ') || 'nothing'}`);
});

test('a short term buried inside an unrelated word is not a match', () => {
  // "digital" and "legitimate" both contain "git".
  const found = keysOf(scanForSkills('A legitimate digital strategy for the region.', index));
  assert.ok(
    !found.includes('git-version-control'),
    `"digital"/"legitimate" must not credit Git — found ${found.join(', ')}`
  );
});

test('a resume with no catalog skills in it returns nothing', () => {
  const found = scanForSkills(
    'Hardworking team player seeking opportunities to grow and learn. References available.',
    index
  );
  assert.deepEqual(keysOf(found), [], `unexpectedly found ${keysOf(found).join(', ')}`);
});

test('empty and non-string input is handled without throwing', () => {
  assert.deepEqual(scanForSkills('', index), []);
  assert.deepEqual(scanForSkills('   \n  ', index), []);
  assert.deepEqual(scanForSkills(null, index), []);
  assert.deepEqual(scanForSkills(undefined, index), []);
});

test('scanning the same text twice gives the identical result', () => {
  const a = JSON.stringify(scanForSkills(WEB_DEV_RESUME, index));
  const b = JSON.stringify(scanForSkills(WEB_DEV_RESUME, index));
  assert.equal(a, b, 'the scan must be deterministic');
});

// =====================================================================
section('Gap analysis');

test('a beginner is missing everything and 0% ready', () => {
  const gap = analyseGap({ role: roleOf('frontend-developer'), index, knownNodeKeys: [] });

  assert.equal(gap.metCount, 0);
  assert.equal(gap.percentReady, 0);
  assert.equal(gap.hoursCovered, 0);
  assert.equal(gap.missingCount, gap.requiredCount);
  assert.ok(gap.hoursRemaining > 0);
});

test('claiming a skill also credits its prerequisites, and says it inferred them', () => {
  const gap = analyseGap({ role: roleOf('frontend-developer'), index, knownNodeKeys: ['react'] });

  const met = new Set(gap.have.map((h) => h.nodeKey));
  assert.ok(met.has('react'), 'the claimed skill itself');
  assert.ok(met.has('javascript'), 'React implies JavaScript');
  assert.ok(met.has('html-css'), 'React implies HTML/CSS');

  const inferred = gap.have.find((h) => h.nodeKey === 'javascript');
  assert.equal(inferred.inferredFrom, 'react', 'the inference must be attributed');

  const claimed = gap.have.find((h) => h.nodeKey === 'react');
  assert.equal(claimed.inferredFrom, null, 'an explicit claim is not an inference');
});

test('readiness rises as more is known, and the two sides always add up', () => {
  const role = roleOf('fullstack-developer');

  const none = analyseGap({ role, index, knownNodeKeys: [] });
  const some = analyseGap({ role, index, knownNodeKeys: ['react'] });
  const more = analyseGap({ role, index, knownNodeKeys: ['react', 'nodejs-express', 'mongodb'] });

  assert.ok(none.percentReady < some.percentReady, 'knowing React must count for something');
  assert.ok(some.percentReady < more.percentReady, 'knowing more must count for more');

  for (const gap of [none, some, more]) {
    assert.equal(gap.metCount + gap.missingCount, gap.requiredCount, 'have + missing = required');
    assert.ok(gap.percentReady >= 0 && gap.percentReady <= 100);
  }
});

test('readiness is weighted by hours, not by ticking boxes', () => {
  /**
   * The nursing path is mostly one four-year degree. Someone who has done the
   * short preparatory steps has a good fraction of the *steps* but almost none of
   * the *work*, and the number they are shown has to reflect that.
   */
  const role = roleOf('staff-nurse');
  const gap = analyseGap({
    role,
    index,
    knownNodeKeys: ['human-biology-basics', 'emergency-first-aid', 'anatomy-physiology'],
  });

  const percentBySteps = Math.round((gap.metCount / gap.requiredCount) * 100);
  assert.ok(
    gap.percentReady < percentBySteps,
    `hours-weighted readiness (${gap.percentReady}%) should be below step-count readiness (${percentBySteps}%)`
  );
});

test('the biggest gaps are listed first', () => {
  const gap = analyseGap({ role: roleOf('chartered-accountant'), index, knownNodeKeys: [] });
  for (let i = 1; i < gap.missing.length; i += 1) {
    assert.ok(
      gap.missing[i - 1].estimatedHours >= gap.missing[i].estimatedHours,
      'missing steps must be ordered heaviest first'
    );
  }
});

// =====================================================================
section('Ranking roles by fit — "which of these am I closest to?"');

test("a web developer's resume ranks web roles above unrelated ones", () => {
  const detected = keysOf(scanForSkills(WEB_DEV_RESUME, index));
  const ranked = rankRoleFit({ roles: allRoles, index, knownNodeKeys: detected, limit: 30 });

  const positionOf = (key) => ranked.findIndex((r) => r.roleKey === key);

  assert.ok(positionOf('fullstack-developer') >= 0, 'fullstack must appear in the ranking');
  assert.ok(
    positionOf('fullstack-developer') < positionOf('staff-nurse'),
    'a web resume should rank full-stack above staff nurse'
  );
  assert.ok(
    positionOf('frontend-developer') < positionOf('chartered-accountant'),
    'a web resume should rank frontend above chartered accountant'
  );
});

test('the ranking is ordered, capped, and explains itself', () => {
  const ranked = rankRoleFit({ roles: allRoles, index, knownNodeKeys: ['react'], limit: 5 });

  assert.equal(ranked.length, 5, 'the limit must be respected');

  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].percentReady >= ranked[i].percentReady, 'ranking must descend');
  }

  for (const entry of ranked) {
    assert.ok(entry.biggestGaps.length > 0 || entry.percentReady === 100, `${entry.roleKey} explains nothing`);
    assert.ok(entry.roleTitle && entry.roleDomain);
  }
});

test('an empty skill list still produces a usable ranking rather than an error', () => {
  const ranked = rankRoleFit({ roles: allRoles, index, knownNodeKeys: [], limit: 5 });
  assert.equal(ranked.length, 5);
  for (const entry of ranked) assert.equal(entry.percentReady, 0);
});

test('nonsense skill keys are ignored instead of crashing the scan', () => {
  // Resume scanning produces noise, so this path is guaranteed to be hit.
  const ranked = rankRoleFit({
    roles: allRoles,
    index,
    knownNodeKeys: ['react', 'quantum-alchemy', ''],
    limit: 3,
  });
  assert.equal(ranked.length, 3);
});

// =====================================================================
section('Worked example');

const detected = scanForSkills(WEB_DEV_RESUME, index);
const ranked = rankRoleFit({ roles: allRoles, index, knownNodeKeys: keysOf(detected), limit: 3 });

console.log(`
  Resume scan found ${detected.length} step(s):
${detected.map((d) => `    ${d.confidence.padEnd(6)} ${d.title}  (matched "${d.matchedTerm}")`).join('\n')}

  Closest roles:
${ranked.map((r) => `    ${String(r.percentReady).padStart(3)}%  ${r.roleTitle} — ${r.hoursRemaining}h left, biggest gaps: ${r.biggestGaps.join(', ')}`).join('\n')}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
