/**
 * evidenceService.js — Logic for computing explainable skill confidence,
 * aggregating Skill Passport summaries, and processing evidence sources.
 */

import SkillEvidence from '../models/SkillEvidence.js';
import CareerNode from '../models/CareerNode.js';
import { loadCatalogIndex } from './roadmapService.js';
import { scanForSkills } from './resumeService.js';

/**
 * Compute explainable confidence level from an array of evidence items.
 *
 * Rules:
 * - Assessment evidence (verified or confirmed): High
 * - Resume + Project: High (or Medium/High -> High)
 * - Resume + Self-declared: Medium
 * - Project alone: Medium
 * - Resume alone (confirmed): Medium
 * - Self-declaration only: Low
 * - Unverified alone: Low
 *
 * Returns: 'Low' | 'Medium' | 'High'
 */
export function calculateSkillConfidence(evidenceItems = []) {
  if (!evidenceItems || evidenceItems.length === 0) return 'Low';

  const validEvidence = evidenceItems.filter(
    (e) => e.verificationStatus === 'USER_CONFIRMED' || e.verificationStatus === 'VERIFIED'
  );

  // If there are only unverified items, confidence is Low
  if (validEvidence.length === 0) return 'Low';

  const types = new Set(validEvidence.map((e) => e.sourceType));

  const hasAssessment = types.has('ASSESSMENT');
  const hasCertificate = types.has('CERTIFICATE');
  const hasProject = types.has('PROJECT');
  const hasResume = types.has('RESUME');
  const hasLearning = types.has('LEARNING_ACTIVITY');
  const hasSelfDeclared = types.has('SELF_DECLARED');

  if (hasAssessment || (hasCertificate && (hasProject || hasResume || hasLearning))) {
    return 'High';
  }

  if (hasResume && hasProject) {
    return 'High';
  }

  if (hasResume && (hasSelfDeclared || hasLearning)) {
    return 'Medium';
  }

  if (hasProject || hasCertificate || hasLearning) {
    return 'Medium';
  }

  if (hasResume) {
    return 'Medium';
  }

  if (hasSelfDeclared) {
    return 'Low';
  }

  return 'Low';
}

/**
 * Deduce estimated level for a skill based on evidence and user ratings.
 * If user set a skillLevel in profile, that is used; otherwise derived from evidence.
 */
export function deriveEstimatedLevel(skillKey, evidenceItems = [], userSkillLevel = null) {
  if (userSkillLevel && ['beginner', 'intermediate', 'advanced'].includes(userSkillLevel)) {
    return userSkillLevel;
  }

  // Check evidence skill levels
  const levels = evidenceItems
    .map((e) => e.skillLevel)
    .filter((l) => ['beginner', 'intermediate', 'advanced'].includes(l));

  if (levels.includes('advanced')) return 'advanced';
  if (levels.includes('intermediate')) return 'intermediate';
  if (levels.includes('beginner')) return 'beginner';

  return 'beginner';
}

/**
 * Build the complete Skill Passport for a user.
 */
export async function buildUserPassport(user) {
  const [index, allEvidence] = await Promise.all([
    loadCatalogIndex(),
    SkillEvidence.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const userSkillLevels =
    user.profile?.skillLevels instanceof Map
      ? Object.fromEntries(user.profile.skillLevels)
      : user.profile?.skillLevels || {};

  const knownKeys = new Set(user.profile?.knownNodeKeys || []);

  // Group evidence by skillId
  const evidenceBySkill = new Map();
  for (const item of allEvidence) {
    const list = evidenceBySkill.get(item.skillId) || [];
    list.push(item);
    evidenceBySkill.set(item.skillId, list);
  }

  // Aggregate all unique skillIds present in knownNodeKeys or evidence
  const allSkillIds = new Set([...knownKeys, ...evidenceBySkill.keys()]);

  const passportSkills = [];

  for (const skillId of allSkillIds) {
    const node = index.get(skillId);
    const evidence = evidenceBySkill.get(skillId) || [];
    const userRating = userSkillLevels[skillId] || null;

    const confidence = calculateSkillConfidence(evidence);
    const estimatedLevel = deriveEstimatedLevel(skillId, evidence, userRating);

    // Latest update
    let lastAssessed = null;
    if (evidence.length > 0) {
      const dates = evidence.map((e) => new Date(e.updatedAt || e.createdAt)).filter(Boolean);
      if (dates.length > 0) {
        lastAssessed = new Date(Math.max(...dates));
      }
    }

    // Evidence types present
    const sourcesPresent = [...new Set(evidence.map((e) => e.sourceType))];

    passportSkills.push({
      skillId,
      skillName: node?.title || skillId,
      domain: node?.domain || 'general',
      type: node?.type || 'skill',
      difficulty: node?.difficulty || 'intermediate',
      estimatedLevel,
      userRating,
      confidence,
      evidenceCount: evidence.length,
      evidenceSources: sourcesPresent,
      lastAssessed,
      status: knownKeys.has(skillId) ? 'confirmed' : 'pending',
      evidence,
      nodeDetails: node
        ? {
            title: node.title,
            description: node.description,
            prerequisites: node.prerequisites || [],
            estimatedHours: node.estimatedHours,
          }
        : null,
    });
  }

  // Sort by confidence ('High', 'Medium', 'Low') then evidenceCount desc
  const rank = { High: 3, Medium: 2, Low: 1 };
  passportSkills.sort((a, b) => {
    const diff = (rank[b.confidence] || 0) - (rank[a.confidence] || 0);
    if (diff !== 0) return diff;
    return b.evidenceCount - a.evidenceCount;
  });

  return {
    userId: user._id,
    targetRoleKey: user.profile?.targetRoleKey || '',
    stats: {
      totalSkills: passportSkills.length,
      highConfidenceCount: passportSkills.filter((s) => s.confidence === 'High').length,
      mediumConfidenceCount: passportSkills.filter((s) => s.confidence === 'Medium').length,
      lowConfidenceCount: passportSkills.filter((s) => s.confidence === 'Low').length,
      totalEvidenceCount: allEvidence.length,
    },
    skills: passportSkills,
  };
}

/**
 * Scan project description against catalog and extract matching skills as PROJECT evidence.
 */
export async function extractProjectSkills({ title, description, technologies = [], catalogIndex = null }) {
  const index = catalogIndex || (await loadCatalogIndex());
  const fullText = `${title}\n${description}\n${technologies.join(', ')}`;
  const matches = scanForSkills(fullText, index);

  // Also match explicitly provided technology strings against node titles/aliases
  const explicitMatches = [];
  for (const tech of technologies) {
    const term = tech.trim().toLowerCase();
    if (!term) continue;
    for (const [key, node] of index.entries()) {
      if (
        node.title.toLowerCase() === term ||
        (node.aliases || []).some((a) => a.toLowerCase() === term) ||
        node.key === term
      ) {
        if (!matches.some((m) => m.nodeKey === node.key)) {
          explicitMatches.push({
            nodeKey: node.key,
            title: node.title,
            confidence: 'high',
            matchedOn: tech,
          });
        }
      }
    }
  }

  return [...matches, ...explicitMatches];
}
