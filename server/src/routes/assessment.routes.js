import express from 'express';
import { z } from 'zod';

import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import CareerNode from '../models/CareerNode.js';
import Role from '../models/Role.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import {
  generateAssessmentQuestions,
  submitAssessment,
} from '../services/assessmentService.js';
import { loadCatalogIndex } from '../services/roadmapService.js';

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------- POST /api/assessments/generate
/**
 * Generate a new assessment for a skill.
 * Strips correct answers and explanations before sending to client.
 */
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { skillId, difficulty = 'intermediate' } = z
      .object({
        skillId: z.string().trim().toLowerCase(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
      })
      .parse(req.body);

    const catalogIndex = await loadCatalogIndex();
    const node = catalogIndex.get(skillId);
    if (!node) {
      throw ApiError.badRequest(`Skill "${skillId}" not found in catalog.`);
    }

    const targetRoleKey = req.user.profile?.targetRoleKey;
    const role = targetRoleKey ? await Role.findOne({ key: targetRoleKey }).lean() : null;

    // Check recent weak areas from previous attempts
    const recentAttempts = await AssessmentAttempt.find({
      userId: req.user._id,
      skillId,
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    const pastWeak = [...new Set(recentAttempts.flatMap((a) => a.weakTopics || []))];

    const questions = await generateAssessmentQuestions({
      skillId,
      skillTitle: node.title,
      difficulty,
      learnerLevel: req.user.profile?.experienceLevel || 'beginner',
      targetRoleTitle: role?.title || 'Developer',
      weakAreas: pastWeak,
    });

    const assessment = await Assessment.create({
      userId: req.user._id,
      skillId,
      difficulty,
      targetRoleKey: targetRoleKey || '',
      questions,
    });

    // Strip answers from response
    const clientQuestions = questions.map((q) => ({
      questionId: q.questionId,
      type: q.type,
      question: q.question,
      options: q.options,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      codeSnippet: q.codeSnippet,
    }));

    res.status(201).json({
      assessment: {
        _id: assessment._id,
        skillId: assessment.skillId,
        skillTitle: node.title,
        difficulty: assessment.difficulty,
        questions: clientQuestions,
      },
    });
  })
);

// ---------------------------------------------------- GET /api/assessments/:id
/**
 * Retrieve assessment questions (answers redacted unless user is reviewing completed attempt).
 * Supports lookup by Assessment _id OR Skill slug (e.g., 'sql').
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const identifier = req.params.id;
    let assessment;
    const mongoose = (await import('mongoose')).default;

    // 1. Try treating identifier as Assessment _id
    if (mongoose.isValidObjectId(identifier)) {
      assessment = await Assessment.findOne({
        _id: identifier,
        userId: req.user._id,
      }).lean();
    }

    // 2. If not found by _id, treat identifier as a skill slug/key
    if (!assessment) {
      const catalogIndex = await loadCatalogIndex();
      const skillKey = identifier.toLowerCase();
      const node = catalogIndex.get(skillKey);

      if (!node) {
        throw ApiError.notFound('Skill not found in the Skill Catalog.');
      }

      // Look for an existing incomplete assessment, or just the latest one
      assessment = await Assessment.findOne({
        userId: req.user._id,
        skillId: skillKey,
      }).sort({ createdAt: -1 }).lean();

      // If they navigated via skill slug but have no assessment, generate one seamlessly
      if (!assessment) {
        const targetRoleKey = req.user.profile?.targetRoleKey;
        const role = targetRoleKey ? await Role.findOne({ key: targetRoleKey }).lean() : null;

        const questions = await generateAssessmentQuestions({
          skillId: node.key,
          skillTitle: node.title,
          difficulty: 'intermediate',
          learnerLevel: req.user.profile?.experienceLevel || 'beginner',
          targetRoleTitle: role?.title || 'Developer',
          weakAreas: [],
        });

        assessment = await Assessment.create({
          userId: req.user._id,
          skillId: node.key,
          difficulty: 'intermediate',
          targetRoleKey: targetRoleKey || '',
          questions,
        });
      }
    }

    const catalogIndex = await loadCatalogIndex();
    const node = catalogIndex.get(assessment.skillId);

    const latestAttempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const isSubmitted = Boolean(latestAttempt);

    const clientQuestions = assessment.questions.map((q) => ({
      questionId: q.questionId,
      type: q.type,
      question: q.question,
      options: q.options,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      codeSnippet: q.codeSnippet,
      ...(isSubmitted
        ? {
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          }
        : {}),
    }));

    res.json({
      assessment: {
        _id: assessment._id,
        skillId: assessment.skillId,
        skillTitle: node?.title || assessment.skillId,
        difficulty: assessment.difficulty,
        isSubmitted,
        questions: clientQuestions,
        latestAttempt: latestAttempt || null,
      },
    });
  })
);

// ---------------------------------------------------- POST /api/assessments/:id/submit
/**
 * Submit answers, grade, detect weak topics, and update Skill Passport.
 * Supports lookup by Assessment _id OR Skill slug (e.g., 'sql').
 */
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const { answers } = z
      .object({
        answers: z.array(
          z.object({
            questionId: z.string(),
            answer: z.string(),
          })
        ),
      })
      .parse(req.body);

    const identifier = req.params.id;
    let assessmentId = identifier;
    const mongoose = (await import('mongoose')).default;

    if (!mongoose.isValidObjectId(identifier)) {
      // It's likely a skill slug. Let's find the latest assessment for this skill.
      const catalogIndex = await loadCatalogIndex();
      const node = catalogIndex.get(identifier.toLowerCase());
      
      if (!node) {
        throw ApiError.notFound('Skill not found in the Skill Catalog.');
      }
      
      const assessment = await Assessment.findOne({
        userId: req.user._id,
        skillId: node.key,
      }).sort({ createdAt: -1 }).lean();

      if (!assessment) {
        throw ApiError.notFound('No active assessment found to submit for this skill.');
      }
      assessmentId = assessment._id.toString();
    }

    const result = await submitAssessment({
      assessmentId,
      user: req.user,
      answers,
    });

    res.json({ result });
  })
);

// ---------------------------------------------------- GET /api/assessments/history/all
/**
 * Get all past assessment attempts across all skills for the user.
 */
router.get(
  '/history/all',
  asyncHandler(async (req, res) => {
    const attempts = await AssessmentAttempt.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const catalogIndex = await loadCatalogIndex();

    const populated = attempts.map((att) => ({
      ...att,
      skillTitle: catalogIndex.get(att.skillId)?.title || att.skillId,
    }));

    res.json({ attempts: populated });
  })
);

// ---------------------------------------------------- GET /api/assessments/history/:skillId
/**
 * Get attempt history and mastery progression for a specific skill.
 */
router.get(
  '/history/:skillId',
  asyncHandler(async (req, res) => {
    const skillId = req.params.skillId.toLowerCase();

    const attempts = await AssessmentAttempt.find({
      userId: req.user._id,
      skillId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const catalogIndex = await loadCatalogIndex();
    const node = catalogIndex.get(skillId);

    const latest = attempts[0] || null;

    res.json({
      skillId,
      skillTitle: node?.title || skillId,
      masteryStatus: latest?.masteryStatus || 'Unknown',
      attempts,
      weakTopics: [...new Set(attempts.flatMap((a) => a.weakTopics || []))],
      strongTopics: [...new Set(attempts.flatMap((a) => a.strongTopics || []))],
    });
  })
);

export default router;
