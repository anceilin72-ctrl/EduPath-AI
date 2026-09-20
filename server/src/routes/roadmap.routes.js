import express from 'express';
import { z } from 'zod';

import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import AgentDecision from '../models/AgentDecision.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  generateForUser,
  createRoadmapForUser,
  getOwnedRoadmap,
} from '../services/roadmapService.js';
import { buildNarrative } from '../services/narrative.js';
import { summariseProgress, progressByNodeKey } from '../services/progressService.js';
import {
  runAdaptationForSkill,
  applyDecision,
  rejectDecision,
} from '../services/adaptiveAgent.js';

const router = express.Router();

/** Everything here belongs to a specific learner, so the whole router is gated. */
router.use(requireAuth);

const EDUCATION_LEVELS = ['none', 'class-10', 'class-12', 'diploma', 'bachelors', 'masters', 'doctorate'];
const STATUSES = ['student', 'working', 'career-change', 'unemployed'];
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

/**
 * Per-request overrides. These do not change the saved profile — they let the UI
 * offer "what if I studied 20 hours a week instead of 10" as a throwaway
 * experiment, which is the most useful thing a planner like this can answer.
 */
const overridesSchema = z
  .object({
    educationLevel: z.enum(EDUCATION_LEVELS),
    currentStatus: z.enum(STATUSES),
    knownNodeKeys: z.array(z.string().trim().toLowerCase()),
    skillLevels: z.record(z.string().trim().toLowerCase(), z.enum(SKILL_LEVELS)),
    hoursPerWeek: z.number().int().min(1, 'At least 1 hour a week.').max(80, 'More than 80 hours a week is not realistic.'),
    targetDate: z.coerce.date().nullable(),
    includeOptional: z.boolean(),
  })
  .partial();

const generateSchema = overridesSchema.extend({
  roleKey: z.string().trim().toLowerCase().min(1, 'Choose a target role.'),
});

/** Summary fields for the "my roadmaps" list — the full plan is large. */
const LIST_FIELDS = 'roleKey roleTitle roleDomain totals readiness schedule input isArchived createdAt updatedAt';

// ------------------------------------------- POST /api/roadmaps/preview
/**
 * Generate without saving. Declared before "/:id" so "preview" is never read as
 * an id, and kept separate from the save route so a learner can compare a few
 * scenarios without filling their dashboard with drafts.
 */
router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const { roleKey, ...overrides } = generateSchema.parse(req.body);
    const roadmap = await generateForUser({ user: req.user, roleKey, overrides });

    /**
     * Preview narration stays rule-based. Someone comparing four scenarios would
     * otherwise trigger four Gemini calls for text they are about to discard —
     * slow, and wasteful of a quota that is often a free tier.
     */
    const narrative = await buildNarrative(roadmap, { useAI: false });

    res.json({ roadmap: { ...roadmap, narrative }, saved: false });
  })
);

// --------------------------------------------------- POST /api/roadmaps
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { roleKey, ...overrides } = generateSchema.parse(req.body);
    const roadmap = await createRoadmapForUser({ user: req.user, roleKey, overrides });
    res.status(201).json({ roadmap, saved: true });
  })
);

// ---------------------------------------------------- GET /api/roadmaps
router.get(
  '/',
  asyncHandler(async (req, res) => {
    /**
     * Query strings are always strings, and Boolean('false') is true — so
     * z.coerce.boolean() here would silently treat ?includeArchived=false as
     * true. Compare against the literal instead.
     */
    const { includeArchived } = z
      .object({
        includeArchived: z
          .string()
          .optional()
          .transform((value) => value === 'true'),
      })
      .parse(req.query);

    const filter = { userId: req.user._id };
    if (!includeArchived) filter.isArchived = false;

    const roadmaps = await Roadmap.find(filter).select(LIST_FIELDS).sort({ createdAt: -1 }).lean();

    res.json({ count: roadmaps.length, roadmaps });
  })
);

// ------------------------------------------------ GET /api/roadmaps/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const roadmap = await getOwnedRoadmap(req.params.id, req.user._id);

    const rows = await Progress.find({ userId: req.user._id, roadmapId: roadmap._id }).lean();

    res.json({
      roadmap,
      // Sent alongside rather than merged into the stored plan, so the snapshot
      // in the database stays exactly what the engine produced.
      progress: progressByNodeKey(rows),
      summary: summariseProgress(roadmap, rows),
    });
  })
);

// -------------------------------------- POST /api/roadmaps/:id/regenerate
/**
 * Rebuild a plan against the learner's current profile, replacing the old one.
 *
 * Progress rows are deliberately kept: they are keyed by node key, so anything
 * still in the new plan stays ticked off. Rows for steps that dropped out are
 * removed so they cannot skew the new summary.
 */
