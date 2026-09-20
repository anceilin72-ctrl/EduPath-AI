import express from 'express';
import { z } from 'zod';

import Role from '../models/Role.js';
import Roadmap from '../models/Roadmap.js';
import SkillEvidence, {
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  CONFIDENCE_LEVELS,
} from '../models/SkillEvidence.js';
import CareerNode from '../models/CareerNode.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import {
  buildUserPassport,
  extractProjectSkills,
  calculateSkillConfidence,
} from '../services/evidenceService.js';
import { analyzeRoleSkillGaps } from '../services/skillGapAgent.js';
import { loadCatalogIndex } from '../services/roadmapService.js';
import { resolveRoleKey } from '../utils/roleNormalization.js';

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------- GET /api/skills/passport
/**
 * Return user's Skill Passport with confidence scores, evidence breakdown, and statistics.
 */
router.get(
  '/passport',
  asyncHandler(async (req, res) => {
    const passport = await buildUserPassport(req.user);
    res.json({ passport });
  })
);

// ---------------------------------------------------- GET /api/skills/gaps
/**
 * GET /api/skills/gaps — Evaluates the learner's Skill Passport against a target role.
 * Query param: ?roleKey=... (defaults to user.profile.targetRoleKey or 'frontend-developer')
 */
router.get(
  '/gaps',
  asyncHandler(async (req, res) => {
    const rawRoleKey =
      req.query.roleKey ||
      req.user.profile?.targetRoleKey ||
      'frontend-developer';
    const targetRoleKey = await resolveRoleKey(rawRoleKey);

    const [catalogIndex, role, activeRoadmap] = await Promise.all([
      loadCatalogIndex(),
      Role.findOne({ key: targetRoleKey }).lean(),
      Roadmap.findOne({ userId: req.user._id, isArchived: false }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!role) {
      throw ApiError.notFound(`Target role "${targetRoleKey}" not found in catalog.`);
    }

    const gapAnalysis = await analyzeRoleSkillGaps({
      user: req.user,
      role,
      catalogIndex,
      activeRoadmap,
    });

    res.json({ gapAnalysis });
  })
);

// ------------------------------------------------ POST /api/skills/gaps/recalculate
/**
 * POST /api/skills/gaps/recalculate — Allows switching or recalculating target role gaps
 * and optionally updates user.profile.targetRoleKey.
 */
router.post(
  '/gaps/recalculate',
  asyncHandler(async (req, res) => {
    const { roleKey, updateProfileTarget = true } = z
      .object({
        roleKey: z.string().trim().toLowerCase(),
        updateProfileTarget: z.boolean().default(true),
      })
      .parse(req.body);

    const rawRoleKey = req.body.roleKey;
    const targetRoleKey = await resolveRoleKey(rawRoleKey);

    const [catalogIndex, role, activeRoadmap] = await Promise.all([
      loadCatalogIndex(),
      Role.findOne({ key: targetRoleKey }).lean(),
      Roadmap.findOne({ userId: req.user._id, isArchived: false }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!role) {
      throw ApiError.notFound(`Target role "${targetRoleKey}" not found in catalog.`);
    }

    if (updateProfileTarget) {
      req.user.profile.targetRoleKey = targetRoleKey;
      await req.user.save();
    }

    const gapAnalysis = await analyzeRoleSkillGaps({
      user: req.user,
      role,
      catalogIndex,
      activeRoadmap,
    });

    res.json({
      gapAnalysis,
      updatedTargetRoleKey: req.user.profile.targetRoleKey,
    });
  })
);

// ------------------------------------------------ GET /api/skills/gaps/:skillId
/**
 * GET /api/skills/gaps/:skillId — Deep dive for a single skill gap in context of target role.
 */
router.get(
  '/gaps/:skillId',
  asyncHandler(async (req, res) => {
    const skillId = req.params.skillId.toLowerCase();
    const rawRoleKey =
      req.query.roleKey ||
      req.user.profile?.targetRoleKey ||
      'frontend-developer';
    const targetRoleKey = await resolveRoleKey(rawRoleKey);

    const [catalogIndex, role, evidence, activeRoadmap] = await Promise.all([
      loadCatalogIndex(),
      Role.findOne({ key: targetRoleKey }).lean(),
      SkillEvidence.find({ userId: req.user._id, skillId }).lean(),
      Roadmap.findOne({ userId: req.user._id, isArchived: false }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!role) {
      throw ApiError.notFound(`Target role "${targetRoleKey}" not found.`);
    }

    const gapAnalysis = await analyzeRoleSkillGaps({
      user: req.user,
      role,
      catalogIndex,
      activeRoadmap,
    });

    const item = gapAnalysis.skills.find((s) => s.skillId === skillId);
    if (!item) {
      throw ApiError.notFound(`Skill "${skillId}" is not part of ${role.title}'s required chain.`);
    }

    res.json({
      skillGap: item,
      evidence,
      targetRole: gapAnalysis.targetRole,
    });
  })
);

// ------------------------------------------------ POST /api/skills/projects
/**
 * Submit project evidence. Extracts skills using existing catalog matchers,
 * saves PROJECT evidence items, and optionally confirms them in the user profile.
 */
router.post(
  '/projects',
  asyncHandler(async (req, res) => {
    const { title, description, technologies, autoConfirm } = z
      .object({
        title: z.string().trim().min(2, 'Project title is required.'),
        description: z.string().trim().min(5, 'Provide a brief description.'),
        technologies: z.array(z.string().trim()).default([]),
        autoConfirm: z.boolean().default(true),
      })
      .parse(req.body);

    const matches = await extractProjectSkills({ title, description, technologies });

    const createdEvidence = [];
    const detectedSkillKeys = [];

    for (const match of matches) {
      detectedSkillKeys.push(match.nodeKey);
      const evidence = await SkillEvidence.create({
        userId: req.user._id,
        skillId: match.nodeKey,
        sourceType: 'PROJECT',
        sourceId: title,
        evidenceText: `Project "${title}": ${description.slice(0, 150)}${description.length > 150 ? '...' : ''} (matched on: ${match.matchedOn})`,
        skillLevel: 'intermediate',
        confidence: match.confidence === 'high' ? 'High' : 'Medium',
        verificationStatus: autoConfirm ? 'USER_CONFIRMED' : 'UNVERIFIED',
        metadata: {
          projectTitle: title,
          matchedOn: match.matchedOn,
        },
      });
      createdEvidence.push(evidence);
    }

    if (autoConfirm && detectedSkillKeys.length > 0) {
      const existing = req.user.profile?.knownNodeKeys || [];
      req.user.profile.knownNodeKeys = [...new Set([...existing, ...detectedSkillKeys])];
      await req.user.save();
    }

    res.status(201).json({
      project: { title, description, technologies },
      matches,
      evidenceCreated: createdEvidence,
      confirmedSkills: autoConfirm ? detectedSkillKeys : [],
    });
  })
);

// ------------------------------------------------ GET /api/skills/:skillId/evidence
/**
 * Fetch all evidence items for a specific skill for the logged-in user.
 */
router.get(
  '/:skillId/evidence',
  asyncHandler(async (req, res) => {
    const skillId = req.params.skillId.toLowerCase();

    const [evidence, index] = await Promise.all([
      SkillEvidence.find({ userId: req.user._id, skillId }).sort({ createdAt: -1 }).lean(),
      loadCatalogIndex(),
    ]);

    const node = index.get(skillId);
    const confidence = calculateSkillConfidence(evidence);

    res.json({
      skillId,
      skillTitle: node?.title || skillId,
      confidence,
      evidence,
      nodeDetails: node || null,
    });
  })
);

// ------------------------------------------------ POST /api/skills/:skillId/evidence
/**
 * Add an item of evidence to a skill (Self-declaration, certificate, project link, etc.)
 */
router.post(
  '/:skillId/evidence',
  asyncHandler(async (req, res) => {
    const skillId = req.params.skillId.toLowerCase();

    const body = z
      .object({
        sourceType: z.enum(SOURCE_TYPES),
        sourceId: z.string().trim().optional().default(''),
        evidenceText: z.string().trim().min(3, 'Evidence description is required.'),
        skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'not-specified']).default('not-specified'),
        verificationStatus: z.enum(VERIFICATION_STATUSES).default('USER_CONFIRMED'),
        confirmInProfile: z.boolean().default(true),
      })
      .parse(req.body);

    const index = await loadCatalogIndex();
    if (!index.has(skillId)) {
      throw ApiError.badRequest(`"${skillId}" is not a valid skill step in the catalog.`);
    }

    const evidence = await SkillEvidence.create({
      userId: req.user._id,
      skillId,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      evidenceText: body.evidenceText,
      skillLevel: body.skillLevel,
      confidence: body.sourceType === 'ASSESSMENT' ? 'High' : body.sourceType === 'SELF_DECLARED' ? 'Low' : 'Medium',
      verificationStatus: body.verificationStatus,
    });

    if (body.confirmInProfile) {
      const existing = req.user.profile?.knownNodeKeys || [];
      if (!existing.includes(skillId)) {
        req.user.profile.knownNodeKeys = [...existing, skillId];
      }
      if (['beginner', 'intermediate', 'advanced'].includes(body.skillLevel)) {
        if (!req.user.profile.skillLevels) {
          req.user.profile.skillLevels = new Map();
        }
        if (req.user.profile.skillLevels instanceof Map) {
          req.user.profile.skillLevels.set(skillId, body.skillLevel);
        } else {
          req.user.profile.skillLevels[skillId] = body.skillLevel;
        }
      }
      await req.user.save();
    }

    res.status(201).json({ evidence });
  })
);

// ------------------------------------------------ PATCH /api/skills/:skillId/evidence/:evidenceId
router.patch(
  '/:skillId/evidence/:evidenceId',
  asyncHandler(async (req, res) => {
    const { skillId, evidenceId } = req.params;

    const body = z
      .object({
        evidenceText: z.string().trim().min(3).optional(),
        verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
        skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'not-specified']).optional(),
        confidence: z.enum(CONFIDENCE_LEVELS).optional(),
      })
      .parse(req.body);

    const evidence = await SkillEvidence.findOne({
      _id: evidenceId,
      userId: req.user._id,
      skillId: skillId.toLowerCase(),
    });

    if (!evidence) {
      throw ApiError.notFound('Evidence record not found.');
    }

    if (body.evidenceText !== undefined) evidence.evidenceText = body.evidenceText;
    if (body.verificationStatus !== undefined) evidence.verificationStatus = body.verificationStatus;
    if (body.skillLevel !== undefined) evidence.skillLevel = body.skillLevel;
    if (body.confidence !== undefined) evidence.confidence = body.confidence;

    await evidence.save();

    if (evidence.verificationStatus === 'USER_CONFIRMED' || evidence.verificationStatus === 'VERIFIED') {
      const existing = req.user.profile?.knownNodeKeys || [];
      if (!existing.includes(evidence.skillId)) {
        req.user.profile.knownNodeKeys = [...existing, evidence.skillId];
        await req.user.save();
      }
    }

    res.json({ evidence });
  })
);

// ------------------------------------------------ DELETE /api/skills/:skillId/evidence/:evidenceId
router.delete(
  '/:skillId/evidence/:evidenceId',
  asyncHandler(async (req, res) => {
    const { skillId, evidenceId } = req.params;

    const evidence = await SkillEvidence.findOneAndDelete({
      _id: evidenceId,
      userId: req.user._id,
      skillId: skillId.toLowerCase(),
    });

    if (!evidence) {
      throw ApiError.notFound('Evidence record not found.');
    }

    const remaining = await SkillEvidence.countDocuments({
      userId: req.user._id,
      skillId: skillId.toLowerCase(),
      verificationStatus: { $in: ['USER_CONFIRMED', 'VERIFIED'] },
    });

    res.json({
      deleted: true,
      remainingEvidenceCount: remaining,
    });
  })
);

export default router;
