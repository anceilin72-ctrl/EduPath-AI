import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  analyzeProjectDetails,
  confirmProjectEvidence,
} from '../services/projectAnalyzer.js';
import {
  analyzeCertificateDetails,
  confirmCertificateEvidence,
} from '../services/certificateAnalyzer.js';
import {
  generateProgressReport,
  calculateCategoryReadiness,
} from '../services/progressReportService.js';

const router = express.Router();
router.use(requireAuth);

// -------------------------------- GET /api/reports/progress
router.get(
  '/progress',
  asyncHandler(async (req, res) => {
    const report = await generateProgressReport(req.user._id);
    res.json({ report });
  })
);

// -------------------------------- GET /api/reports/readiness
router.get(
  '/readiness',
  asyncHandler(async (req, res) => {
    const categories = await calculateCategoryReadiness(req.user._id);
    res.json({ categories });
  })
);

// --------------------------- POST /api/reports/project/analyze
router.post(
  '/project/analyze',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1, 'Project name is required.'),
        description: z.string().optional().default(''),
        technologies: z.string().optional().default(''),
        role: z.string().optional().default(''),
      })
      .parse(req.body);

    const detected = await analyzeProjectDetails(body);
    res.json({ count: detected.length, detected });
  })
);

// --------------------------- POST /api/reports/project/confirm
router.post(
  '/project/confirm',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        projectName: z.string().trim().min(1, 'Project name is required.'),
        projectUrl: z.string().optional().default(''),
        detectedNodeKeys: z.array(z.string()).min(1, 'Select at least one skill.'),
        items: z
          .array(
            z.object({
              skillId: z.string(),
              evidenceText: z.string().optional(),
            })
          )
          .optional()
          .default([]),
      })
      .parse(req.body);

    const result = await confirmProjectEvidence({
      userId: req.user._id,
      ...body,
    });

    res.json({ ...result, message: 'Project skills added to your Skill Passport!' });
  })
);

// ----------------------- POST /api/reports/certificate/analyze
router.post(
  '/certificate/analyze',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1, 'Certificate title is required.'),
        provider: z.string().optional().default(''),
        topicsText: z.string().optional().default(''),
        credentialType: z.string().optional().default('Course Certificate'),
        credentialId: z.string().optional().default(''),
        date: z.string().optional().default(''),
      })
      .parse(req.body);

    const detected = await analyzeCertificateDetails(body);
    res.json({ count: detected.length, detected });
  })
);

// ----------------------- POST /api/reports/certificate/confirm
router.post(
  '/certificate/confirm',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1, 'Certificate title is required.'),
        provider: z.string().optional().default(''),
        credentialType: z.string().optional().default('Course Certificate'),
        credentialId: z.string().optional().default(''),
        date: z.string().optional().default(''),
        detectedNodeKeys: z.array(z.string()).min(1, 'Select at least one skill.'),
        items: z
          .array(
            z.object({
              skillId: z.string(),
              evidenceText: z.string().optional(),
            })
          )
          .optional()
          .default([]),
      })
      .parse(req.body);

    const result = await confirmCertificateEvidence({
      userId: req.user._id,
      ...body,
    });

    res.json({ ...result, message: 'Certificate evidence added to your Skill Passport!' });
  })
);

export default router;
