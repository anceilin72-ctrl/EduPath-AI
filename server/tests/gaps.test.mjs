/**
 * Test suite for Skill Gap Agent (EduPath 2.0 - Phase 2)
 */

import assert from 'node:assert/strict';
import {
  determineSkillStatus,
  computeSkillPriority,
  generateRecommendedAction,
  analyzeRoleSkillGaps,
} from '../src/services/skillGapAgent.js';
import { allNodes, allRoles } from '../src/data/index.js';
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

const catalogIndex = buildNodeIndex(allNodes);

console.log('\nSkill Status Categorization (STRONG / DEVELOPING / WEAK / GAP / UNVERIFIED)');
console.log('-------------------------------------------------------------------------');

test('unclaimed and unevidenced skill is GAP', () => {
  const status = determineSkillStatus({
    currentLevel: 'none',
    requiredLevel: 'intermediate',
    evidenceItems: [],
    isKnown: false,
  });
  assert.equal(status, 'GAP');
});

test('unverified resume/self match without confirmation is UNVERIFIED', () => {
  const status = determineSkillStatus({
    currentLevel: 'none',
    requiredLevel: 'intermediate',
    evidenceItems: [{ verificationStatus: 'UNVERIFIED' }],
    isKnown: false,
  });
  assert.equal(status, 'UNVERIFIED');
});

test('level meeting or exceeding target with confirmed evidence is STRONG', () => {
  const status = determineSkillStatus({
    currentLevel: 'intermediate',
    requiredLevel: 'intermediate',
    evidenceItems: [{ verificationStatus: 'USER_CONFIRMED' }],
    isKnown: true,
  });
  assert.equal(status, 'STRONG');
});

test('level one step below target is DEVELOPING', () => {
  const status = determineSkillStatus({
    currentLevel: 'beginner',
    requiredLevel: 'intermediate',
    evidenceItems: [{ verificationStatus: 'USER_CONFIRMED' }],
    isKnown: true,
  });
  assert.equal(status, 'DEVELOPING');
});

test('beginner level when advanced is required is WEAK', () => {
  const status = determineSkillStatus({
    currentLevel: 'beginner',
    requiredLevel: 'advanced',
    evidenceItems: [{ verificationStatus: 'USER_CONFIRMED' }],
    isKnown: true,
  });
  assert.equal(status, 'WEAK');
});

console.log('\nDeterministic Priority Computation');
console.log('-----------------------------------');

test('STRONG skills receive LOW priority', () => {
  const priority = computeSkillPriority({
    importance: 'core',
    status: 'STRONG',
    downstreamCount: 4,
    unmetPrereqCount: 0,
  });
  assert.equal(priority, 'LOW');
});

test('Core GAP blocking multiple downstream topics is CRITICAL priority', () => {
  const priority = computeSkillPriority({
    importance: 'core',
    status: 'GAP',
    downstreamCount: 3,
    unmetPrereqCount: 0,
  });
  assert.equal(priority, 'CRITICAL');
});

test('Recommended GAP receives MEDIUM priority', () => {
  const priority = computeSkillPriority({
    importance: 'recommended',
    status: 'GAP',
    downstreamCount: 0,
    unmetPrereqCount: 0,
  });
  assert.equal(priority, 'MEDIUM');
});

test('Optional skill receives LOW priority', () => {
  const priority = computeSkillPriority({
    importance: 'optional',
    status: 'GAP',
    downstreamCount: 0,
    unmetPrereqCount: 0,
  });
  assert.equal(priority, 'LOW');
});

console.log('\nPrerequisite Gap Detection & Recommendations');
console.log('--------------------------------------------');

test('action guides user to address prerequisite blockers first', () => {
  const action = generateRecommendedAction({
    skillName: 'React',
    status: 'GAP',
    priority: 'HIGH',
    unmetPrereqs: ['JavaScript', 'HTML & CSS'],
  });
  assert.ok(action.includes('Complete foundations first'), 'Must advise tackling prereqs');
  assert.ok(action.includes('JavaScript'), 'Must name JavaScript');
});

test('action guides user with verified status towards capstones', () => {
  const action = generateRecommendedAction({
    skillName: 'Python',
    status: 'STRONG',
    priority: 'LOW',
    unmetPrereqs: [],
  });
  assert.ok(action.includes('Skill verified'), 'Must acknowledge verified skill');
});

console.log('\nFull Gap Agent Analysis for Target Roles');
console.log('----------------------------------------');

await testAsync('analyzes standing-start beginner for Frontend Developer', async () => {
  const role = allRoles.find((r) => r.key === 'frontend-developer');
  assert.ok(role, 'Frontend Developer role should exist');

  const beginnerUser = {
    profile: {
      knownNodeKeys: [],
      skillLevels: {},
      targetRoleKey: 'frontend-developer',
    },
  };

  const analysis = await analyzeRoleSkillGaps({
    user: beginnerUser,
    role,
    catalogIndex,
  });

  assert.equal(analysis.targetRole.key, 'frontend-developer');
  assert.equal(analysis.readinessPercent, 0, 'Beginner should have 0% readiness');
  assert.ok(analysis.stats.gapCount > 0, 'Should have multiple gaps');
  assert.ok(analysis.explanation.text.length > 50, 'Must produce explanation');

  // Verify foundation skills have critical/high priority and downstream counts
  const htmlCss = analysis.skills.find((s) => s.skillId === 'html-css');
  assert.ok(htmlCss, 'HTML/CSS should be required');
  assert.ok(htmlCss.downstreamCount > 0, 'HTML/CSS should have downstream dependents');
});

await testAsync('analyzes experienced learner and reflects target role change', async () => {
  const frontendRole = allRoles.find((r) => r.key === 'frontend-developer');
  const backendRole = allRoles.find((r) => r.key === 'backend-developer');

  const experiencedUser = {
    profile: {
      knownNodeKeys: ['html-css', 'javascript', 'react', 'git-version-control'],
      skillLevels: {
        'html-css': 'advanced',
        'javascript': 'advanced',
        'react': 'intermediate',
        'git-version-control': 'intermediate',
      },
      targetRoleKey: 'frontend-developer',
    },
  };

  // Evaluate for Frontend
  const feAnalysis = await analyzeRoleSkillGaps({
    user: experiencedUser,
    role: frontendRole,
    catalogIndex,
  });

  assert.ok(feAnalysis.readinessPercent > 20, 'Should have good readiness for Frontend');
  assert.ok(feAnalysis.stats.strongCount >= 3, 'Should have several strong skills');

  // Switch target role to Backend Developer without altering user profile
  const beAnalysis = await analyzeRoleSkillGaps({
    user: experiencedUser,
    role: backendRole,
    catalogIndex,
  });

  assert.equal(beAnalysis.targetRole.key, 'backend-developer');
  // In backend role, SQL / Node / MongoDB / System Design will show up as Gaps
  const nodeSkill = beAnalysis.skills.find((s) => s.skillId === 'nodejs-express');
  assert.ok(nodeSkill, 'nodejs-express should be required for backend');
  assert.equal(nodeSkill.status, 'GAP', 'nodejs-express should be a GAP');
  assert.ok(['CRITICAL', 'HIGH'].includes(nodeSkill.priority), 'Node should be high/critical priority');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
