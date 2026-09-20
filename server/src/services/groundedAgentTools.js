/**
 * groundedAgentTools.js — EduPath 2.0 Phase 5
 *
 * Provides grounded database context to the Natural Language AI Agent:
 * - User Profile & Learning Preferences
 * - Skill Passport (evidence, confidence levels)
 * - Skill Gaps (strong, developing, weak, gap statuses & priorities)
 * - Current Roadmap (phases, progress, adaptive steps)
 * - Today's Tasks
 * - Assessment History
 * - Weak Areas
 * - Overall Progress Summary
 */

import User from '../models/User.js';
import SkillEvidence from '../models/SkillEvidence.js';
import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import WeeklyPlan from '../models/WeeklyPlan.js';
import Role from '../models/Role.js';
import { analyzeRoleSkillGaps } from './skillGapAgent.js';
import { summariseProgress } from './progressService.js';
import { getTodayTasks } from './weeklyPlannerService.js';
import { loadCatalogIndex } from './roadmapService.js';
import { resolveRoleKey } from '../utils/roleNormalization.js';

export async function getUserProfile(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    profile: user.profile || {},
  };
}

export async function getSkillPassport(userId) {
  const evidences = await SkillEvidence.find({ userId }).lean();
  return evidences.map((e) => ({
    skillId: e.skillId,
    sourceType: e.sourceType,
    evidenceText: e.evidenceText,
    confidence: e.confidence,
    verificationStatus: e.verificationStatus,
    skillLevel: e.skillLevel,
  }));
}

export async function getSkillGaps(userId, targetRoleKey = null) {
  const user = await User.findById(userId);
  if (!user) return null;

  // analyzeRoleSkillGaps needs a resolved Role DOCUMENT plus the node
  // catalog and active roadmap — not a bare role key string. Passing just
  // the key here used to silently produce `gaps: null` for every AI Tutor
  // question, because the mismatch threw inside analyzeRoleSkillGaps and
  // the caller's .catch(() => null) swallowed it.
  const rawRoleKey = targetRoleKey || user.profile?.targetRoleKey || 'frontend-developer';
  const roleKey = await resolveRoleKey(rawRoleKey);

  const [role, catalogIndex, activeRoadmap] = await Promise.all([
    Role.findOne({ key: roleKey }).lean(),
    loadCatalogIndex(),
    Roadmap.findOne({ userId, isArchived: false }).sort({ createdAt: -1 }).lean(),
  ]);

  if (!role) return null;

  return analyzeRoleSkillGaps({ user, role, catalogIndex, activeRoadmap });
}

export async function getCurrentRoadmap(userId) {
  const roadmap = await Roadmap.findOne({ userId, isArchived: false }).sort({ createdAt: -1 }).lean();
  if (!roadmap) return null;

  const rows = await Progress.find({ userId, roadmapId: roadmap._id }).lean();
  const summary = summariseProgress(roadmap, rows);

  return {
    id: roadmap._id,
    roleKey: roadmap.roleKey,
    roleTitle: roadmap.roleTitle,
    roleDomain: roadmap.roleDomain,
    totals: roadmap.totals,
    summary,
    phasesCount: roadmap.phases?.length ?? 0,
    adaptiveStepsCount: roadmap.adaptiveSteps?.length ?? 0,
    adaptiveSteps: roadmap.adaptiveSteps ?? [],
    phases: roadmap.phases ?? [],
  };
}

export async function getAssessmentHistory(userId, skillId = null) {
  const filter = { userId };
  if (skillId) filter.skillId = skillId;

  const attempts = await AssessmentAttempt.find(filter).sort({ createdAt: -1 }).lean();
  return attempts.map((a) => ({
    id: a._id,
    skillId: a.skillId,
    score: a.score,
    masteryStatus: a.masteryStatus,
    weakTopics: a.weakTopics,
    strongTopics: a.strongTopics,
    repeatedMistakes: a.repeatedMistakes,
    completedAt: a.completedAt,
  }));
}

/**
 * The user's actual scheduled tasks for today, from the real Weekly Plan —
 * not a guess derived from skill gaps. This is what "What should I learn
 * today?" should be answered from.
 */
export async function getTodayPlan(userId) {
  try {
    return await getTodayTasks({ userId });
  } catch {
    // No active roadmap / plan yet — the agent should say so rather than invent one.
    return null;
  }
}

export async function getWeakAreas(userId) {
  const attempts = await AssessmentAttempt.find({ userId }).lean();
  const weakMap = new Map(); // topic -> count

  for (const a of attempts) {
    for (const topic of a.weakTopics || []) {
      weakMap.set(topic, (weakMap.get(topic) || 0) + 1);
    }
  }

  return Array.from(weakMap.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getGroundedContext(userId) {
  const [profile, passport, gaps, roadmap, attempts, weakAreas, todayPlan] = await Promise.all([
    getUserProfile(userId),
    getSkillPassport(userId),
    getSkillGaps(userId).catch(() => null),
    getCurrentRoadmap(userId),
    getAssessmentHistory(userId),
    getWeakAreas(userId),
    getTodayPlan(userId),
  ]);

  return {
    profile,
    passport,
    gaps,
    roadmap,
    attempts,
    weakAreas,
    todayPlan,
  };
}
