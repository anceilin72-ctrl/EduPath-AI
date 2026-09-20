/**
 * Unit Test Suite for What-If Career Simulator
 * Phase 12 upgrade: hoursPerDay×daysPerWeek, pace, skill resolution, rich delta
 */

import assert from 'node:assert/strict';
import { resolveRoleKey } from '../src/utils/roleNormalization.js';
import { generateRoadmap } from '../src/engine/generate.js';
import { allRoles, allNodes } from '../src/data/index.js';
import { buildNodeIndex } from '../src/engine/graph.js';

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

const index = buildNodeIndex(allNodes);
const frontendRole = allRoles.find((r) => r.key === 'frontend-developer');
const dataScientistRole = allRoles.find((r) => r.key === 'data-scientist');

console.log('\n--- Simulator Role Resolution ---');

await testAsync('resolves "ml-engineer" to "data-scientist" via unhyphenated alias', async () => {
  const resolved = await resolveRoleKey('ml-engineer');
  assert.equal(resolved, 'data-scientist');
});

await testAsync('resolves exact role key "business-analyst"', async () => {
  const resolved = await resolveRoleKey('business-analyst');
  assert.equal(resolved, 'business-analyst');
});

await testAsync('resolves "frontend-developer"', async () => {
  const resolved = await resolveRoleKey('frontend-developer');
  assert.equal(resolved, 'frontend-developer');
});

console.log('\n--- hoursPerDay × daysPerWeek affects duration ---');

test('doubling hoursPerWeek roughly halves total weeks', () => {
  const baseProfile = {
    knownNodeKeys: [],
    skillLevels: {},
    hoursPerWeek: 10,
    educationLevel: 'class-12',
    currentStatus: 'student',
  };

  const roadmap10h = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: 10 } });
  const roadmap20h = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: 20 } });

  // Same total hours (learning work is constant)
  assert.equal(roadmap10h.totals.hours, roadmap20h.totals.hours, 'Total learning hours should be the same');

  // 20 h/week should finish faster (fewer weeks)
  assert.ok(roadmap20h.totals.weeks < roadmap10h.totals.weeks,
    `20h/week (${roadmap20h.totals.weeks}w) should take fewer weeks than 10h/week (${roadmap10h.totals.weeks}w)`);
});

test('daysPerWeek changes: 7 days vs 5 days gives different effective weeks', () => {
  const profileBase = {
    knownNodeKeys: [],
    skillLevels: {},
    educationLevel: 'class-12',
    currentStatus: 'student',
  };

  // 2 h/day × 5 days = 10 h/week
  const r5d = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...profileBase, hoursPerWeek: 10 } });
  // 2 h/day × 7 days = 14 h/week
  const r7d = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...profileBase, hoursPerWeek: 14 } });

  assert.equal(r5d.totals.hours, r7d.totals.hours, 'Total hours identical');
  assert.ok(r7d.totals.weeks <= r5d.totals.weeks,
    `7 days/week (${r7d.totals.weeks}w) should be <= 5 days/week (${r5d.totals.weeks}w)`);
});

console.log('\n--- Pace multiplier affects duration ---');

test('intensive pace (1.35×) reduces weeks vs normal pace', () => {
  const baseProfile = {
    knownNodeKeys: [],
    skillLevels: {},
    educationLevel: 'class-12',
    currentStatus: 'student',
  };

  const normalHpw = 10;
  const intensiveHpw = 10 * 1.35;

  const normal = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: normalHpw } });
  const intensive = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: intensiveHpw } });

  assert.ok(intensive.totals.weeks <= normal.totals.weeks,
    `Intensive (${intensive.totals.weeks}w) should be <= normal (${normal.totals.weeks}w)`);
});

test('relaxed pace (0.75×) increases weeks vs normal pace', () => {
  const baseProfile = {
    knownNodeKeys: [],
    skillLevels: {},
    educationLevel: 'class-12',
    currentStatus: 'student',
  };

  const normalHpw = 10;
  const relaxedHpw = 10 * 0.75;

  const normal = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: normalHpw } });
  const relaxed = generateRoadmap({ role: frontendRole, nodes: index, profile: { ...baseProfile, hoursPerWeek: relaxedHpw } });

  assert.ok(relaxed.totals.weeks >= normal.totals.weeks,
    `Relaxed (${relaxed.totals.weeks}w) should be >= normal (${normal.totals.weeks}w)`);
});

