/**
 * Test suite for Assessment + Mastery Engine (EduPath 2.0 - Phase 3)
 *
 * Pure unit tests — no MongoDB, no Gemini API, no HTTP.
 * Tests: evaluateAssessmentSubmission, computeMasteryStatus, findRepeatedMistakes
 */

import assert from 'node:assert/strict';
import {
  evaluateAssessmentSubmission,
  computeMasteryStatus,
  findRepeatedMistakes,
} from '../src/services/assessmentService.js';

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
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    questionId: 'q1',
    type: 'multiple-choice',
    question: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '4',
    subtopic: 'Arithmetic',
    difficulty: 'beginner',
  },
  {
    questionId: 'q2',
    type: 'multiple-choice',
    question: 'What is the capital of France?',
    options: ['Berlin', 'Paris', 'Rome', 'Madrid'],
    correctAnswer: 'Paris',
    subtopic: 'Geography',
    difficulty: 'beginner',
  },
  {
    questionId: 'q3',
    type: 'short-answer',
    question: 'Big-O complexity of hash table lookup?',
    options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
    correctAnswer: 'O(1)',
    subtopic: 'Data Structures',
    difficulty: 'intermediate',
  },
  {
    questionId: 'q4',
    type: 'scenario',
    question: 'Best way to fix N+1 query problem?',
    options: ['Eager loading', 'More indexes', 'Caching all data', 'Avoid ORM'],
    correctAnswer: 'Eager loading',
    subtopic: 'Database Optimization',
    difficulty: 'intermediate',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAssessmentSubmission
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nevaluateAssessmentSubmission');

test('all correct answers => score 100', () => {
  const answers = QUESTIONS.map((q) => ({ questionId: q.questionId, answer: q.correctAnswer }));
  const result = evaluateAssessmentSubmission(QUESTIONS, answers);
  assert.equal(result.score, 100);
  assert.equal(result.weakTopics.length, 0);
  assert.equal(result.strongTopics.length, 4);
});

test('no answers => score 0, all subtopics weak', () => {
  const result = evaluateAssessmentSubmission(QUESTIONS, []);
  assert.equal(result.score, 0);
  assert.equal(result.strongTopics.length, 0);
  assert.ok(result.weakTopics.length > 0, 'should have weak topics');
});

test('half correct => score 50', () => {
  const answers = [
    { questionId: 'q1', answer: '4' },
    { questionId: 'q2', answer: 'Berlin' },
    { questionId: 'q3', answer: 'O(1)' },
    { questionId: 'q4', answer: 'Caching all data' },
  ];
  const result = evaluateAssessmentSubmission(QUESTIONS, answers);
  assert.equal(result.score, 50);
});

test('case-insensitive answer matching', () => {
  const answers = [
    { questionId: 'q1', answer: '4' },
    { questionId: 'q2', answer: 'paris' },
    { questionId: 'q3', answer: 'O(1)' },
    { questionId: 'q4', answer: 'Eager loading' },
  ];
  const result = evaluateAssessmentSubmission(QUESTIONS, answers);
  assert.equal(result.score, 100);
});

test('detailedAnswers has one entry per question', () => {
  const answers = QUESTIONS.map((q) => ({ questionId: q.questionId, answer: q.correctAnswer }));
  const result = evaluateAssessmentSubmission(QUESTIONS, answers);
  assert.equal(result.detailedAnswers.length, QUESTIONS.length);
});

test('subtopics split into strong (>=75%) and weak (<75%)', () => {
  const answers = [
    { questionId: 'q1', answer: '4' },
    { questionId: 'q2', answer: 'Berlin' },
    { questionId: 'q3', answer: 'O(1)' },
    { questionId: 'q4', answer: 'Caching all data' },
  ];
  const result = evaluateAssessmentSubmission(QUESTIONS, answers);
  assert.ok(result.strongTopics.includes('Arithmetic'), 'Arithmetic should be strong');
  assert.ok(result.strongTopics.includes('Data Structures'), 'Data Structures should be strong');
  assert.ok(result.weakTopics.includes('Geography'), 'Geography should be weak');
  assert.ok(result.weakTopics.includes('Database Optimization'), 'Database Optimization should be weak');
});

test('empty questions => score 0 with empty arrays', () => {
  const result = evaluateAssessmentSubmission([], []);
  assert.equal(result.score, 0);
  assert.deepEqual(result.strongTopics, []);
  assert.deepEqual(result.weakTopics, []);
  assert.deepEqual(result.detailedAnswers, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// computeMasteryStatus
// ─────────────────────────────────────────────────────────────────────────────

console.log('\ncomputeMasteryStatus');

test('first attempt < 60 => Introduced', () => {
  const status = computeMasteryStatus({ latestScore: 45, previousAttempts: [], hasProjectEvidence: false });
  assert.equal(status, 'Introduced');
});

test('first attempt 60-79 => Learning', () => {
  const status = computeMasteryStatus({ latestScore: 70, previousAttempts: [], hasProjectEvidence: false });
  assert.equal(status, 'Learning');
});

test('first attempt >= 80, no project => Learning', () => {
  const status = computeMasteryStatus({ latestScore: 82, previousAttempts: [], hasProjectEvidence: false });
  assert.equal(status, 'Learning');
});

test('first attempt >= 80, has project => Developing', () => {
  const status = computeMasteryStatus({ latestScore: 82, previousAttempts: [], hasProjectEvidence: true });
  assert.equal(status, 'Developing');
});

test('prev best >= 80, latest < 60 => Needs Review', () => {
  const status = computeMasteryStatus({
    latestScore: 45,
    previousAttempts: [{ score: 85 }],
    hasProjectEvidence: false,
  });
  assert.equal(status, 'Needs Review');
});

test('latest >= 90, avg >= 85, has project => Strong', () => {
  const status = computeMasteryStatus({
    latestScore: 92,
    previousAttempts: [{ score: 88 }],
    hasProjectEvidence: true,
  });
  assert.equal(status, 'Strong');
});

test('latest >= 80, avg >= 75 => Proficient', () => {
  const status = computeMasteryStatus({
    latestScore: 83,
    previousAttempts: [{ score: 78 }],
    hasProjectEvidence: false,
  });
  assert.equal(status, 'Proficient');
});

test('latest >= 70 or avg >= 65, multiple attempts => Developing', () => {
  const status = computeMasteryStatus({
    latestScore: 72,
    previousAttempts: [{ score: 65 }],
    hasProjectEvidence: false,
  });
  assert.equal(status, 'Developing');
});

test('multiple attempts, low scores => Learning fallback', () => {
  const status = computeMasteryStatus({
    latestScore: 62,
    previousAttempts: [{ score: 60 }],
    hasProjectEvidence: false,
  });
  assert.equal(status, 'Learning');
});

// ─────────────────────────────────────────────────────────────────────────────
// findRepeatedMistakes
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nfindRepeatedMistakes');

test('topics in both current and past => returned', () => {
  const repeated = findRepeatedMistakes(
    ['Closures', 'Async'],
    [{ weakTopics: ['Closures', 'Loops'] }, { weakTopics: ['Async'] }]
  );
  assert.deepEqual(repeated.sort(), ['Async', 'Closures']);
});

test('no overlap => empty array', () => {
  const repeated = findRepeatedMistakes(
    ['Closures'],
    [{ weakTopics: ['Arrays'] }]
  );
  assert.deepEqual(repeated, []);
});

test('empty current weak => empty result', () => {
  const repeated = findRepeatedMistakes([], [{ weakTopics: ['Arrays', 'Closures'] }]);
  assert.deepEqual(repeated, []);
});

test('empty past attempts => empty result', () => {
  const repeated = findRepeatedMistakes(['Closures', 'Async'], []);
  assert.deepEqual(repeated, []);
});

test('past attempts with no weakTopics field => no crash', () => {
  const repeated = findRepeatedMistakes(['Closures'], [{}]);
  assert.deepEqual(repeated, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
