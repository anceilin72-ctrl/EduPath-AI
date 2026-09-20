import express from 'express';
import { z } from 'zod';

import Progress from '../models/Progress.js';
import SkillEvidence from '../models/SkillEvidence.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { getOwnedRoadmap } from '../services/roadmapService.js';
import { summariseProgress, progressByNodeKey, flattenNodes } from '../services/progressService.js';

const router = express.Router();
router.use(requireAuth);

const updateSchema = z
  .object({
    status: z.enum(['not-started', 'in-progress', 'completed', 'skipped']),
    hoursLogged: z.number().min(0).max(10_000),
    notes: z.string().trim().max(2000),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one of status, hoursLogged or notes.',
  });

// -------------------------------------------- GET /api/progress/:roadmapId
router.get(
  '/:roadmapId',
  asyncHandler(async (req, res) => {
    const roadmap = await getOwnedRoadmap(req.params.roadmapId, req.user._id);
    const rows = await Progress.find({ userId: req.user._id, roadmapId: roadmap._id }).lean();

    res.json({
      roadmapId: roadmap._id,
      progress: progressByNodeKey(rows),
      summary: summariseProgress(roadmap, rows),
    });
  })
);

// ---------------------------------- PUT /api/progress/:roadmapId/:nodeKey
/**
 * Record progress on one step.
 *
 * PUT rather than POST because it is idempotent — sending the same body twice
 * leaves the same state, which matters when a checkbox gets double-clicked.
 */
router.put(
  '/:roadmapId/:nodeKey',
  asyncHandler(async (req, res) => {
    const updates = updateSchema.parse(req.body);
    const nodeKey = String(req.params.nodeKey).toLowerCase();

    const roadmap = await getOwnedRoadmap(req.params.roadmapId, req.user._id);

    /**
     * Confirm the step is actually in this plan before writing a row for it.
     * Skipping this check would let a typo create orphan progress rows that
     * never show up in the UI but still count toward nothing — silent data rot
     * that is painful to debug later.
     */
    const inPlan = flattenNodes(roadmap).some((n) => n.nodeKey === nodeKey);
    if (!inPlan) {
      throw ApiError.badRequest(`"${nodeKey}" is not a step in this roadmap.`);
    }

    // Timestamps follow the status rather than being sent by the client, so they
    // cannot disagree with it.
    const set = { ...updates };
    if (updates.status === 'in-progress') set.startedAt = new Date();
    if (updates.status === 'completed') {
      set.completedAt = new Date();
      set.startedAt = set.startedAt ?? new Date();
    }
    if (updates.status === 'not-started') {
      set.startedAt = null;
      set.completedAt = null;
    }

    /**
     * Upsert. The unique index on (userId, roadmapId, nodeKey) means two
     * simultaneous requests cannot create duplicate rows — one wins, the other
     * updates.
     */
    const row = await Progress.findOneAndUpdate(
      { userId: req.user._id, roadmapId: roadmap._id, nodeKey },
      { $set: set, $setOnInsert: { userId: req.user._id, roadmapId: roadmap._id, nodeKey } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    /**
     * Feedback loop: when a step is completed, create a LEARNING_ACTIVITY evidence
     * record in the Skill Passport. This closes the loop:
     *   Roadmap → Progress → Evidence → Skill Gap → Roadmap
     *
     * Uses findOneAndUpdate with upsert so toggling a step completed twice
     * doesn't create duplicate evidence.
     */
    if (updates.status === 'completed') {
      const stepNode = flattenNodes(roadmap).find((n) => n.nodeKey === nodeKey);
      const stepTitle = stepNode?.title || nodeKey;
      await SkillEvidence.findOneAndUpdate(
        {
          userId: req.user._id,
          skillId: nodeKey,
          sourceType: 'LEARNING_ACTIVITY',
          sourceId: `roadmap:${roadmap._id}`,
        },
        {
          $set: {
            evidenceText: `Completed roadmap step "${stepTitle}" in ${roadmap.roleTitle || 'career'} roadmap.`,
            skillLevel: 'intermediate',
            confidence: 'Medium',
            verificationStatus: 'USER_CONFIRMED',
            metadata: {
              roadmapId: String(roadmap._id),
              roadmapRole: roadmap.roleTitle || roadmap.roleKey || '',
              completedAt: new Date().toISOString(),
            },
          },
          $setOnInsert: {
            userId: req.user._id,
            skillId: nodeKey,
            sourceType: 'LEARNING_ACTIVITY',
            sourceId: `roadmap:${roadmap._id}`,
          },
        },
        { upsert: true, new: true }
      );
    }

    // Return the recalculated summary so the dashboard updates from one round
    // trip instead of re-fetching everything after every tick.
    const rows = await Progress.find({ userId: req.user._id, roadmapId: roadmap._id }).lean();

    res.json({
      nodeKey,
      progress: {
        status: row.status,
        hoursLogged: row.hoursLogged,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        notes: row.notes,
      },
      summary: summariseProgress(roadmap, rows),
    });
  })
);

// ----------------------------------------- DELETE /api/progress/:roadmapId
/** Reset a plan back to untouched. */
router.delete(
  '/:roadmapId',
  asyncHandler(async (req, res) => {
    const roadmap = await getOwnedRoadmap(req.params.roadmapId, req.user._id);
    const { deletedCount } = await Progress.deleteMany({
      userId: req.user._id,
      roadmapId: roadmap._id,
    });

    res.json({ reset: true, clearedSteps: deletedCount });
  })
);

export default router;