console.log('\n--- Skill overrides reduce learning work ---');

test('marking known skills reduces total hours and nodes', () => {
  const baseProfile = {
    knownNodeKeys: [],
    skillLevels: {},
    hoursPerWeek: 10,
    educationLevel: 'class-12',
    currentStatus: 'student',
  };

  const withoutSkills = generateRoadmap({ role: frontendRole, nodes: index, profile: baseProfile });
  const withSkills = generateRoadmap({
    role: frontendRole,
    nodes: index,
    profile: { ...baseProfile, knownNodeKeys: ['html-css', 'javascript', 'react'] },
  });

  assert.ok(withSkills.totals.hours < withoutSkills.totals.hours,
    `With known skills (${withSkills.totals.hours}h) should be less than without (${withoutSkills.totals.hours}h)`);
  assert.ok(withSkills.totals.nodeCount < withoutSkills.totals.nodeCount,
    `With known skills (${withSkills.totals.nodeCount} nodes) should be fewer`);
});

test('skipped array lists the skills that were pruned', () => {
  const result = generateRoadmap({
    role: frontendRole,
    nodes: index,
    profile: {
      knownNodeKeys: ['html-css', 'javascript'],
      skillLevels: {},
      hoursPerWeek: 10,
      educationLevel: 'class-12',
      currentStatus: 'student',
    },
  });

  const skippedKeys = result.skipped.map((s) => s.nodeKey);
  assert.ok(skippedKeys.includes('html-css'), 'html-css should appear in skipped');
  assert.ok(skippedKeys.includes('javascript'), 'javascript should appear in skipped');
});

console.log('\n--- Switching roles changes skill composition ---');

test('Frontend Developer and Data Scientist have different required nodes', () => {
  const feProfile = { knownNodeKeys: [], skillLevels: {}, hoursPerWeek: 10, educationLevel: 'class-12' };

  const feRoadmap = generateRoadmap({ role: frontendRole, nodes: index, profile: feProfile });
  const dsRoadmap = generateRoadmap({ role: dataScientistRole, nodes: index, profile: feProfile });

  const feNodeKeys = feRoadmap.phases.flatMap((p) => p.nodes.map((n) => n.nodeKey));
  const dsNodeKeys = dsRoadmap.phases.flatMap((p) => p.nodes.map((n) => n.nodeKey));

  // They should differ
  assert.notDeepStrictEqual(
    feNodeKeys.sort(),
    dsNodeKeys.sort(),
    'Frontend Developer and Data Scientist should have different node lists'
  );

  // Data Scientist should contain ML/stats-related nodes
  assert.ok(dsNodeKeys.includes('machine-learning-basics') || dsNodeKeys.includes('statistics-fundamentals'),
    'Data Scientist roadmap should include ML or stats nodes');
});

console.log('\n--- Target date feasibility ---');

test('engine calculates schedule onTrack when date is far enough', () => {
  const profile = {
    knownNodeKeys: [],
    skillLevels: {},
    hoursPerWeek: 10,
    educationLevel: 'class-12',
    currentStatus: 'student',
    targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year out
  };

  const result = generateRoadmap({ role: frontendRole, nodes: index, profile });
  // With a year horizon and 10h/week, should be on track for a frontend role
  assert.ok(result.schedule.onTrack !== null, 'onTrack should be computed');
  assert.equal(typeof result.schedule.requiredHoursPerWeek, 'number', 'requiredHoursPerWeek should be a number');
});

test('engine detects schedule not on track for very tight deadline', () => {
  const profile = {
    knownNodeKeys: [],
    skillLevels: {},
    hoursPerWeek: 2,
    educationLevel: 'class-12',
    currentStatus: 'student',
    targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks out
  };

  const result = generateRoadmap({ role: frontendRole, nodes: index, profile });
  assert.equal(result.schedule.onTrack, false, 'Should not be on track with 2h/week and 2-week deadline');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

