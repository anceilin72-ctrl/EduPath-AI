/**
 * skillGapAgent.js — EduPath 2.0 Advanced AI Skill Gap Agent.
 *
 * Compares:
 *   Learner Skill Passport (Evidence & Ratings)
 *   +
 *   Target Role Requirements (Transitive Prerequisite DAG & Importance)
 *
 * Determinations per skill:
 *   - Status: STRONG | DEVELOPING | WEAK | GAP | UNVERIFIED
 *   - Priority: CRITICAL | HIGH | MEDIUM | LOW (calculated deterministically from DAG importance, prerequisite depth, and downstream blockages)
 *   - Prerequisite gaps: whether unfulfilled prerequisites are blocking this skill
 *   - Explainable AI narrative / reasoning: generated safely via Gemini (with deterministic rule fallback)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { collectRequiredNodes } from '../engine/graph.js';
import { calculateSkillConfidence, deriveEstimatedLevel } from './evidenceService.js';
import SkillEvidence from '../models/SkillEvidence.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import Role from '../models/Role.js';

const LEVEL_RANK = {
  none: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Categorise current skill capability relative to required level.
 *
 * Statuses:
 * - STRONG: meets or exceeds required level with confirmed/verified evidence
 * - DEVELOPING: within 1 level or intermediate with active evidence
 * - WEAK: beginner level when intermediate/advanced is required
 * - GAP: completely missing from user profile and evidence
 * - UNVERIFIED: claimed by user or extracted in resume, but lacks corroboration or verification
 */
export function determineSkillStatus({ currentLevel, requiredLevel, evidenceItems = [], isKnown = false }) {
  const currentRank = LEVEL_RANK[currentLevel] || 0;
  const targetRank = LEVEL_RANK[requiredLevel] || 2; // Default required is intermediate

  const hasConfirmedEvidence = evidenceItems.some(
    (e) => e.verificationStatus === 'USER_CONFIRMED' || e.verificationStatus === 'VERIFIED'
  );
  const hasOnlyUnverified =
    evidenceItems.length > 0 &&
    evidenceItems.every((e) => e.verificationStatus === 'UNVERIFIED');

  if (currentRank === 0 && !isKnown && evidenceItems.length === 0) {
    return 'GAP';
  }

  if (hasOnlyUnverified && !isKnown) {
    return 'UNVERIFIED';
  }

  if (currentRank >= targetRank) {
    return hasConfirmedEvidence || isKnown ? 'STRONG' : 'UNVERIFIED';
  }

  if (currentRank === targetRank - 1) {
    return 'DEVELOPING';
  }

  if (currentRank > 0) {
    return 'WEAK';
  }

  return 'GAP';
}

/**
 * Deterministically compute skill priority for the target role.
 *
 * Invariants:
 * 1. Importance (core > recommended > optional)
 * 2. Status severity (GAP/WEAK > DEVELOPING > STRONG)
 * 3. Downstream impact: foundation skills that block many downstream topics receive higher priority
 * 4. Prerequisite readiness: skills whose own prerequisites are already met come before blocked ones
 */
export function computeSkillPriority({
  importance,
  status,
  downstreamCount = 0,
  unmetPrereqCount = 0,
}) {
  if (status === 'STRONG') {
    return 'LOW';
  }

  // Core missing skills
  if (importance === 'core') {
    // If it has downstream dependents or no prerequisite blockers, it is critical
    if (downstreamCount > 1 || unmetPrereqCount === 0) {
      return status === 'GAP' || status === 'WEAK' ? 'CRITICAL' : 'HIGH';
    }
    return 'HIGH';
  }

  if (importance === 'recommended') {
    if (status === 'GAP' || status === 'WEAK') return 'MEDIUM';
    return 'LOW';
  }

  return 'LOW';
}

/**
 * Analyze evidence completeness (proof gap) for a skill.
 * Identifies missing evidence without judgmental phrasing.
 */
