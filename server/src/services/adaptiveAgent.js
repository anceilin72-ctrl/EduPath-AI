/**
 * adaptiveAgent.js — EduPath 2.0 Phase 4: Adaptive Roadmap + Struggle Detection
 *
 * ARCHITECTURE
 * ─────────────
 * Pure functions first: detectStruggle, classifyAcceleration,
 * buildRemediationSteps, computeAdaptiveDecision — no DB imports,
 * fully unit-testable with node alone.
 *
 * DB orchestrators second: runAdaptationForSkill, applyDecision,
 * rejectDecision — these call the pure functions and then persist.
 *
 * The DAG engine (graph.js, generate.js) is NEVER touched or imported here.
 * We only read the stored Roadmap snapshot and mutate its `adaptiveSteps`.
 */

import AgentDecision from '../models/AgentDecision.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import Roadmap from '../models/Roadmap.js';
import SkillEvidence from '../models/SkillEvidence.js';
import Progress from '../models/Progress.js';
import ApiError from '../utils/ApiError.js';

// ─────────────────────────────────────────────────────────────────────────────
// PURE FUNCTIONS (no DB, fully unit-testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect if a learner is struggling with a skill based on their attempt history.
 *
 * @param {Array<{ score: number, weakTopics: string[], repeatedMistakes: string[] }>} attempts
 * @returns {{ type: string, severity: 'mild'|'moderate'|'severe' } | null}
 */
export function detectStruggle(attempts = []) {
  if (!attempts || attempts.length === 0) return null;

  const scores = attempts.map((a) => a.score);
  const latest = scores[scores.length - 1];

  // Regression: previously excelled, now failing
  const prevBest = scores.length > 1 ? Math.max(...scores.slice(0, -1)) : null;
  if (prevBest !== null && prevBest >= 80 && latest < 60) {
    return { type: 'regression', severity: 'moderate' };
  }

  // Persistent struggle: 2+ attempts, all below 60%
  if (scores.length >= 2 && scores.every((s) => s < 60)) {
    const severity = scores.length >= 3 ? 'severe' : 'moderate';
    return { type: 'persistent-struggle', severity };
  }

  // Concept gap: repeated mistakes across attempts
  const allRepeated = attempts.flatMap((a) => a.repeatedMistakes || []);
  const repeatedSet = new Set(allRepeated);
  if (repeatedSet.size >= 2) {
    return { type: 'concept-gap', severity: 'mild' };
  }

  // Single low score
  if (latest < 60 && scores.length === 1) {
    return { type: 'low-score', severity: 'mild' };
  }

  return null;
}

/**
 * Determine if a learner qualifies for acceleration (can skip/abbreviate material).
 *
 * @param {number} latestScore
 * @param {Array<{ score: number }>} previousAttempts
 * @returns {boolean}
 */
export function classifyAcceleration(latestScore, previousAttempts = []) {
  if (latestScore >= 85) {
    if (previousAttempts.length === 0) return true;
    const avg = (latestScore + previousAttempts[0].score) / 2;
    return avg >= 80;
  }
  return false;
}

/**
 * Build a 3-step remediation scaffold for a struggling learner.
 *
 * Concept review → Practice task → Reassessment
 *
 * @param {string} skillId  - catalog node key
 * @param {string} skillTitle
 * @param {string[]} weakTopics
 * @param {string} insertAfterKey - which original node these follow
 * @returns {Array<object>} proposed adaptive steps
 */
export function buildRemediationSteps(skillId, skillTitle, weakTopics = [], insertAfterKey = '') {
  const topicSuffix = weakTopics.length > 0 ? ` — ${weakTopics.slice(0, 2).join(', ')}` : '';
  const ts = Date.now();

  return [
    {
      nodeKey: `${skillId}-concept-review-${ts}`,
      title: `${skillTitle}: Concept Review${topicSuffix}`,
      type: 'concept',
      insertAfterKey,
      reason: `Your recent assessment identified gaps in: ${weakTopics.join(', ') || 'core concepts'}. This review targets those areas directly.`,
      estimatedHours: 2,
      resources: [
        {
          title: `${skillTitle} Fundamentals — Targeted Review`,
          type: 'article',
          url: '',
          note: `Focus on: ${weakTopics.join(', ') || 'foundational concepts'}`,
        },
      ],
    },
    {
      nodeKey: `${skillId}-practice-task-${ts}`,
      title: `${skillTitle}: Practice Task`,
      type: 'practice',
      insertAfterKey: `${skillId}-concept-review-${ts}`,
      reason: `Active practice reinforces the concepts covered in the review step. Builds hands-on familiarity before re-assessment.`,
      estimatedHours: 3,
      resources: [],
    },
    {
      nodeKey: `${skillId}-reassessment-${ts}`,
      title: `${skillTitle}: Reassessment`,
      type: 'reassessment',
      insertAfterKey: `${skillId}-practice-task-${ts}`,
      reason: `Re-test your understanding after the review and practice. A score of 65%+ will update your Skill Passport.`,
      estimatedHours: 1,
      resources: [],
    },
  ];
}

