import express from 'express';
import { z } from 'zod';

import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import Role from '../models/Role.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { summariseProgress, studyStreak } from '../services/progressService.js';
import { analyzeRoleSkillGaps } from '../services/skillGapAgent.js';
import { loadCatalogIndex } from '../services/roadmapService.js';

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/dashboard — everything the home screen of a returning learner shows.
 *
 * WHY ONE ENDPOINT INSTEAD OF FOUR
 * --------------------------------
 * The dashboard needs the current plan, progress against it, the streak and the
 * learner's goal. Fetched separately that is four round trips, four loading
 * states, and a screen that assembles itself in pieces. It is also four chances
 * for two of the numbers to disagree, because they would be read at different
 * moments. One endpoint, one snapshot, one answer.
 *
 * `hasRoadmap` and `onboarded` are here for routing: the client sends a first-time
 * learner into the setup wizard and everybody else straight here, and it needs to
 * know which without guessing from the shape of the rest of the response.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    /**
     * The browser tells us its UTC offset so day boundaries match the learner's
     * own clock. Optional — without it the server's timezone is used, which is
     * correct when both run on the same machine, as they do in development.
     */
    const { tzOffset } = z
      .object({
        tzOffset: z.coerce.number().int().min(-840).max(840).optional(),
      })
      .parse(req.query);

    const profile = req.user.profile ?? {};

    // The current plan is the newest unarchived one. Archiving is how a learner
    // says "not this any more" without deleting the history.
    const roadmap = await Roadmap.findOne({ userId: req.user._id, isArchived: false })
      .sort({ createdAt: -1 })
      .lean();

    // The streak spans every plan, not just the current one — study is study.
    const allRows = await Progress.find({ userId: req.user._id })
      .select('nodeKey roadmapId status hoursLogged completedAt startedAt')
      .lean();

    const streak = studyStreak(allRows, { offsetMinutes: tzOffset });

    if (!roadmap) {
      const goalRole = profile.targetRoleKey
        ? await Role.findOne({ key: profile.targetRoleKey }).select('key title domain').lean()
        : null;

      return res.json({
        hasRoadmap: false,
        onboarded: Boolean(profile.onboardedAt),
        user: { name: req.user.name },
        goal: goalRole ? { roleKey: goalRole.key, roleTitle: goalRole.title, roleDomain: goalRole.domain } : null,
        roadmap: null,
        progress: null,
        streak,
        studyTime: { hoursPerDay: profile.hoursPerDay ?? null, hoursPerWeek: profile.hoursPerWeek ?? null },
      });
    }

    const rows = allRows.filter((row) => String(row.roadmapId) === String(roadmap._id));
    const summary = summariseProgress(roadmap, rows);

    let nextBestAction = null;
    try {
      const catalogIndex = await loadCatalogIndex();
      const role = await Role.findOne({ key: roadmap.roleKey }).lean();
      if (role) {
        const gapAnalysis = await analyzeRoleSkillGaps({
          user: req.user,
          role,
          catalogIndex,
          activeRoadmap: roadmap,
        });
        nextBestAction = gapAnalysis.nextBestAction;
      }
    } catch {
      if (summary.nextUp?.[0]) {
        nextBestAction = {
          title: `Continue ${summary.nextUp[0].title}`,
          actionType: 'learning',
          estimatedMinutes: Math.round((summary.nextUp[0].estimatedHours || 1) * 60),
          reason: `Next step in Phase ${summary.nextUp[0].phaseIndex} of your roadmap.`,
          cta: 'Carry on',
          url: `/plans/${roadmap._id}`,
          skillId: summary.nextUp[0].nodeKey,
          skillName: summary.nextUp[0].title,
          priority: 'MEDIUM',
        };
      }
    }

    res.json({
      hasRoadmap: true,
      onboarded: Boolean(profile.onboardedAt),
      user: { name: req.user.name },
      goal: {
        roleKey: roadmap.roleKey,
        roleTitle: roadmap.roleTitle,
        roleDomain: roadmap.roleDomain,
      },
      nextBestAction,
      roadmap: {
        id: roadmap._id,
        generatedAt: roadmap.generatedAt,
        totals: roadmap.totals,
        readiness: roadmap.readiness,
        schedule: roadmap.schedule,
        phaseCount: roadmap.phases?.length ?? 0,
      },
      progress: {
        percentByNodes: summary.percentByNodes,
        percentByHours: summary.percentByHours,
        completedNodes: summary.completedNodes,
        remainingNodes: summary.remainingNodes,
        totalNodes: summary.totalNodes,
        hoursCompleted: summary.hoursCompleted,
        totalHours: summary.totalHours,
        isComplete: summary.isComplete,
        nextUp: summary.nextUp,
        phases: summary.phases,
      },
      streak,
      studyTime: { hoursPerDay: profile.hoursPerDay ?? null, hoursPerWeek: profile.hoursPerWeek ?? null },
    });
  })
);

export default router;
