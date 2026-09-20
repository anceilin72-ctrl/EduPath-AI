/**
 * Unit Test Suite for Weekly Learning Planner Budget Filtering & Task Selection
 *
 * Verifies:
 * 1. 0.5h -> 30 min budget calculation
 * 2. 1h -> 60 min budget calculation
 * 3. 2h -> 120 min budget calculation
 * 4. 3h -> 180 min budget calculation
 * 5. 5h -> 300 min budget calculation
 * 6. 99h -> 5940 min budget calculation
 * 7. Safe handling of missing/NaN estimatedMinutes
 * 8. Correct prioritization & fallback when no pending tasks exist
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
// Pure Budget Selection Logic Test Helper
// ─────────────────────────────────────────────────────────────────────────────
function filterTasksByTimeBudget(allPending, availableHours) {
  const hoursNum = Number(availableHours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
    return { availableMinutes: 0, totalPlannedMinutes: 0, tasks: [] };
  }

  const availableMinutes = Math.round(hoursNum * 60);
  const PRIO_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  
  const sorted = [...allPending].sort(
    (a, b) => PRIO_RANK[a.priority || 'MEDIUM'] - PRIO_RANK[b.priority || 'MEDIUM'] || (a.roadmapStep || 0) - (b.roadmapStep || 0)
  );

  let accumulated = 0;
  const selected = [];

  for (const node of sorted) {
    if (accumulated >= availableMinutes) break;
    const remainingTime = availableMinutes - accumulated;
    const estMins = Number(node.estimatedMinutes) || 30;
    const taskMinutes = Math.min(estMins, remainingTime);
    
    if (taskMinutes > 0) {
      selected.push({
        ...node,
        estimatedMinutes: Math.round(taskMinutes),
        plannedMinutes: Math.round(taskMinutes),
        actualMinutes: 0,
        completion: 'pending',
      });
      accumulated += Math.round(taskMinutes);
    }
  }

  const totalAvailablePendingMinutes = allPending.reduce(
    (sum, n) => sum + (Number(n.estimatedMinutes) || 30),
    0
  );

  return {
    availableMinutes,
    requestedHours: hoursNum,
    totalPlannedMinutes: accumulated,
    totalAvailablePendingMinutes,
    tasks: selected,
  };
}

console.log('\n--- Weekly Planner Time Budget Filtering Tests ---');

const sampleRoadmapTasks = [
  { skillId: 'python-functions', title: 'Python Functions', estimatedMinutes: 30, priority: 'CRITICAL', roadmapStep: 1 },
  { skillId: 'python-practice', title: 'Python Practice', estimatedMinutes: 30, priority: 'HIGH', roadmapStep: 2 },
  { skillId: 'pytorch-basics', title: 'PyTorch Basics', estimatedMinutes: 45, priority: 'HIGH', roadmapStep: 3 },
  { skillId: 'pytorch-practice', title: 'PyTorch Practice', estimatedMinutes: 45, priority: 'MEDIUM', roadmapStep: 4 },
  { skillId: 'assessment-dl', title: 'DL Assessment', estimatedMinutes: 30, priority: 'LOW', roadmapStep: 5 },
];

test('0.5 hours budget (30 mins) selects exactly 30 minutes of tasks', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 0.5);
  assert.equal(res.availableMinutes, 30);
  assert.equal(res.totalPlannedMinutes, 30);
  assert.equal(res.tasks.length, 1);
  assert.equal(res.tasks[0].skillId, 'python-functions');
});

test('1 hour budget (60 mins) selects exactly 60 minutes of tasks', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 1);
  assert.equal(res.availableMinutes, 60);
  assert.equal(res.totalPlannedMinutes, 60);
  assert.equal(res.tasks.length, 2);
  assert.equal(res.tasks[0].title, 'Python Functions');
  assert.equal(res.tasks[1].title, 'Python Practice');
});

test('2 hours budget (120 mins) selects 120 minutes of tasks', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 2);
  assert.equal(res.availableMinutes, 120);
  assert.equal(res.totalPlannedMinutes, 120);
  // 30m + 30m + 45m + 15m partial of PyTorch Practice
  assert.ok(res.tasks.length >= 3);
});

test('3 hours budget (180 mins) selects all 180 minutes of available tasks', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 3);
  assert.equal(res.availableMinutes, 180);
  assert.equal(res.totalPlannedMinutes, 180);
  assert.equal(res.tasks.length, 5); // 30+30+45+45+30 = 180
});

test('5 hours budget (300 mins) selects all available tasks (180m) without creating fake tasks', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 5);
  assert.equal(res.availableMinutes, 300);
  assert.equal(res.totalPlannedMinutes, 180); // max available tasks = 180m
  assert.equal(res.totalAvailablePendingMinutes, 180);
  assert.equal(res.tasks.length, 5);
});

test('99 hours budget (5940 mins) selects all 180m available tasks without duplication', () => {
  const res = filterTasksByTimeBudget(sampleRoadmapTasks, 99);
  assert.equal(res.availableMinutes, 5940);
  assert.equal(res.totalPlannedMinutes, 180);
  assert.equal(res.tasks.length, 5);
});

test('Handles missing/undefined/NaN estimatedMinutes safely without NaNs', () => {
  const corruptedTasks = [
    { skillId: 'task-nan', title: 'Corrupted Task', estimatedMinutes: NaN, priority: 'HIGH' },
    { skillId: 'task-undef', title: 'Undefined Task', estimatedMinutes: undefined, priority: 'HIGH' },
  ];
  const res = filterTasksByTimeBudget(corruptedTasks, 1);
  assert.ok(Number.isFinite(res.totalPlannedMinutes));
  assert.equal(res.totalPlannedMinutes, 60); // 30 fallback + 30 fallback
  assert.equal(Number.isNaN(res.totalPlannedMinutes), false);
});

test('Handles empty pending tasks list gracefully', () => {
  const res = filterTasksByTimeBudget([], 2);
  assert.equal(res.totalPlannedMinutes, 0);
  assert.equal(res.tasks.length, 0);
});

console.log(`\n${passed + failed} budget filter tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
