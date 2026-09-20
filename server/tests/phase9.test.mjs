/**
 * Test suite for Proof Gap & Next Best Action (EduPath 2.0 - Phase 9)
 *
 * Deterministic unit tests.
 */

import assert from 'node:assert/strict';
import {
  analyzeProofGap,
  computeNextBestAction,
} from '../src/services/skillGapAgent.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Proof Gap Analysis & Neutral Language
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Proof Gap Analysis Logic');

test('identifies unassessed proficiency when project and certificate evidence exist', () => {
  const result = analyzeProofGap({
    skillId: 'python',
    skillName: 'Python',
    status: 'DEVELOPING',
    evidence: [
      { sourceType: 'PROJECT', verificationStatus: 'USER_CONFIRMED' },
      { sourceType: 'CERTIFICATE', verificationStatus: 'VERIFIED' },
    ],
    isKnown: true,
  });

  assert.equal(result.proofGap, 'Current proficiency has not been assessed.');
  assert.equal(result.recommendedAction, 'Take Python assessment.');
  assert.equal(result.actionType, 'assessment');
  assert.equal(result.evidenceChecklist.project, true);
  assert.equal(result.evidenceChecklist.certificate, true);
  assert.equal(result.evidenceChecklist.assessment, false);
});

test('identifies missing practical project application when only assessment exists', () => {
  const result = analyzeProofGap({
    skillId: 'react',
    skillName: 'React',
    status: 'DEVELOPING',
    evidence: [
      { sourceType: 'ASSESSMENT', verificationStatus: 'VERIFIED' },
    ],
    isKnown: false,
  });

  assert.equal(result.proofGap, 'Practical application not yet demonstrated in project work or credentials.');
  assert.equal(result.recommendedAction, 'Build a portfolio project using React.');
  assert.equal(result.actionType, 'project');
});

test('identifies verified status when multi-source evidence is complete', () => {
  const result = analyzeProofGap({
    skillId: 'javascript',
    skillName: 'JavaScript',
    status: 'STRONG',
    evidence: [
      { sourceType: 'PROJECT', verificationStatus: 'VERIFIED' },
      { sourceType: 'CERTIFICATE', verificationStatus: 'VERIFIED' },
      { sourceType: 'ASSESSMENT', verificationStatus: 'VERIFIED' },
    ],
    isKnown: true,
  });

  assert.ok(result.proofGap.includes('Multi-source proof demonstrated'));
  assert.equal(result.actionType, 'verified');
});

