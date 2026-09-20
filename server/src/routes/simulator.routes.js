import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { simulateCareerPath, applySimulatedPath } from '../services/careerSimulator.js';
import CareerNode from '../models/CareerNode.js';
import Role from '../models/Role.js';
import { collectRequiredNodes, buildNodeIndex } from '../engine/graph.js';
import { allNodes, allRoles } from '../data/index.js';

const router = express.Router();
router.use(requireAuth);

// ─────────────────────── GET /api/simulator/skills ──────────────────────────
/**
 * Return the skill catalog nodes relevant to a given role (or all nodes).
 * Used by the frontend to populate the "What if I already know…" multi-select.
 *
 * Query params:
 *   roleKey  (optional) — filter to only nodes required by this role
 */
router.get(
  '/skills',
  asyncHandler(async (req, res) => {
    const roleKey = req.query.roleKey ? String(req.query.roleKey).toLowerCase() : null;

    let nodes = [];
    try {
      nodes = await CareerNode.find({}).select('key title domain difficulty estimatedHours').lean();
    } catch {
      nodes = allNodes;
    }
    if (!nodes.length) nodes = allNodes;

    if (roleKey) {
      // Find relevant node keys for this role
      let role = null;
      try {
        role = await Role.findOne({ key: roleKey }).lean();
      } catch { /* ignore */ }
      if (!role) role = allRoles.find((r) => r.key === roleKey);

      if (role) {
        const index = buildNodeIndex(nodes);
        const required = collectRequiredNodes(role, index, { includeOptional: true });
        const relevantKeys = new Set(required.keys());
        nodes = nodes.filter((n) => relevantKeys.has(n.key));
      }
    }

    res.json({ skills: nodes.map((n) => ({ key: n.key, title: n.title, domain: n.domain })) });
  })
);

// ─────────────────── POST /api/simulator/simulate ───────────────────────────
/**
 * Perform a non-destructive what-if simulation comparing the current active
 * roadmap against a different target role or what-if parameters.
 */
router.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const {
      targetRoleKey,
      hoursPerDay,
      daysPerWeek,
      pace,
      extraKnownKeys,
      targetDate,
    } = z
      .object({
        targetRoleKey: z.string().trim().transform((s) => s.toLowerCase()).optional(),
        hoursPerDay: z.number().min(0.5, 'Study hours must be at least 0.5 hours per day.').max(24, 'Study hours cannot exceed 24 hours per day.').optional(),
        daysPerWeek: z.number().int().min(1, 'Study days must be at least 1 day per week.').max(7, 'Study days cannot exceed 7 days per week.').optional().default(5),
        pace: z.enum(['relaxed', 'normal', 'intensive']).optional().default('normal'),
        extraKnownKeys: z.array(z.string()).optional().default([]),
        targetDate: z.coerce.date().optional(),
      })
      .parse(req.body);

    const simulation = await simulateCareerPath({
      user: req.user,
      targetRoleKey,
      overrides: { hoursPerDay, daysPerWeek, pace, extraKnownKeys, targetDate },
    });

    res.json(simulation);
  })
);

// ─────────────────────── POST /api/simulator/apply ──────────────────────────
/**
 * Confirm and switch active roadmap to the simulated path.
 */
router.post(
  '/apply',
  asyncHandler(async (req, res) => {
    const { targetRoleKey, hoursPerDay, daysPerWeek, extraKnownKeys } = z
      .object({
        targetRoleKey: z
          .string()
          .trim()
          .transform((s) => s.toLowerCase())
          .min(1, 'Target role key is required.'),
        hoursPerDay: z.number().min(0.5, 'Study hours must be at least 0.5 hours per day.').max(24, 'Study hours cannot exceed 24 hours per day.').optional(),
        daysPerWeek: z.number().int().min(1, 'Study days must be at least 1 day per week.').max(7, 'Study days cannot exceed 7 days per week.').optional().default(5),
        extraKnownKeys: z.array(z.string()).optional().default([]),
      })
      .parse(req.body);

    const newRoadmap = await applySimulatedPath({
      user: req.user,
      targetRoleKey,
      overrides: { hoursPerDay, daysPerWeek, extraKnownKeys },
    });

    res.json({
      roadmap: newRoadmap,
      message: `Your active path has been updated to ${newRoadmap.roleTitle}!`,
    });
  })
);

export default router;


