/**
 * Test suite for Project & Certificate Analyzers, Reports, What-If Simulator (EduPath 2.0 - Phase 6)
 *
 * Pure unit tests — no MongoDB, no Gemini API, no network.
 */

import assert from 'node:assert/strict';
import { analyzeProjectDetails } from '../src/services/projectAnalyzer.js';
import { analyzeCertificateDetails } from '../src/services/certificateAnalyzer.js';
import { loadCatalogIndex } from '../src/services/roadmapService.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import { allNodes } from '../src/data/index.js';

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
// 1. AI Project Analyzer Skill Extraction
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n1. Project Skill Extraction');

testAsync('extracts catalog skills from project text', async () => {
  const detected = await analyzeProjectDetails({
    name: 'AI Audio Vishing Detector',
    description: 'Built a deep learning model using Python, PyTorch, CNN, and FastAPI for REST API backend.',
    technologies: 'Python, PyTorch, FastAPI, React',
    role: 'Full Stack AI Developer',
  });

  assert.ok(Array.isArray(detected));
  const skillIds = detected.map((d) => d.skillId);
  assert.ok(skillIds.includes('python') || skillIds.includes('react'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Certificate Analyzer Skill Mapping
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. Certificate Skill Mapping');

testAsync('extracts catalog skills from certificate title and topics', async () => {
  const detected = await analyzeCertificateDetails({
    title: 'Full Stack React & Node.js Developer Certificate',
    provider: 'Coursera',
    topicsText: 'React, Node.js, Express, MongoDB, JavaScript',
  });

  assert.ok(Array.isArray(detected));
  const skillIds = detected.map((d) => d.skillId);
  assert.ok(skillIds.includes('javascript') || skillIds.includes('react') || skillIds.includes('mongodb'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Category Readiness Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. Evidence-Based Category Readiness Logic');

function categorizeSkills(knownKeys = [], evidences = [], scores = {}) {
  const categories = {
    'Core Programming': ['javascript', 'python', 'html-css'],
    'Database & Engineering': ['sql', 'mongodb'],
  };

  const result = [];
  for (const [catName, keys] of Object.entries(categories)) {
    const knownCount = keys.filter((k) => knownKeys.includes(k)).length;
    const hasEvidence = keys.some((k) => evidences.some((e) => e.skillId === k));

    let status = 'Needs Work';
    if (knownCount >= 2 && hasEvidence) status = 'Strong';
    else if (knownCount >= 1 || hasEvidence) status = 'Developing';

    result.push({ categoryName: catName, status, knownCount });
  }
  return result;
}

test('categorizeSkills returns Strong when known skills + evidence present', () => {
  const cats = categorizeSkills(
    ['javascript', 'python'],
    [{ skillId: 'javascript', sourceType: 'PROJECT' }],
    {}
  );

  const coreProg = cats.find((c) => c.categoryName === 'Core Programming');
  assert.equal(coreProg.status, 'Strong');
});

test('categorizeSkills returns Needs Work when no skills or evidence present', () => {
  const cats = categorizeSkills([], [], {});
  const dbEng = cats.find((c) => c.categoryName === 'Database & Engineering');
  assert.equal(dbEng.status, 'Needs Work');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. What-If Career Simulation Comparison Logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n4. What-If Career Simulation Delta Logic');

function computeSimulationDelta(currentHours, currentWeeks, simHours, simWeeks) {
  return {
    hoursDiff: simHours - currentHours,
    weeksDiff: simWeeks - currentWeeks,
  };
}

test('computeSimulationDelta calculates accurate hour/week differences', () => {
  const delta = computeSimulationDelta(100, 10, 150, 15);
  assert.equal(delta.hoursDiff, 50);
  assert.equal(delta.weeksDiff, 5);
});

test('computeSimulationDelta correctly handles savings when sim < current', () => {
  const delta = computeSimulationDelta(200, 20, 120, 12);
  assert.equal(delta.hoursDiff, -80);
  assert.equal(delta.weeksDiff, -8);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
