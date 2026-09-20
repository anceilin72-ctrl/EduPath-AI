/**
 * progressReportService.js — EduPath 2.0 Phase 6
 *
 * Compiles comprehensive progress reports and evidence-based category readiness.
 * No fake "job guarantee" percentages. Groups skills by technical domain
 * (Core Programming, Machine Learning, Deep Learning, Web & Deployment, Data Engineering)
 * and assigns honest evidence-based categories: Strong, Developing, Needs Work.
 */

import User from '../models/User.js';
import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import SkillEvidence from '../models/SkillEvidence.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import { loadCatalogIndex } from './roadmapService.js';
import { analyseGap } from './resumeService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Categorize skills into evidence-based readiness levels.
 */
export async function calculateCategoryReadiness(userId) {
  const [user, index, evidences, attempts] = await Promise.all([
    User.findById(userId),
    loadCatalogIndex(),
    SkillEvidence.find({ userId }).lean(),
    AssessmentAttempt.find({ userId }).lean(),
  ]);

  if (!user) throw ApiError.notFound('User not found.');

  const knownSet = new Set(user.profile?.knownNodeKeys || []);
  const evidenceMap = new Map(); // skillId -> list of evidences
  for (const e of evidences) {
    const list = evidenceMap.get(e.skillId) || [];
    list.push(e);
    evidenceMap.set(e.skillId, list);
  }

  const attemptMap = new Map(); // skillId -> best attempt score
  for (const a of attempts) {
    const prev = attemptMap.get(a.skillId) || 0;
    attemptMap.set(a.skillId, Math.max(prev, a.score));
  }

  // Domain categories
  const categories = {
    'Core Programming & CS': [],
    'Machine Learning & AI': [],
    'Deep Learning & Frameworks': [],
    'Web & Deployment': [],
    'Database & Engineering': [],
  };

  for (const node of index.values()) {
    const isKnown = knownSet.has(node.key);
    const nodeEvidences = evidenceMap.get(node.key) || [];
    const bestScore = attemptMap.get(node.key) || null;

    let status = 'Needs Work';
    if (bestScore !== null && bestScore >= 85 && nodeEvidences.length > 0) {
      status = 'Strong';
    } else if (isKnown || nodeEvidences.length > 0 || (bestScore !== null && bestScore >= 60)) {
      status = 'Developing';
    }

    const domainKey =
      node.category === 'machine-learning' || node.key.includes('ml') || node.key.includes('python')
        ? 'Machine Learning & AI'
        : node.key.includes('deep-learning') || node.key.includes('pytorch') || node.key.includes('tf')
        ? 'Deep Learning & Frameworks'
        : node.key.includes('web') || node.key.includes('react') || node.key.includes('node') || node.key.includes('deploy')
        ? 'Web & Deployment'
        : node.key.includes('sql') || node.key.includes('mongo') || node.key.includes('data')
        ? 'Database & Engineering'
        : 'Core Programming & CS';

    categories[domainKey].push({
      skillId: node.key,
      title: node.title,
      status,
      score: bestScore,
      evidenceCount: nodeEvidences.length,
    });
  }

  // Format final summary per category
  return Object.entries(categories).map(([categoryName, items]) => {
    const strongCount = items.filter((i) => i.status === 'Strong').length;
    const devCount = items.filter((i) => i.status === 'Developing').length;
    const categoryStatus = strongCount > 2 ? 'Strong' : devCount > 0 || strongCount > 0 ? 'Developing' : 'Needs Work';

    return {
      categoryName,
      status: categoryStatus,
      skills: items.slice(0, 6), // top skills per category
    };
  });
}

/**
 * Generate comprehensive progress report.
 */
export async function generateProgressReport(userId) {
  const [user, roadmap, progressRows, evidences, attempts] = await Promise.all([
    User.findById(userId),
    Roadmap.findOne({ userId, isArchived: false }).sort({ createdAt: -1 }).lean(),
    Progress.find({ userId }).lean(),
    SkillEvidence.find({ userId }).lean(),
    AssessmentAttempt.find({ userId }).lean(),
  ]);

  if (!user) throw ApiError.notFound('User not found.');

  const completedNodes = progressRows.filter((p) => p.status === 'completed').length;
  const totalHoursLogged = progressRows.reduce((sum, p) => sum + (p.hoursLogged || 0), 0);

  const scores = attempts.map((a) => a.score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const persistentStruggles = [...new Set(attempts.filter((a) => a.masteryStatus === 'Needs Review' || a.score < 60).map((a) => a.skillId))];
  const categories = await calculateCategoryReadiness(userId);

  return {
    targetRole: roadmap?.roleTitle || user.profile?.targetRoleKey || 'Software Engineer',
    skillsAcquired: user.profile?.knownNodeKeys || [],
    skillsDeveloping: Array.from(new Set(evidences.map((e) => e.skillId))),
    remainingGapsCount: roadmap?.totals?.nodeCount ? roadmap.totals.nodeCount - completedNodes : 0,
    totalLearningHours: totalHoursLogged,
    assessmentAvgScore: avgScore,
    persistentStruggles,
    categories,
    recommendedNextSteps: roadmap?.phases?.[0]?.nodes?.slice(0, 3)?.map((n) => n.title) || ['Continue active roadmap phase'],
  };
}