export function analyzeProofGap({ skillId, skillName, status, evidence = [], isKnown = false }) {
  const sources = new Set(evidence.map((e) => e.sourceType));
  const hasProject = sources.has('PROJECT');
  const hasCertificate = sources.has('CERTIFICATE');
  const hasAssessment = sources.has('ASSESSMENT');
  const hasLearning = sources.has('LEARNING_ACTIVITY');
  const hasSelfDeclared = sources.has('SELF_DECLARED') || sources.has('RESUME');

  const evidenceChecklist = {
    project: hasProject,
    certificate: hasCertificate,
    assessment: hasAssessment,
    learning: hasLearning,
    selfDeclared: hasSelfDeclared,
  };

  let proofGap = '';
  let recommendedAction = '';
  let actionType = 'learning';
  let estimatedMinutes = 20;

  if (hasProject && hasCertificate && hasAssessment) {
    proofGap = 'Multi-source proof demonstrated across projects, credentials, and assessments.';
    recommendedAction = `Verified competency in ${skillName}. Ready for capstone application.`;
    actionType = 'verified';
    estimatedMinutes = 0;
  } else if ((hasProject || hasCertificate || hasSelfDeclared || isKnown) && !hasAssessment) {
    proofGap = 'Current proficiency has not been assessed.';
    recommendedAction = `Take ${skillName} assessment.`;
    actionType = 'assessment';
    estimatedMinutes = 20;
  } else if (hasAssessment && !hasProject && !hasCertificate) {
    proofGap = 'Practical application not yet demonstrated in project work or credentials.';
    recommendedAction = `Build a portfolio project using ${skillName}.`;
    actionType = 'project';
    estimatedMinutes = 60;
  } else if (hasLearning && !hasAssessment && !hasProject) {
    proofGap = 'Learning recorded, but independent assessment proof is missing.';
    recommendedAction = `Take ${skillName} assessment to verify mastery.`;
    actionType = 'assessment';
    estimatedMinutes = 20;
  } else if (status === 'WEAK') {
    proofGap = 'Assessment or self-evaluation indicates concepts require practice and consolidation.';
    recommendedAction = `Review core patterns and practice ${skillName}.`;
    actionType = 'practice';
    estimatedMinutes = 30;
  } else {
    proofGap = 'No external evidence or assessment on record.';
    recommendedAction = `Start introductory learning modules for ${skillName}.`;
    actionType = 'learning';
    estimatedMinutes = 45;
  }

  return {
    proofGap,
    recommendedAction,
    actionType,
    estimatedMinutes,
    evidenceChecklist,
  };
}

/**
 * Deterministically compute the ONE single Next Best Action for the learner.
 */
