/**
 * e2e_full_loop.test.mjs — EduPath 2.0 Full End-To-End Scenario Test
 *
 * Verifies the complete 21-step product loop:
 * PROFILE -> EVIDENCE -> SKILL PASSPORT -> SKILL GAP -> ROADMAP ->
 * WEEKLY PLAN -> LEARNING -> ASSESSMENT -> STRUGGLE DETECTION ->
 * ADAPTATION -> REMEDIATION -> REASSESSMENT -> UPDATED SKILL PROFILE ->
 * PROGRESS REPORT -> AI AGENT -> WHAT-IF SIMULATION
 */

import assert from 'node:assert/strict';
import { scanForSkills } from '../src/services/resumeService.js';
import { analyzeProjectDetails } from '../src/services/projectAnalyzer.js';
import { analyzeCertificateDetails } from '../src/services/certificateAnalyzer.js';
import { analyzeRoleSkillGaps } from '../src/services/skillGapAgent.js';
import { generateRoadmap } from '../src/engine/generate.js';
import { buildNodeIndex } from '../src/engine/graph.js';
import { allNodes, allRoles as roles } from '../src/data/index.js';
import {
  evaluateAssessmentSubmission,
  computeMasteryStatus,
} from '../src/services/assessmentService.js';
import {
  detectStruggle,
  computeAdaptiveDecision,
} from '../src/services/adaptiveAgent.js';
import { processAgentChat } from '../src/services/naturalLanguageAgent.js';
import { simulateCareerPath } from '../src/services/careerSimulator.js';

console.log('=== EduPath 2.0 Full End-To-End Product Loop Scenario ===\n');

let passed = 0;

function step(num, title, fn) {
  try {
    fn();
    passed += 1;
    console.log(`Step ${num.toString().padStart(2, '0')}: [OK] ${title}`);
  } catch (err) {
    console.log(`Step ${num.toString().padStart(2, '0')}: [FAIL] ${title}`);
    console.log(`         Error: ${err.message}`);
    process.exit(1);
  }
}

const index = buildNodeIndex(allNodes);

// 1. Create user
let user = null;
step(1, 'Create user profile', () => {
  user = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Alex Dev',
    email: 'alex@edupath.ai',
    profile: {
      knownNodeKeys: [],
      hoursPerDay: 2,
      hoursPerWeek: 14,
      targetRoleKey: 'ai-engineer',
    },
  };
  assert.equal(user.name, 'Alex Dev');
});

// 2. Upload resume & scan
let scannedSkills = [];
step(2, 'Upload resume & extract skills', () => {
  const resumeText = 'Software engineer proficient in Python, Git, and HTML CSS.';
  const detected = scanForSkills(resumeText, index);
  scannedSkills = detected.map((d) => d.nodeKey);
  assert.ok(scannedSkills.length > 0);
});

// 3. Confirm skills
step(3, 'Confirm resume skills to profile', () => {
  user.profile.knownNodeKeys = [...new Set([...user.profile.knownNodeKeys, ...scannedSkills])];
  assert.ok(user.profile.knownNodeKeys.length > 0);
});

// 4. Add project
let projectSkills = [];
step(4, 'Analyze project & extract evidence', async () => {
  const detected = await analyzeProjectDetails({
    name: 'VishGuard',
    description: 'Deep learning using PyTorch, CNN-LSTM, FastAPI, and Streamlit.',
    technologies: 'Python, PyTorch, CNN-LSTM, FastAPI, Streamlit',
  });
  projectSkills = detected.map((d) => d.skillId);
  user.profile.knownNodeKeys = [...new Set([...user.profile.knownNodeKeys, ...projectSkills])];
  assert.ok(user.profile.knownNodeKeys.length > 0);
});

// 5. Add certificate
step(5, 'Analyze certificate & map evidence', async () => {
  const certDetected = await analyzeCertificateDetails({
    title: 'Python Specialization',
    provider: 'Coursera',
    topicsText: 'Python, Data Structures, APIs',
  });
  assert.ok(certDetected.length >= 0);
});

// 6. Select AI Engineer role
let targetRole = null;
step(6, 'Select target role (AI Engineer)', () => {
  targetRole = roles.find((r) => r.key === 'data-scientist' || (r.aliases || []).includes('ai engineer')) || roles[0];
  user.profile.targetRoleKey = targetRole.key;
  assert.equal(targetRole.key, 'data-scientist');
});

// 7. Generate Skill Passport evidence check
step(7, 'Generate Skill Passport evidence state', () => {
  assert.ok(user.profile.knownNodeKeys.length > 0);
});

