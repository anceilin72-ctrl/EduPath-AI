/**
 * Test suite for Skill Passport and Evidence Engine (EduPath 2.0 - Phase 1)
 */

import assert from 'node:assert/strict';
import { calculateSkillConfidence, deriveEstimatedLevel } from '../src/services/evidenceService.js';
import { extractProjectSkills } from '../src/services/evidenceService.js';
import { allNodes, allRoles } from '../src/data/index.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import { generateRoadmap } from '../src/engine/generate.js';

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

console.log('\nConfidence calculation logic');
console.log('-----------------------------');

test('empty evidence returns Low confidence', () => {
  assert.equal(calculateSkillConfidence([]), 'Low');
});

test('self-declared only returns Low confidence', () => {
  const ev = [
    { sourceType: 'SELF_DECLARED', verificationStatus: 'USER_CONFIRMED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'Low');
});

test('unverified evidence items return Low confidence', () => {
  const ev = [
    { sourceType: 'RESUME', verificationStatus: 'UNVERIFIED' },
    { sourceType: 'PROJECT', verificationStatus: 'UNVERIFIED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'Low');
});

test('confirmed resume alone returns Medium confidence', () => {
  const ev = [
    { sourceType: 'RESUME', verificationStatus: 'USER_CONFIRMED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'Medium');
});

test('confirmed project alone returns Medium confidence', () => {
  const ev = [
    { sourceType: 'PROJECT', verificationStatus: 'USER_CONFIRMED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'Medium');
});

test('resume + project confirmed returns High confidence', () => {
  const ev = [
    { sourceType: 'RESUME', verificationStatus: 'USER_CONFIRMED' },
    { sourceType: 'PROJECT', verificationStatus: 'USER_CONFIRMED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'High');
});

test('assessment evidence returns High confidence', () => {
  const ev = [
    { sourceType: 'ASSESSMENT', verificationStatus: 'VERIFIED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'High');
});

test('certificate + project confirmed returns High confidence', () => {
  const ev = [
    { sourceType: 'CERTIFICATE', verificationStatus: 'USER_CONFIRMED' },
    { sourceType: 'PROJECT', verificationStatus: 'USER_CONFIRMED' },
  ];
  assert.equal(calculateSkillConfidence(ev), 'High');
});

console.log('\nEstimated skill level derivation');
console.log('--------------------------------');

test('user rating overrides evidence level', () => {
  const ev = [{ skillLevel: 'beginner' }];
  assert.equal(deriveEstimatedLevel('python', ev, 'advanced'), 'advanced');
});

test('derives highest level from evidence when user rating is unset', () => {
  const ev = [{ skillLevel: 'beginner' }, { skillLevel: 'intermediate' }];
  assert.equal(deriveEstimatedLevel('python', ev, null), 'intermediate');
});

test('defaults to beginner when no levels specified', () => {
  assert.equal(deriveEstimatedLevel('python', [], null), 'beginner');
});

console.log('\nProject skill extraction');
console.log('------------------------');

await testAsync('extracts catalog skills from project title and description', async () => {
  const index = buildNodeIndex(allNodes);
  const project = {
    title: 'React & Node.js E-Commerce Microservice',
    description: 'Developed fullstack shopping cart using MongoDB, Express, and Docker.',
    technologies: ['React', 'Node.js', 'MongoDB'],
    catalogIndex: index,
  };

  const matches = await extractProjectSkills(project);
  assert.ok(matches.length >= 3, 'Should match multiple technology nodes');
  const matchedKeys = matches.map((m) => m.nodeKey);
  assert.ok(matchedKeys.includes('react'), 'Should match react');
  assert.ok(matchedKeys.includes('nodejs-express'), 'Should match nodejs-express');
  assert.ok(matchedKeys.includes('mongodb'), 'Should match mongodb');
});

console.log('\nRoadmap generation with evidenced skills');
console.log('----------------------------------------');

test('strongly evidenced skills prune roadmap correctly', () => {
  const index = buildNodeIndex(allNodes);
  const webRole = allRoles.find((r) => r.key === 'frontend-developer');
  assert.ok(webRole, 'Frontend developer role should exist');

  // Baseline beginner
  const baseline = generateRoadmap({
    role: webRole,
    nodes: index,
    profile: { knownNodeKeys: [], hoursPerWeek: 10 },
  });

  // Learner with evidenced skills (html-css, javascript, react)
  const evidencedPlan = generateRoadmap({
    role: webRole,
    nodes: index,
    profile: {
      knownNodeKeys: ['html-css', 'javascript', 'react'],
      skillLevels: { react: 'intermediate' },
      hoursPerWeek: 10,
    },
  });

  assert.ok(
    evidencedPlan.totals.hours < baseline.totals.hours,
    'Evidenced skills should reduce required plan hours'
  );
  assert.ok(
    evidencedPlan.totals.nodeCount < baseline.totals.nodeCount,
    'Evidenced skills should reduce total steps'
  );

  const flatNodes = (evidencedPlan.phases || []).flatMap((p) => p.nodes || []);
  const keysInPlan = flatNodes.map((n) => n.nodeKey);
  assert.ok(!keysInPlan.includes('react'), 'Intermediate/evidenced React must be pruned');
  assert.ok(!keysInPlan.includes('html-css'), 'html-css must be pruned');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
