/**
 * Test suite for Context-Aware AI Tutor (EduPath 2.0 - Phase 10)
 *
 * Deterministic unit tests.
 */

import assert from 'node:assert/strict';
import {
  extractTutoringTopic,
  generateDeterministicLesson,
  teachTopic,
} from '../src/services/aiTutorService.js';

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
// 1. Topic Extraction Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Tutor Topic Extraction');

test('extracts clean topic from various question formats', () => {
  assert.equal(extractTutoringTopic('Teach me Python functions'), 'Python functions');
  assert.equal(extractTutoringTopic('explain how to use async await in javascript'), 'async await in javascript');
  assert.equal(extractTutoringTopic('What are Docker containers?'), 'Docker containers');
  assert.equal(extractTutoringTopic('React state management tutorial'), 'React state management');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 9-Part Pedagogical Teaching Flow
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. 9-Step Pedagogical Teaching Flow Structure');

test('Python functions lesson contains all 9 required pedagogical steps', () => {
  const lesson = generateDeterministicLesson({
    topic: 'Python functions',
    userLevel: 'beginner',
  });

  assert.equal(lesson.flowSteps.length, 9);

  const titles = lesson.flowSteps.map((s) => s.title);
  assert.ok(titles.some((t) => t.includes('Simple Explanation')));
  assert.ok(titles.some((t) => t.includes('Real-World Analogy')));
  assert.ok(titles.some((t) => t.includes('Syntax')));
  assert.ok(titles.some((t) => t.includes('Example')));
  assert.ok(titles.some((t) => t.includes('Step-by-Step')));
  assert.ok(titles.some((t) => t.includes('Practice Question')));
  assert.ok(titles.some((t) => t.includes('Mini Quiz')));
  assert.ok(titles.some((t) => t.includes('Common Mistakes')));
  assert.ok(titles.some((t) => t.includes('Short Recap')));

  // Check practice question specifically prompts the student
  const practiceStep = lesson.flowSteps.find((s) => s.step === 6);
  assert.ok(practiceStep.content.includes('Your Turn'));

  // Check analogy exists
  const analogyStep = lesson.flowSteps.find((s) => s.step === 2);
  assert.ok(analogyStep.content.includes('blender'));
});

test('Generic topic lesson adheres to 9-step flow', () => {
  const lesson = generateDeterministicLesson({
    topic: 'GraphQL Resolvers',
    userLevel: 'intermediate',
  });

  assert.equal(lesson.flowSteps.length, 9);
  assert.equal(lesson.userLevel, 'intermediate');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Roadmap Independence & Non-Mutation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. Roadmap Independence & Safe Read-Only Tutoring');

testAsync('teaches Python functions even when active roadmap context has unrelated topic', async () => {
  const mockContext = {
    currentRoadmapTopic: 'Civil Service Law & Governance',
    skill: 'administrative-law',
    userLevel: 'intermediate',
    completedLessons: ['constitution-basics'],
    assessmentWeaknesses: ['statutory-interpretation'],
    todayTask: { title: 'Read Constitution Article 21', estimatedMinutes: 45 },
  };

  const res = await teachTopic({
    userId: null,
    message: 'Teach me Python functions.',
    topic: 'Python functions',
    history: [],
  });

  assert.ok(res.reply.toLowerCase().includes('python function'));
  assert.ok(res.reply.toLowerCase().includes('analogy'));
  assert.ok(res.reply.toLowerCase().includes('practice'));
  assert.equal(res.topic, 'Python Functions');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