export function computeNextBestAction({
  roleTitle = 'Target Role',
  activeRoadmap,
  gapItems = [],
  assessmentAttempts = [],
  availableMinutes = 30,
}) {
  // 1. Assessment weakness / low score struggle
  const recentAttempt = assessmentAttempts[0];
  if (recentAttempt && (recentAttempt.score < 75 || (recentAttempt.weakTopics && recentAttempt.weakTopics.length > 0))) {
    const weakSkill =
      gapItems.find(
        (g) =>
          g.skillId === recentAttempt.skillId ||
          (recentAttempt.weakTopics || []).some((t) => g.skillName.toLowerCase().includes(t.toLowerCase()))
      ) || gapItems.find((g) => g.status === 'WEAK');
    const skillTitle = weakSkill?.skillName || recentAttempt.skillTitle || 'Core Concepts';
    const weakList = recentAttempt.weakTopics?.slice(0, 2).join(', ');
    return {
      title: `Practice ${skillTitle}`,
      actionType: 'practice',
      estimatedMinutes: Math.min(availableMinutes, 30),
      reason: weakList
        ? `Recent assessment showed weak areas in ${weakList}. Targeted practice will solidify foundations.`
        : `Assessment score indicates concepts in ${skillTitle} require targeted review.`,
      cta: 'Start Practice',
      url: `/assessments/${recentAttempt.skillId || ''}`,
      skillId: weakSkill?.skillId || recentAttempt.skillId,
      skillName: skillTitle,
      priority: 'CRITICAL',
    };
  }

  // 2. Evidence / Proof gap (e.g. Project/Certificate exists, but no Assessment)
  const proofGapItem =
    gapItems.find(
      (g) =>
        (g.priority === 'CRITICAL' || g.priority === 'HIGH' || g.status === 'DEVELOPING') &&
        (g.evidenceChecklist?.project || g.evidenceChecklist?.certificate) &&
        !g.evidenceChecklist?.assessment
    ) ||
    gapItems.find(
      (g) =>
        (g.evidenceChecklist?.project || g.evidenceChecklist?.certificate || g.evidenceChecklist?.selfDeclared) &&
        !g.evidenceChecklist?.assessment &&
        g.status !== 'GAP'
    );

  if (proofGapItem) {
    const hasProjAndCert = proofGapItem.evidenceChecklist?.project && proofGapItem.evidenceChecklist?.certificate;
    return {
      title: `Take ${proofGapItem.skillName} Assessment`,
      actionType: 'assessment',
      estimatedMinutes: 20,
      reason: hasProjAndCert
        ? `You have project and certificate evidence but no recent assessment.`
        : `You have practical evidence for ${proofGapItem.skillName} but current proficiency has not been assessed.`,
      cta: 'Start Assessment',
      url: `/assessments/${proofGapItem.skillId}`,
      skillId: proofGapItem.skillId,
      skillName: proofGapItem.skillName,
      priority: proofGapItem.priority,
    };
  }

  // 3. High priority missing foundational skill / prerequisite gap
  const criticalMissing =
    gapItems.find(
      (g) =>
        (g.status === 'GAP' || g.status === 'WEAK') &&
        (g.unmetPrerequisites?.length === 0 || !g.unmetPrerequisites) &&
        g.priority === 'CRITICAL'
    ) ||
    gapItems.find(
      (g) =>
        (g.status === 'GAP' || g.status === 'WEAK') &&
        (g.unmetPrerequisites?.length === 0 || !g.unmetPrerequisites) &&
        g.priority === 'HIGH'
    ) ||
    gapItems.find((g) => g.status === 'GAP' && (g.unmetPrerequisites?.length === 0 || !g.unmetPrerequisites));

  if (criticalMissing) {
    return {
      title: `Learn ${criticalMissing.skillName}`,
      actionType: 'learning',
      estimatedMinutes: Math.min(availableMinutes, Math.round(criticalMissing.estimatedHours * 60) || 45),
      reason: `High-priority foundation required for ${roleTitle}. Addressing this unblocks downstream milestones.`,
      cta: 'Start Learning',
      url: activeRoadmap ? `/plans/${activeRoadmap._id}` : `/weekly-planner`,
      skillId: criticalMissing.skillId,
      skillName: criticalMissing.skillName,
      priority: criticalMissing.priority,
    };
  }

  // 4. Next planned step in active roadmap or remaining gap
  const nextGap = gapItems.find((g) => g.status !== 'STRONG');
  if (nextGap) {
    return {
      title: `Continue ${nextGap.skillName}`,
      actionType: 'learning',
      estimatedMinutes: Math.min(availableMinutes, 45),
      reason: `Next planned milestone in your ${roleTitle} path.`,
      cta: 'Carry on',
      url: activeRoadmap ? `/plans/${activeRoadmap._id}` : `/weekly-planner`,
      skillId: nextGap.skillId,
      skillName: nextGap.skillName,
      priority: nextGap.priority,
    };
  }

  return {
    title: 'Review Portfolio & Capstones',
    actionType: 'portfolio',
    estimatedMinutes: 30,
    reason: `All mandatory requirements for ${roleTitle} are demonstrated and verified!`,
    cta: 'View Progress Report',
    url: '/progress-report',
    skillId: null,
    skillName: roleTitle,
    priority: 'LOW',
  };
}

/**
 * Generate explainable next action and description for each gap.
 */
export function generateRecommendedAction({
  skillName,
  status,
  priority,
  unmetPrereqs = [],
  inActiveRoadmap,
  evidenceCount,
}) {
  if (unmetPrereqs.length > 0) {
    return `Complete foundations first: ${unmetPrereqs.join(', ')} before starting ${skillName}.`;
  }
  if (status === 'STRONG') {
    return `Skill verified. Ready for practical capstones and role applications.`;
  }
  if (status === 'DEVELOPING') {
    return `Complete real-world project or intermediate challenge to consolidate ${skillName}.`;
  }
  if (inActiveRoadmap) {
    return `In your current roadmap — continue learning to build evidence for ${skillName}.`;
  }
  if (evidenceCount > 0 && (status === 'WEAK' || status === 'GAP')) {
    return `Evidence exists but proficiency is low. Needs assessment/practice for ${skillName}.`;
  }
  if (status === 'WEAK') {
    return `Review core concepts and practice intermediate patterns for ${skillName}.`;
  }
  if (status === 'UNVERIFIED') {
    return `Confirm resume match or submit project artifact to verify your ${skillName} proficiency.`;
  }
  return `Evidence missing — high-priority foundation. Start introductory learning modules and hands-on exercises.`;
}

/**
 * Rule-based explanation generator (guaranteed fallback).
 */