/**
 * Build a single acceleration note step.
 *
 * @param {string} skillId
 * @param {string} skillTitle
 * @param {string} insertAfterKey
 * @returns {object} proposed adaptive step
 */
export function buildAccelerationStep(skillId, skillTitle, insertAfterKey = '') {
  return {
    nodeKey: `${skillId}-accelerate-${Date.now()}`,
    title: `${skillTitle}: Assessment Passed — Review Optional`,
    type: 'adaptive-resource',
    insertAfterKey,
    reason: `You scored 85%+ on the ${skillTitle} assessment. This material is optional — move ahead if you feel confident.`,
    estimatedHours: 0,
    resources: [],
  };
}

/**
 * Core decision calculator — pure, deterministic.
 *
 * @param {object} params
 * @returns {{ decisionType, reason, evidence, proposedSteps }}
 */
export function computeAdaptiveDecision({
  skillId,
  skillTitle,
  attempts = [],
  hasPassportEvidence = false,
  passportVerificationStatus = null,
  struggleResult = null,
  insertAfterKey = '',
}) {
  const latestAttempt = attempts[attempts.length - 1] ?? null;
  const latestScore = latestAttempt?.score ?? null;
  const scores = attempts.map((a) => a.score);
  const weakTopics = latestAttempt?.weakTopics ?? [];

  const evidence = {
    scores,
    latestScore,
    masteryStatus: latestAttempt?.masteryStatus ?? 'Unknown',
    weakTopics,
    struggleType: struggleResult?.type ?? null,
    attemptCount: attempts.length,
    sourceType: hasPassportEvidence ? 'PASSPORT + ASSESSMENT' : 'ASSESSMENT',
  };

  // 1. Passport already verifies this skill → suggest skip
  if (hasPassportEvidence && passportVerificationStatus === 'VERIFIED' && latestScore === null) {
    return {
      decisionType: 'SKIP_SUGGESTION',
      reason:
        `Your Skill Passport contains verified evidence for "${skillTitle}". ` +
        `You may be able to skip or fast-track this step. Accept to mark it as optional, or reject to keep it in your plan.`,
      evidence: { ...evidence, sourceType: 'PASSPORT' },
      proposedSteps: [],
    };
  }

  // 2. High score → acceleration
  if (latestScore !== null && classifyAcceleration(latestScore, attempts.slice(0, -1))) {
    const step = buildAccelerationStep(skillId, skillTitle, insertAfterKey);
    return {
      decisionType: 'ACCELERATE',
      reason:
        `You scored ${latestScore}% on the "${skillTitle}" assessment — above the acceleration threshold. ` +
        `The remaining study material for this skill is now marked as optional. ` +
        `Accept to flag this step and move on; reject to keep the original schedule.`,
      evidence,
      proposedSteps: [step],
    };
  }

  // 3. Severe/persistent struggle → full remediation scaffold
  if (struggleResult && ['persistent-struggle', 'regression'].includes(struggleResult.type)) {
    const steps = buildRemediationSteps(skillId, skillTitle, weakTopics, insertAfterKey);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return {
      decisionType: 'ADD_STEP',
      reason:
        `You have attempted "${skillTitle}" ${attempts.length} times with an average score of ${avgScore}%. ` +
        `Persistent difficulty detected in: ${weakTopics.join(', ') || 'core concepts'}. ` +
        `A 3-step remediation sequence (Concept Review → Practice → Reassessment) has been prepared. ` +
        `Accept to add it after the current step; reject to continue with the original plan.`,
      evidence,
      proposedSteps: steps,
    };
  }

  // 4. Mild struggle / first low score → add concept resource step
  if (latestScore !== null && latestScore < 60) {
    const ts = Date.now();
    const step = {
      nodeKey: `${skillId}-resource-${ts}`,
      title: `${skillTitle}: Additional Resources`,
      type: 'adaptive-resource',
      insertAfterKey,
      reason:
        `Your last assessment scored ${latestScore}%. ` +
        `Targeted resources for ${weakTopics.join(', ') || 'this topic'} have been suggested. ` +
        `Accept to add this resource step before your next attempt.`,
      estimatedHours: 1,
      resources: [
        {
          title: `${skillTitle} — Targeted Study`,
          type: 'article',
          note: weakTopics.length > 0 ? `Focus areas: ${weakTopics.join(', ')}` : 'Review core concepts.',
        },
      ],
    };
    return {
      decisionType: 'RECOMMEND_RESOURCE',
      reason: step.reason,
      evidence,
      proposedSteps: [step],
    };
  }

  // 5. concept gap (repeated mistakes) → recommend resource
  if (struggleResult?.type === 'concept-gap') {
    const allWeak = [...new Set(attempts.flatMap((a) => a.weakTopics || []))];
    const ts = Date.now();
    const step = {
      nodeKey: `${skillId}-concept-gap-${ts}`,
      title: `${skillTitle}: Concept Gap Review`,
      type: 'concept',
      insertAfterKey,
      reason:
        `You have repeatedly missed questions on: ${allWeak.join(', ')}. ` +
        `A targeted concept review has been recommended.`,
      estimatedHours: 2,
      resources: [],
    };
    return {
      decisionType: 'ADD_STEP',
      reason: step.reason,
      evidence,
      proposedSteps: [step],
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB ORCHESTRATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the adaptive agent for a specific skill on a roadmap.
 * Creates AgentDecision(s) with status PENDING — does NOT modify the roadmap yet.
 *
 * @returns {Array<AgentDecision>} created decisions
 */
export async function runAdaptationForSkill({ userId, roadmapId, skillId }) {
  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId });
  if (!roadmap) throw ApiError.notFound('Roadmap not found.');

  // Find the node in the roadmap so we know where to insert adaptive steps
  let insertAfterKey = skillId;
  let skillTitle = skillId;
  for (const phase of roadmap.phases ?? []) {
    const node = (phase.nodes ?? []).find((n) => n.nodeKey === skillId);
    if (node) {
      skillTitle = node.title ?? skillId;
      insertAfterKey = skillId;
      break;
    }
  }

  // Gather evidence
  const [attempts, evidences, progressRows] = await Promise.all([
    AssessmentAttempt.find({ userId, skillId }).sort({ createdAt: 1 }).lean(),
    SkillEvidence.find({ userId, skillId }).lean(),
    Progress.find({ userId, roadmapId, nodeKey: skillId }).lean(),
  ]);

  const hasVerified = evidences.some((e) => e.verificationStatus === 'VERIFIED');
  const verifiedStatus = hasVerified ? 'VERIFIED' : null;
  const struggleResult = detectStruggle(attempts);

  const decisionPayload = computeAdaptiveDecision({
    skillId,
    skillTitle,
    attempts,
    hasPassportEvidence: evidences.length > 0,
    passportVerificationStatus: verifiedStatus,
    struggleResult,
    insertAfterKey,
  });

  if (!decisionPayload) return [];

  // Check for an existing PENDING decision of the same type for this skill
  // to avoid duplicates
  const existing = await AgentDecision.findOne({
    userId,
    roadmapId,
    skillId,
    decisionType: decisionPayload.decisionType,
    status: 'PENDING',
  });
  if (existing) return [existing];

  const decision = await AgentDecision.create({
    userId,
    roadmapId,
    skillId,
    skillTitle,
    decisionType: decisionPayload.decisionType,
    reason: decisionPayload.reason,
    evidence: decisionPayload.evidence,
    proposedSteps: decisionPayload.proposedSteps,
    previousState: { adaptiveStepsCount: roadmap.adaptiveSteps?.length ?? 0 },
    status: 'PENDING',
  });

  return [decision];
}

/**
 * Apply an accepted decision: inject proposed steps into roadmap.adaptiveSteps.
 */
export async function applyDecision(decisionId, userId) {
  const decision = await AgentDecision.findOne({ _id: decisionId, userId });
  if (!decision) throw ApiError.notFound('Decision not found.');
  if (decision.status !== 'PENDING') {
    throw new ApiError(400, `Decision is already ${decision.status}.`);
  }

  const roadmap = await Roadmap.findOne({ _id: decision.roadmapId, userId });
  if (!roadmap) throw ApiError.notFound('Roadmap not found.');

  // Inject each proposed step into adaptiveSteps
  const stepsToAdd = (decision.proposedSteps ?? []).map((s) => ({
    nodeKey: s.nodeKey,
    title: s.title,
    type: s.type,
    insertAfterKey: s.insertAfterKey,
    reason: s.reason,
    estimatedHours: s.estimatedHours ?? 1,
    resources: s.resources ?? [],
    decisionId: decision._id,
    addedAt: new Date(),
    status: 'active',
  }));

  roadmap.adaptiveSteps = [...(roadmap.adaptiveSteps ?? []), ...stepsToAdd];
  roadmap.adaptationHistory = [
    ...(roadmap.adaptationHistory ?? []),
    {
      at: new Date(),
      summary: `${decision.decisionType}: ${decision.reason.substring(0, 120)}...`,
      decisionId: decision._id,
    },
  ];

  await roadmap.save();

  decision.status = 'ACCEPTED';
  decision.resolvedAt = new Date();
  decision.newState = { adaptiveStepsCount: roadmap.adaptiveSteps.length };
  await decision.save();

  return { decision, roadmap };
}

/**
 * Reject a pending decision — no roadmap change.
 */
export async function rejectDecision(decisionId, userId) {
  const decision = await AgentDecision.findOne({ _id: decisionId, userId });
  if (!decision) throw ApiError.notFound('Decision not found.');
  if (decision.status !== 'PENDING') {
    throw new ApiError(400, `Decision is already ${decision.status}.`);
  }

  decision.status = 'REJECTED';
  decision.resolvedAt = new Date();
  await decision.save();

  return decision;
}
