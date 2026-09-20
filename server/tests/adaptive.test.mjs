/**
 * Test suite for Adaptive Roadmap + Struggle Detection (EduPath 2.0 - Phase 4)
 *
 * Pure unit tests — no MongoDB, no Gemini API, no network.
 * Tests: detectStruggle, classifyAcceleration, buildRemediationSteps, computeAdaptiveDecision
 */

import assert from 'node:assert/strict';
import {
  detectStruggle,
  classifyAcceleration,
  buildRemediationSteps,
  buildAccelerationStep,
  computeAdaptiveDecision,
} from '../src/services/adaptiveAgent.js';

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
// Scenario A: High score => accelerate
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario A: High Score Acceleration');

test('score 85%+ on first attempt triggers acceleration', () => {
  const result = classifyAcceleration(88, []);
  assert.equal(result, true);
});

test('computeAdaptiveDecision produces ACCELERATE for high score', () => {
  const decision = computeAdaptiveDecision({
    skillId: 'python',
    skillTitle: 'Python Programming',
    attempts: [{ score: 90, weakTopics: [] }],
    hasPassportEvidence: false,
    insertAfterKey: 'python',
  });

  assert.equal(decision.decisionType, 'ACCELERATE');
  assert.equal(decision.proposedSteps.length, 1);
  assert.ok(decision.reason.includes('Python Programming'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario B: Low score => remediation / resource
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario B: Low Score Remediation');

test('single score < 60% produces RECOMMEND_RESOURCE decision', () => {
  const decision = computeAdaptiveDecision({
    skillId: 'pytorch',
    skillTitle: 'PyTorch Deep Learning',
    attempts: [{ score: 45, weakTopics: ['Tensor operations'] }],
    hasPassportEvidence: false,
    insertAfterKey: 'pytorch',
  });

  assert.equal(decision.decisionType, 'RECOMMEND_RESOURCE');
  assert.equal(decision.proposedSteps.length, 1);
  assert.ok(decision.proposedSteps[0].reason.includes('Tensor operations'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C: Repeated low scores => persistent struggle
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario C: Persistent Struggle Detection');

test('detectStruggle identifies persistent struggle for multiple low scores', () => {
  const struggle = detectStruggle([
    { score: 45, weakTopics: ['Tensors'] },
    { score: 48, weakTopics: ['Tensors'] },
  ]);

  assert.ok(struggle);
  assert.equal(struggle.type, 'persistent-struggle');
  assert.equal(struggle.severity, 'moderate');
});

test('detectStruggle flags severe struggle after 3+ low scores', () => {
  const struggle = detectStruggle([
    { score: 45 },
    { score: 48 },
    { score: 43 },
  ]);

  assert.ok(struggle);
  assert.equal(struggle.type, 'persistent-struggle');
  assert.equal(struggle.severity, 'severe');
});

test('persistent struggle produces 3-step remediation scaffold (ADD_STEP)', () => {
  const struggle = detectStruggle([{ score: 45 }, { score: 48 }]);
  const decision = computeAdaptiveDecision({
    skillId: 'pytorch',
    skillTitle: 'PyTorch',
    attempts: [
      { score: 45, weakTopics: ['Tensor operations'] },
      { score: 48, weakTopics: ['Tensor operations'] },
    ],
    struggleResult: struggle,
    insertAfterKey: 'pytorch',
  });

  assert.equal(decision.decisionType, 'ADD_STEP');
  assert.equal(decision.proposedSteps.length, 3);
  const types = decision.proposedSteps.map((s) => s.type);
  assert.deepEqual(types, ['concept', 'practice', 'reassessment']);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario D: Already knows topic => verify and skip suggestion
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario D: Verified Passport Evidence => Skip Suggestion');

test('VERIFIED Passport evidence with no attempt produces SKIP_SUGGESTION', () => {
  const decision = computeAdaptiveDecision({
    skillId: 'html-css',
    skillTitle: 'HTML & CSS',
    attempts: [],
    hasPassportEvidence: true,
    passportVerificationStatus: 'VERIFIED',
    insertAfterKey: 'html-css',
  });

  assert.equal(decision.decisionType, 'SKIP_SUGGESTION');
  assert.ok(decision.reason.includes('HTML & CSS'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario E: Regression detection
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario E: Regression Detection');

test('detectStruggle flags regression if previous best >= 80 and latest < 60', () => {
  const struggle = detectStruggle([
    { score: 85, weakTopics: [] },
    { score: 50, weakTopics: ['Pointers'] },
  ]);

  assert.ok(struggle);
  assert.equal(struggle.type, 'regression');
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario F: Remediation scaffold shape validation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nScenario F: Remediation Scaffold Helper');

test('buildRemediationSteps constructs correct 3-step sequence', () => {
  const steps = buildRemediationSteps('ml-basics', 'ML Basics', ['Gradient Descent'], 'ml-basics');
  assert.equal(steps.length, 3);
  assert.equal(steps[0].type, 'concept');
  assert.equal(steps[1].type, 'practice');
  assert.equal(steps[2].type, 'reassessment');
  assert.equal(steps[0].insertAfterKey, 'ml-basics');
  assert.equal(steps[1].insertAfterKey, steps[0].nodeKey);
  assert.equal(steps[2].insertAfterKey, steps[1].nodeKey);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