test('identifies missing external proof for unevidenced gap', () => {
  const result = analyzeProofGap({
    skillId: 'docker',
    skillName: 'Docker',
    status: 'GAP',
    evidence: [],
    isKnown: false,
  });

  assert.equal(result.proofGap, 'No external evidence or assessment on record.');
  assert.equal(result.recommendedAction, 'Start introductory learning modules for Docker.');
  assert.equal(result.actionType, 'learning');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deterministic Next Best Action Computation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. Next Best Action Deterministic Decision Logic');

test('prioritizes assessment when learner has project/cert evidence without assessment', () => {
  const gapItems = [
    {
      skillId: 'python',
      skillName: 'Python',
      priority: 'HIGH',
      status: 'DEVELOPING',
      evidenceChecklist: { project: true, certificate: true, assessment: false },
    },
    {
      skillId: 'docker',
      skillName: 'Docker',
      priority: 'MEDIUM',
      status: 'GAP',
      unmetPrerequisites: [],
      estimatedHours: 2,
    },
  ];

  const nba = computeNextBestAction({
    roleTitle: 'Machine Learning Engineer',
    gapItems,
    assessmentAttempts: [],
    availableMinutes: 30,
  });

  assert.equal(nba.title, 'Take Python Assessment');
  assert.equal(nba.actionType, 'assessment');
  assert.equal(nba.reason, 'You have project and certificate evidence but no recent assessment.');
  assert.equal(nba.cta, 'Start Assessment');
});

test('prioritizes practice remediation when recent assessment score is weak', () => {
  const gapItems = [
    {
      skillId: 'python',
      skillName: 'Python',
      priority: 'HIGH',
      status: 'WEAK',
      evidenceChecklist: { project: true, certificate: false, assessment: true },
    },
  ];

  const assessmentAttempts = [
    {
      skillId: 'python',
      skillTitle: 'Python Functions',
      score: 55,
      weakTopics: ['Recursion', 'Decorators'],
    },
  ];

  const nba = computeNextBestAction({
    roleTitle: 'Backend Developer',
    gapItems,
    assessmentAttempts,
    availableMinutes: 30,
  });

  assert.equal(nba.title, 'Practice Python');
  assert.equal(nba.actionType, 'practice');
  assert.ok(nba.reason.includes('Recursion, Decorators'));
  assert.equal(nba.cta, 'Start Practice');
});

test('prioritizes foundational learning task when skill is missing with no blockers', () => {
  const gapItems = [
    {
      skillId: 'computer-fundamentals',
      skillName: 'Computer Fundamentals',
      priority: 'CRITICAL',
      status: 'GAP',
      unmetPrerequisites: [],
      estimatedHours: 1,
      evidenceChecklist: { project: false, certificate: false, assessment: false },
    },
    {
      skillId: 'react',
      skillName: 'React',
      priority: 'MEDIUM',
      status: 'GAP',
      unmetPrerequisites: ['computer-fundamentals'],
      estimatedHours: 2,
      evidenceChecklist: { project: false, certificate: false, assessment: false },
    },
  ];

  const nba = computeNextBestAction({
    roleTitle: 'Frontend Developer',
    gapItems,
    assessmentAttempts: [],
    availableMinutes: 60,
  });

  assert.equal(nba.title, 'Learn Computer Fundamentals');
  assert.equal(nba.actionType, 'learning');
  assert.equal(nba.cta, 'Start Learning');
  assert.ok(nba.reason.includes('High-priority foundation'));
});

test('updates next action after previous priority is completed or verified', () => {
  // Step 1: Python was unassessed
  const beforeGapItems = [
    {
      skillId: 'python',
      skillName: 'Python',
      priority: 'HIGH',
      status: 'DEVELOPING',
      evidenceChecklist: { project: true, certificate: true, assessment: false },
    },
    {
      skillId: 'fastapi',
      skillName: 'FastAPI',
      priority: 'MEDIUM',
      status: 'GAP',
      unmetPrerequisites: [],
      estimatedHours: 1,
      evidenceChecklist: { project: false, certificate: false, assessment: false },
    },
  ];

  const nbaBefore = computeNextBestAction({
    roleTitle: 'API Developer',
    gapItems: beforeGapItems,
    assessmentAttempts: [],
  });
  assert.equal(nbaBefore.title, 'Take Python Assessment');

  // Step 2: Python assessment taken & verified => NBA shifts to FastAPI learning
  const afterGapItems = [
    {
      skillId: 'python',
      skillName: 'Python',
      priority: 'LOW',
      status: 'STRONG',
      evidenceChecklist: { project: true, certificate: true, assessment: true },
    },
    {
      skillId: 'fastapi',
      skillName: 'FastAPI',
      priority: 'MEDIUM',
      status: 'GAP',
      unmetPrerequisites: [],
      estimatedHours: 1,
      evidenceChecklist: { project: false, certificate: false, assessment: false },
    },
  ];

  const nbaAfter = computeNextBestAction({
    roleTitle: 'API Developer',
    gapItems: afterGapItems,
    assessmentAttempts: [{ skillId: 'python', score: 90, weakTopics: [] }],
  });
  assert.equal(nbaAfter.title, 'Learn FastAPI');
  assert.equal(nbaAfter.actionType, 'learning');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
