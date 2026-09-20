/**
 * Test suite for Weekly Planner + Natural Language AI Learning Agent (EduPath 2.0 - Phase 5)
 *
 * Pure unit tests & logic validation — tests time constraint filtering, missed task handling,
 * and grounded natural language query processing.
 */

import assert from 'node:assert/strict';

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
// 1. Time Constraint Filtering Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Time Constraint Task Filtering');

function filterTasksByTime(tasks, availableHours) {
  if (!availableHours || availableHours <= 0) return tasks;
  const PRIO_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...tasks].sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);

  let accumulated = 0;
  const result = [];
  for (const t of sorted) {
    if (accumulated + t.estimatedDuration <= availableHours + 0.1) {
      result.push(t);
      accumulated += t.estimatedDuration;
    }
  }
  return result;
}

const SAMPLE_TASKS = [
  { taskId: 't1', skillTitle: 'JavaScript Review', estimatedDuration: 1, priority: 'LOW' },
  { taskId: 't2', skillTitle: 'ML Fundamentals', estimatedDuration: 0.5, priority: 'CRITICAL' },
  { taskId: 't3', skillTitle: 'PyTorch Tensors', estimatedDuration: 0.5, priority: 'HIGH' },
  { taskId: 't4', skillTitle: 'Deep Learning Capstone', estimatedDuration: 3, priority: 'MEDIUM' },
];

test('filterTasksByTime selects highest priority fitting within 1 hour', () => {
  const filtered = filterTasksByTime(SAMPLE_TASKS, 1);
  assert.equal(filtered.length, 2);
  const titles = filtered.map((t) => t.skillTitle);
  assert.ok(titles.includes('ML Fundamentals'));
  assert.ok(titles.includes('PyTorch Tensors'));
});

test('filterTasksByTime returns empty when time constraint < shortest task', () => {
  const filtered = filterTasksByTime(SAMPLE_TASKS, 0.2);
  assert.equal(filtered.length, 0);
});

test('filterTasksByTime keeps all tasks when available hours cover total', () => {
  const filtered = filterTasksByTime(SAMPLE_TASKS, 10);
  assert.equal(filtered.length, SAMPLE_TASKS.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Missed Task Feedback & Adaptation Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. Missed Task Feedback & Schedule Adaptation');

function adaptScheduleOnMissed(task, reason, availableDays) {
  if (reason === 'Already know') {
    return { status: 'completed', action: 'marked_completed' };
  }
  if (reason === 'No time') {
    const nextAvailable = availableDays.find((d) => d.dayName !== task.dayName && d.hoursAllocated > 0);
    return {
      status: 'missed',
      rescheduledTo: nextAvailable ? nextAvailable.dayName : 'Sunday',
      action: 'rescheduled',
    };
  }
  return { status: 'missed', action: 'logged' };
}

test('missed task with "Already know" converts to completed', () => {
  const res = adaptScheduleOnMissed({ dayName: 'Monday' }, 'Already know', []);
  assert.equal(res.status, 'completed');
  assert.equal(res.action, 'marked_completed');
});

test('missed task with "No time" reschedules to next available day', () => {
  const days = [
    { dayName: 'Monday', hoursAllocated: 2 },
    { dayName: 'Tuesday', hoursAllocated: 2 },
  ];
  const res = adaptScheduleOnMissed({ dayName: 'Monday' }, 'No time', days);
  assert.equal(res.status, 'missed');
  assert.equal(res.rescheduledTo, 'Tuesday');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Grounded Agent Intent & Action Matching
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. Grounded Agent Intent & Action Matching');

import { classifyIntent, processAgentChat } from '../src/services/naturalLanguageAgent.js';

test('recognizes "What should I learn today?" intent (DAILY_PLAN)', () => {
  const parsed = classifyIntent('What should I learn today?');
  assert.equal(parsed.type, 'DAILY_PLAN');
});

test('recognizes "What skills am I missing?" intent (SKILL_GAP)', () => {
  const parsed = classifyIntent('What skills am I missing?');
  assert.equal(parsed.type, 'SKILL_GAP');
});

test('recognizes "I only have 1 hour today." intent (TIME_CONSTRAINED_PLAN)', () => {
  const parsed = classifyIntent('I only have 1 hour today.');
  assert.equal(parsed.type, 'TIME_CONSTRAINED_PLAN');
});

test('recognizes "what are the topics to be covered for python basics" (TOPIC_LIST)', () => {
  const parsed = classifyIntent('what are the topics to be covered for python basics');
  assert.equal(parsed.type, 'TOPIC_LIST');
});

test('recognizes "Explain Python functions." (CONCEPT_EXPLANATION)', () => {
  const parsed = classifyIntent('Explain Python functions.');
  assert.equal(parsed.type, 'CONCEPT_EXPLANATION');
});

test('recognizes "What are JavaScript fundamentals?" (TOPIC_LIST)', () => {
  const parsed = classifyIntent('What are JavaScript fundamentals?');
  assert.equal(parsed.type, 'TOPIC_LIST');
});

test('recognizes "Why should I learn Python if my target is Mobile App Developer?" (CAREER_QUESTION)', () => {
  const parsed = classifyIntent('Why should I learn Python if my target is Mobile App Developer?');
  assert.equal(parsed.type, 'CAREER_QUESTION');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