router.post(
  '/:id/regenerate',
  asyncHandler(async (req, res) => {
    const existing = await getOwnedRoadmap(req.params.id, req.user._id);
    const overrides = overridesSchema.parse(req.body ?? {});

    const fresh = await generateForUser({
      user: req.user,
      roleKey: existing.roleKey,
      overrides,
    });

    // .set() rather than Object.assign so Mongoose applies its casting to the
    // nested phase and schedule subdocuments instead of storing raw objects.
    // The narrative is rewritten too — the old one described the old numbers.
    existing.set({ ...fresh, narrative: await buildNarrative(fresh) });
    await existing.save();

    const keptKeys = (existing.phases ?? []).flatMap((p) => p.nodes.map((n) => n.nodeKey));
    await Progress.deleteMany({
      userId: req.user._id,
      roadmapId: existing._id,
      nodeKey: { $nin: keptKeys },
    });

    const rows = await Progress.find({ userId: req.user._id, roadmapId: existing._id }).lean();

    res.json({
      roadmap: existing,
      progress: progressByNodeKey(rows),
      summary: summariseProgress(existing, rows),
    });
  })
);

// --------------------------------------- PATCH /api/roadmaps/:id/archive
router.patch(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const { isArchived } = z.object({ isArchived: z.boolean() }).parse(req.body);

    const roadmap = await getOwnedRoadmap(req.params.id, req.user._id);
    roadmap.isArchived = isArchived;
    await roadmap.save();

    res.json({ roadmap: { id: roadmap._id, isArchived: roadmap.isArchived } });
  })
);

// --------------------------------------------- DELETE /api/roadmaps/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const roadmap = await getOwnedRoadmap(req.params.id, req.user._id);

    // Delete the progress rows too. Without this they linger forever, pointing at
    // a roadmap that no longer exists.
    await Progress.deleteMany({ userId: req.user._id, roadmapId: roadmap._id });
    await roadmap.deleteOne();

    res.json({ deleted: true, id: req.params.id });
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE LAYER (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

// -------------------------------- POST /api/roadmaps/:id/adapt
/**
 * Run the adaptive agent for a skill.
 *
 * Body: { skillId: string }
 *
 * Creates one or more AgentDecision records with status PENDING.
 * Does NOT modify the roadmap until the learner accepts the decision.
 */
router.post(
  '/:id/adapt',
  asyncHandler(async (req, res) => {
    const { skillId } = z
      .object({ skillId: z.string().trim().toLowerCase().min(1) })
      .parse(req.body);

    const decisions = await runAdaptationForSkill({
      userId: req.user._id,
      roadmapId: req.params.id,
      skillId,
    });

    res.json({
      count: decisions.length,
      decisions,
      message:
        decisions.length > 0
          ? `${decisions.length} adaptive decision(s) created. Review them on your Adaptive Roadmap page.`
          : 'No adaptation needed for this skill right now.',
    });
  })
);

// ------------------------- GET /api/roadmaps/:id/adaptation-history
/**
 * Full adaptation history: adaptive steps applied + their decisions.
 */
router.get(
  '/:id/adaptation-history',
  asyncHandler(async (req, res) => {
    const roadmap = await getOwnedRoadmap(req.params.id, req.user._id);

    const decisions = await AgentDecision.find({
      roadmapId: roadmap._id,
      userId: req.user._id,
      status: { $in: ['ACCEPTED', 'AUTO_APPLIED'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      adaptiveSteps: roadmap.adaptiveSteps ?? [],
      adaptationHistory: roadmap.adaptationHistory ?? [],
      appliedDecisions: decisions,
    });
  })
);

// ---------------------------- GET /api/roadmaps/:id/agent-decisions
/**
 * List all agent decisions, optionally filtered by status.
 * Query: ?status=PENDING|ACCEPTED|REJECTED|AUTO_APPLIED
 */
router.get(
  '/:id/agent-decisions',
  asyncHandler(async (req, res) => {
    await getOwnedRoadmap(req.params.id, req.user._id); // ownership check

    const { status } = z
      .object({
        status: z
          .enum(['PENDING', 'ACCEPTED', 'REJECTED', 'AUTO_APPLIED'])
          .optional(),
      })
      .parse(req.query);

    const filter = { roadmapId: req.params.id, userId: req.user._id };
    if (status) filter.status = status;

    const decisions = await AgentDecision.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ count: decisions.length, decisions });
  })
);

// -------------------- POST /api/roadmaps/:id/decisions/:did/accept
/**
 * Accept a pending decision — injects the proposed adaptive steps into the roadmap.
 */
router.post(
  '/:id/decisions/:did/accept',
  asyncHandler(async (req, res) => {
    const { decision, roadmap } = await applyDecision(
      req.params.did,
      req.user._id
    );

    res.json({
      decision,
      adaptiveSteps: roadmap.adaptiveSteps,
      adaptationHistory: roadmap.adaptationHistory,
      message: `Decision accepted. ${decision.proposedSteps?.length ?? 0} step(s) added to your roadmap.`,
    });
  })
);

// -------------------- POST /api/roadmaps/:id/decisions/:did/reject
/**
 * Reject a pending decision — marks it dismissed, no roadmap change.
 */
router.post(
  '/:id/decisions/:did/reject',
  asyncHandler(async (req, res) => {
    const decision = await rejectDecision(req.params.did, req.user._id);
    res.json({ decision, message: 'Decision rejected. Your roadmap is unchanged.' });
  })
);

export default router;