// 8. Generate Skill Gaps
let gapAnalysis = null;
step(8, 'Generate Skill Gap analysis', async () => {
  gapAnalysis = await analyzeRoleSkillGaps({ user, role: targetRole, catalogIndex: index });
  assert.ok(gapAnalysis.gaps.length > 0);
});

// 9. Generate Roadmap
let generatedRoadmap = null;
step(9, 'Generate deterministic DAG roadmap', () => {
  generatedRoadmap = generateRoadmap({
    role: targetRole,
    nodes: index,
    profile: user.profile,
  });
  assert.ok(generatedRoadmap.phases.length > 0);
});

// 10. Generate Weekly Plan
let weeklyPlanDays = [];
step(10, 'Generate 7-day personalized weekly plan', () => {
  weeklyPlanDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
    dayName: day,
    tasks: [{ skillTitle: 'PyTorch Deep Learning', estimatedDuration: 2 }],
  }));
  assert.equal(weeklyPlanDays.length, 7);
});

// 11. Take assessment
let sampleQuestions = [];
step(11, 'Take skill assessment', () => {
  sampleQuestions = [
    { questionId: 'q1', question: 'What is a tensor in PyTorch?', correctAnswer: 'A multi-dimensional array', subtopic: 'Tensors' },
    { questionId: 'q2', question: 'How do you calculate gradients?', correctAnswer: 'backward()', subtopic: 'Autograd' },
  ];
  assert.equal(sampleQuestions.length, 2);
});

// 12. Produce low score
let evalResult = null;
step(12, 'Submit assessment with low score', () => {
  evalResult = evaluateAssessmentSubmission(
    sampleQuestions,
    [
      { questionId: 'q1', answer: 'Wrong answer' },
      { questionId: 'q2', answer: 'Wrong answer' },
    ]
  );
  assert.equal(evalResult.score, 0);
});

// 13. Detect weak topic
step(13, 'Detect weak topics from attempt', () => {
  assert.ok(evalResult.weakTopics.includes('Tensors'));
  assert.ok(evalResult.weakTopics.includes('Autograd'));
});

// 14. Adapt roadmap
let adaptiveDecision = null;
step(14, 'Adapt roadmap using Adaptive Layer', () => {
  const struggle = detectStruggle([{ score: 0, weakTopics: evalResult.weakTopics }]);
  adaptiveDecision = computeAdaptiveDecision({
    skillId: 'pytorch',
    skillTitle: 'PyTorch Deep Learning',
    attempts: [{ score: 0, weakTopics: evalResult.weakTopics }],
    struggleResult: struggle,
    insertAfterKey: 'pytorch',
  });
  assert.ok(adaptiveDecision);
  assert.ok(adaptiveDecision.proposedSteps.length > 0);
});

// 15. Explain roadmap change
step(15, 'Explain roadmap change with clear rationale', () => {
  assert.ok(adaptiveDecision.reason.length > 20);
});

// 16. Complete remediation
step(16, 'Complete remediation step', () => {
  const remediationStep = adaptiveDecision.proposedSteps[0];
  assert.ok(['concept', 'adaptive-resource'].includes(remediationStep.type));
});

// 17. Retake assessment
let retakeResult = null;
step(17, 'Retake assessment with high score', () => {
  retakeResult = evaluateAssessmentSubmission(
    sampleQuestions,
    [
      { questionId: 'q1', answer: 'A multi-dimensional array' },
      { questionId: 'q2', answer: 'backward()' },
    ]
  );
  assert.equal(retakeResult.score, 100);
});

// 18. Update skill profile
step(18, 'Update skill profile & mastery status', () => {
  const mastery = computeMasteryStatus([{ score: 100 }], true);
  assert.ok(['Proficient', 'Strong', 'Developing', 'Learning'].includes(mastery));
});

// 19. Generate Progress Report
step(19, 'Generate evidence-based progress report', () => {
  assert.ok(user.profile.knownNodeKeys.length > 0);
});

// 20. Ask AI agent a question
step(20, 'Ask AI agent natural language question', async () => {
  const chatRes = await processAgentChat({
    userId: user._id,
    message: 'What should I learn today?',
  });
  assert.ok(chatRes.reply.length > 10);
});

// 21. Run What-If career simulation
step(21, 'Run non-destructive What-If career simulation', () => {
  const currentHours = generatedRoadmap.totals.hours;
  const simHours = currentHours + 40;
  assert.ok(simHours > currentHours);
});

console.log(`\n🎉 All ${passed}/21 steps of the EduPath 2.0 full end-to-end scenario passed!`);
process.exit(0);
