import path from 'node:path';
import express from 'express';
import { z } from 'zod';

import CareerNode from '../models/CareerNode.js';
import SkillEvidence from '../models/SkillEvidence.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadResume, deleteUpload, UPLOAD_DIR } from '../middleware/upload.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { extractText, scanForSkills } from '../services/resumeService.js';
import { loadCatalogIndex } from '../services/roadmapService.js';

const router = express.Router();
router.use(requireAuth);

/**
 * THE RULE THIS ROUTER FOLLOWS
 * ---------------------------
 * A scan proposes; the learner confirms. `POST /upload` never touches
 * `profile.knownNodeKeys` directly — it creates unverified RESUME evidence items
 * and returns candidates with the text that triggered each one.
 * `POST /confirm` marks the selected evidence as USER_CONFIRMED and updates `profile.knownNodeKeys`.
 */

// ------------------------------------------------- POST /api/resume/upload
router.post(
  '/upload',
  uploadResume,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file received. Attach a PDF or text file in the "resume" field.');
    }

    const index = await loadCatalogIndex();

    let matches;
    try {
      const text = await extractText({
        filePath: path.join(UPLOAD_DIR, req.file.filename),
        mimetype: req.file.mimetype,
        originalName: req.file.originalname,
      });

      if (text.trim().length < 40) {
        throw ApiError.badRequest(
          'No readable text was found. If your resume is a scanned image, upload a text-based PDF or paste your skills in manually instead.'
        );
      }

      matches = scanForSkills(text, index);
    } catch (err) {
      // Do not leave an unreadable file sitting on disk.
      await deleteUpload(req.file.filename);
      throw err;
    }

    // Replace any previous upload rather than accumulating files per user.
    const previous = req.user.resume?.storedName;
    if (previous && previous !== req.file.filename) await deleteUpload(previous);

    req.user.resume = {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      uploadedAt: new Date(),
      detectedNodeKeys: matches.map((m) => m.nodeKey),
    };
    await req.user.save();

    // Clean up previous unverified resume evidence for this user
    await SkillEvidence.deleteMany({
      userId: req.user._id,
      sourceType: 'RESUME',
      verificationStatus: 'UNVERIFIED',
    });

    // Create unverified SkillEvidence records for newly detected skills
    const createdEvidenceMap = new Map();
    for (const match of matches) {
      const evidence = await SkillEvidence.create({
        userId: req.user._id,
        skillId: match.nodeKey,
        sourceType: 'RESUME',
        sourceId: req.file.originalname,
        evidenceText: `Detected in resume: "${match.matchedOn}" (confidence: ${match.confidence})`,
        skillLevel: 'intermediate',
        confidence: match.confidence === 'high' ? 'High' : match.confidence === 'medium' ? 'Medium' : 'Low',
        verificationStatus: 'UNVERIFIED',
        metadata: {
          matchedOn: match.matchedOn,
          originalName: req.file.originalname,
        },
      });
      createdEvidenceMap.set(match.nodeKey, evidence._id);
    }

    const confirmed = new Set(req.user.profile?.knownNodeKeys ?? []);

    res.json({
      resume: {
        originalName: req.user.resume.originalName,
        uploadedAt: req.user.resume.uploadedAt,
      },
      detected: matches.map((match) => ({
        ...match,
        evidenceId: createdEvidenceMap.get(match.nodeKey),
        alreadyConfirmed: confirmed.has(match.nodeKey),
        suggestTicked: match.confidence === 'high' && !confirmed.has(match.nodeKey),
      })),
      counts: {
        total: matches.length,
        high: matches.filter((m) => m.confidence === 'high').length,
        medium: matches.filter((m) => m.confidence === 'medium').length,
        low: matches.filter((m) => m.confidence === 'low').length,
      },
      message:
        matches.length === 0
          ? 'Nothing in the catalog matched your resume. You can pick your skills manually instead.'
          : 'Review these and confirm the ones that genuinely apply — skills have been staged in your Skill Passport.',
    });
  })
);

// ------------------------------------------------ POST /api/resume/confirm
/**
 * Write the learner's ticked skills into their profile and confirm evidence.
 */
router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { nodeKeys, rejectedKeys = [], mode } = z
      .object({
        nodeKeys: z.array(z.string().trim().toLowerCase()).max(300),
        rejectedKeys: z.array(z.string().trim().toLowerCase()).default([]),
        mode: z.enum(['add', 'replace']).default('add'),
      })
      .parse(req.body);

    const known = await CareerNode.find({ key: { $in: nodeKeys } }).select('key').lean();
    const validKeys = new Set(known.map((n) => n.key));
    const unknown = nodeKeys.filter((k) => !validKeys.has(k));

    if (unknown.length > 0) {
      throw ApiError.badRequest(`These are not steps in the catalog: ${unknown.join(', ')}`);
    }

    const existing = req.user.profile.knownNodeKeys ?? [];
    const merged = mode === 'replace' ? nodeKeys : [...new Set([...existing, ...nodeKeys])];

    req.user.profile.knownNodeKeys = merged;
    await req.user.save();

    // Mark confirmed evidence as USER_CONFIRMED
    if (nodeKeys.length > 0) {
      await SkillEvidence.updateMany(
        {
          userId: req.user._id,
          skillId: { $in: nodeKeys },
          sourceType: 'RESUME',
        },
        {
          $set: { verificationStatus: 'USER_CONFIRMED' },
        }
      );
    }

    // Remove or keep unverified rejected keys
    if (rejectedKeys.length > 0) {
      await SkillEvidence.deleteMany({
        userId: req.user._id,
        skillId: { $in: rejectedKeys },
        sourceType: 'RESUME',
        verificationStatus: 'UNVERIFIED',
      });
    }

    res.json({
      knownNodeKeys: req.user.profile.knownNodeKeys,
      added: nodeKeys.filter((k) => !existing.includes(k)),
      removed: mode === 'replace' ? existing.filter((k) => !nodeKeys.includes(k)) : [],
    });
  })
);

// ------------------------------------------------ POST /api/resume/reject
/**
 * Explicitly reject a single detected skill.
 */
router.post(
  '/reject',
  asyncHandler(async (req, res) => {
    const { nodeKey } = z
      .object({
        nodeKey: z.string().trim().toLowerCase(),
      })
      .parse(req.body);

    await SkillEvidence.deleteMany({
      userId: req.user._id,
      skillId: nodeKey,
      sourceType: 'RESUME',
      verificationStatus: 'UNVERIFIED',
    });

    res.json({ rejected: true, nodeKey });
  })
);

// -------------------------------------------------------- GET /api/resume
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user.resume) return res.json({ resume: null, detected: [] });

    const detectedKeys = req.user.resume.detectedNodeKeys ?? [];
    const nodes = await CareerNode.find({ key: { $in: detectedKeys } })
      .select('key title type domain estimatedHours')
      .lean();

    res.json({
      resume: {
        originalName: req.user.resume.originalName,
        uploadedAt: req.user.resume.uploadedAt,
      },
      detected: nodes,
    });
  })
);

// ----------------------------------------------------- DELETE /api/resume
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const storedName = req.user.resume?.storedName;

    req.user.resume = null;
    await req.user.save();
    await deleteUpload(storedName);

    // Also remove unverified resume evidence
    await SkillEvidence.deleteMany({
      userId: req.user._id,
      sourceType: 'RESUME',
      verificationStatus: 'UNVERIFIED',
    });

    res.json({
      deleted: true,
      knownNodeKeys: req.user.profile.knownNodeKeys ?? [],
    });
  })
);

export default router;