export function generateRuleBasedExplanation({ roleTitle, stats, topGaps }) {
  const topNames = topGaps.slice(0, 3).map((g) => g.skillName);
  const gapCount = stats.gapCount + stats.weakCount;

  if (gapCount === 0) {
    return `Your Skill Passport exhibits strong alignment with ${roleTitle}. All mandatory requirements are demonstrated or verified. Focus on portfolio synthesis and mock interviews.`;
  }

  return `For ${roleTitle}, you have demonstrated ${stats.strongCount} skills, with ${stats.developingCount} developing. Your most critical gaps are ${topNames.join(', ')}. Addressing these foundation topics first will unblock downstream specializations.`;
}

/**
 * Optional AI synthesis via Gemini with deterministic strict fallback.
 */
export async function generateAIGapExplanation({ roleTitle, roleDescription, stats, gapItems }) {
  const fallback = generateRuleBasedExplanation({
    roleTitle,
    stats,
    topGaps: gapItems.filter((g) => g.status === 'GAP' || g.status === 'WEAK'),
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'obviously-not-a-real-key') {
    return { text: fallback, source: 'rule-based' };
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are the EduPath 2.0 Skill Gap Agent.
Explain the learner's skill gap for the role: "${roleTitle}".
Role context: ${roleDescription}
Statistics:
- Demonstrated/Strong skills: ${stats.strongCount}
- Developing skills: ${stats.developingCount}
- Weak/Gaps: ${stats.gapCount + stats.weakCount}
- Critical Priority Items: ${gapItems.filter((g) => g.priority === 'CRITICAL').map((g) => g.skillName).join(', ') || 'None'}
- High Priority Items: ${gapItems.filter((g) => g.priority === 'HIGH').map((g) => g.skillName).join(', ') || 'None'}

Provide an encouraging, concise (2-3 paragraphs max) strategic summary explaining:
1. What the learner already has covered.
2. The exact critical gaps they should tackle first and WHY (referencing prerequisite logic).
3. Do NOT hallucinate skills or technologies not mentioned above. Keep it actionable.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 6000)),
    ]);

    const text = result?.response?.text();
    if (text && text.length > 100) {
      return { text: text.trim(), source: 'ai' };
    }
    return { text: fallback, source: 'rule-based' };
  } catch (err) {
    return { text: fallback, source: 'rule-based' };
  }
}

/**
 * Main Agent analysis function.
 */
