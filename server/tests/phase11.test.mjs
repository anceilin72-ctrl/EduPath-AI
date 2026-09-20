/**
 * Test suite for AI Interview Coach (EduPath 2.0 - Phase 11)
 *
 * Deterministic unit tests.
 */

import assert from 'node:assert/strict';
import {
  classifyInterviewMode,
  generateProjectQuestions,
  generateTechnicalQuestions,
  evaluateAnswerDeterministic,
  getInterviewContext,
  generateHRQuestions
} from '../src/services/interviewCoachService.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Mode Classification Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Mode Classification');

test('classifies PROJECT mode', () => {
  assert.equal(classifyInterviewMode('ask me about my projects'), 'PROJECT');
});

test('classifies MOCK mode', () => {
  assert.equal(classifyInterviewMode('let us do a mock interview'), 'MOCK');
});

test('classifies HR mode', () => {
  assert.equal(classifyInterviewMode('can you ask behavioral questions'), 'HR');
});

test('defaults to TECHNICAL mode', () => {
  assert.equal(classifyInterviewMode('give me some questions'), 'TECHNICAL');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Project Question Generation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. Project Question Generation');

test('generates project question referencing actual project title', () => {
  const projects = [{ title: 'VishGuard', description: 'ML classification' }];
  const questions = generateProjectQuestions(projects);
  assert.ok(questions[0].includes('VishGuard'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Technical Question Generation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. Technical Question Generation');

test('generates technical questions aligned to role and skills', () => {
  const context = { targetRole: 'Backend Developer', skills: ['Python', 'SQL'] };
  const questions = generateTechnicalQuestions(context);
  assert.ok(questions.length > 0);
  assert.ok(questions.some(q => q.includes('Python') || q.includes('Backend Developer')));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Answer Evaluation Structure
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n4. Answer Evaluation Structure');

test('deterministic evaluation contains 6 structural components without artificial scoring', () => {
  const feedback = evaluateAnswerDeterministic('What is Python?', 'Python is a language.');
  assert.ok(feedback.strengths, 'Missing strengths');
  assert.ok(feedback.gaps, 'Missing gaps');
  assert.ok(feedback.accuracy, 'Missing accuracy');
  assert.ok(feedback.clarity, 'Missing clarity');
  assert.ok(feedback.improvement, 'Missing improvement');
  assert.ok(feedback.exampleAnswer, 'Missing exampleAnswer');
  
  // Verify it does NOT contain "%" or "score" strings directly in the mocked template
  assert.equal(Object.values(feedback).some(val => val.includes('%')), false, 'Feedback should not contain percentage scores');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Context Gathering
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n5. Context Gathering');

testAsync('getInterviewContext handles null user safely', async () => {
  const ctx = await getInterviewContext(null);
  assert.deepEqual(ctx.projects, []);
  assert.deepEqual(ctx.weakTopics, []);
  assert.equal(ctx.targetRole, 'Developer');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