export async function analyzeRoleSkillGaps({ user, role, catalogIndex, activeRoadmap, options = {} }) {
  const { includeOptional = false } = options;

  // 1. Fetch user evidence
  const userEvidence = user?._id
    ? await SkillEvidence.find({ userId: user._id }).lean()
    : [];

  const evidenceBySkill = new Map();
  for (const item of userEvidence) {
    const list = evidenceBySkill.get(item.skillId) || [];
    list.push(item);
    evidenceBySkill.set(item.skillId, list);
  }

  const knownKeys = new Set(user?.profile?.knownNodeKeys || []);
  const userLevels =
    user?.profile?.skillLevels instanceof Map
      ? Object.fromEntries(user.profile.skillLevels)
      : user?.profile?.skillLevels || {};

  const roadmapNodeKeys = new Set(
    activeRoadmap?.phases?.flatMap((p) => (p.nodes || []).map((n) => n.nodeKey)) || []
  );

  // 2. Transitive DAG requirement gathering
  const requiredImportanceMap = collectRequiredNodes(role, catalogIndex, { includeOptional });

  // 3. Compute downstream dependency counts for prioritization
  const downstreamCounts = new Map();
  for (const [key] of requiredImportanceMap.entries()) {
    downstreamCounts.set(key, 0);
  }

  for (const [key] of requiredImportanceMap.entries()) {
    const node = catalogIndex.get(key);
    for (const p of node?.prerequisites || []) {
      if (downstreamCounts.has(p)) {
        downstreamCounts.set(p, (downstreamCounts.get(p) || 0) + 1);
      }
    }
  }

  // 4. Evaluate each required skill
  const gapItems = [];

  for (const [skillKey, importance] of requiredImportanceMap.entries()) {
    const node = catalogIndex.get(skillKey);
    const evidence = evidenceBySkill.get(skillKey) || [];
    const isKnown = knownKeys.has(skillKey);

    const userRating = userLevels[skillKey] || null;
    const currentLevel = isKnown || evidence.length > 0
      ? deriveEstimatedLevel(skillKey, evidence, userRating)
      : 'none';
    const requiredLevel = node?.difficulty || 'intermediate';

    const status = determineSkillStatus({
      currentLevel,
      requiredLevel,
      evidenceItems: evidence,
      isKnown,
    });

    const confidence = calculateSkillConfidence(evidence);

    // Check unmet prerequisites
    const unmetPrereqs = [];
    for (const prereqKey of node?.prerequisites || []) {
      const prereqNode = catalogIndex.get(prereqKey);
      const prereqEvidence = evidenceBySkill.get(prereqKey) || [];
      const prereqKnown = knownKeys.has(prereqKey);
      const pLevel = prereqKnown || prereqEvidence.length > 0
        ? deriveEstimatedLevel(prereqKey, prereqEvidence, userLevels[prereqKey] || null)
        : 'none';

      const pStatus = determineSkillStatus({
        currentLevel: pLevel,
        requiredLevel: prereqNode?.difficulty || 'intermediate',
        evidenceItems: prereqEvidence,
        isKnown: prereqKnown,
      });

      if (pStatus === 'GAP' || pStatus === 'WEAK') {
        unmetPrereqs.push(prereqNode?.title || prereqKey);
      }
    }

    const downstream = downstreamCounts.get(skillKey) || 0;
    const priority = computeSkillPriority({
      importance,
      status,
      downstreamCount: downstream,
      unmetPrereqCount: unmetPrereqs.length,
    });

    const inActiveRoadmap = roadmapNodeKeys.has(skillKey);

    const recommendedAction = generateRecommendedAction({
      skillName: node?.title || skillKey,
      status,
      priority,
      unmetPrereqs,
      inActiveRoadmap,
      evidenceCount: evidence.length,
    });

    const proofAnalysis = analyzeProofGap({
      skillId: skillKey,
      skillName: node?.title || skillKey,
      status,
      evidence,
      isKnown,
    });

    gapItems.push({
      skillId: skillKey,
      skillName: node?.title || skillKey,
      domain: node?.domain || 'technology',
      importance,
      currentLevel,
      requiredLevel,
      status,
      confidence,
      priority,
      downstreamCount: downstream,
      unmetPrerequisites: unmetPrereqs,
      evidenceCount: evidence.length,
      evidenceSources: [...new Set(evidence.map((e) => e.sourceType))],
      evidenceChecklist: proofAnalysis.evidenceChecklist,
      proofGap: proofAnalysis.proofGap,
      suggestedProofAction: proofAnalysis.recommendedAction,
      proofActionType: proofAnalysis.actionType,
      roadmapCoverage: inActiveRoadmap ? 'Covered in roadmap' : 'Not in any plan',
      recommendedAction,
      estimatedHours: node?.estimatedHours || 20,
      description: node?.description || '',
    });
  }

  // 5. Sort gaps by Priority rank: CRITICAL > HIGH > MEDIUM > LOW
  const priorityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  gapItems.sort((a, b) => {
    const diff = (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    if (diff !== 0) return diff;
    return b.downstreamCount - a.downstreamCount;
  });

  const stats = {
    totalRequired: gapItems.length,
    strongCount: gapItems.filter((g) => g.status === 'STRONG').length,
    developingCount: gapItems.filter((g) => g.status === 'DEVELOPING').length,
    weakCount: gapItems.filter((g) => g.status === 'WEAK').length,
    gapCount: gapItems.filter((g) => g.status === 'GAP').length,
    unverifiedCount: gapItems.filter((g) => g.status === 'UNVERIFIED').length,
    criticalCount: gapItems.filter((g) => g.priority === 'CRITICAL').length,
    highPriorityCount: gapItems.filter((g) => g.priority === 'HIGH').length,
  };

  const readinessPercent = stats.totalRequired > 0
    ? Math.round(((stats.strongCount + stats.developingCount * 0.5) / stats.totalRequired) * 100)
    : 0;

  // 6. Fetch recent assessment attempts for nextBestAction
  const assessmentAttempts = user?._id
    ? await AssessmentAttempt.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).lean()
    : [];

  const nextBestAction = computeNextBestAction({
    roleTitle: role.title,
    activeRoadmap,
    gapItems,
    assessmentAttempts,
    availableMinutes: (user?.profile?.hoursPerDay || 2) * 60,
  });

  const explanation = await generateAIGapExplanation({
    roleTitle: role.title,
    roleDescription: role.description,
    stats,
    gapItems,
  });

  return {
    targetRole: {
      key: role.key,
      title: role.title,
      domain: role.domain,
      description: role.description,
    },
    readinessPercent,
    stats,
    nextBestAction,
    explanation,
    skills: gapItems,
  };
}
