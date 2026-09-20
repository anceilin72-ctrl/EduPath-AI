import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { teachTopic, getTutorContext, generateDeterministicLesson } from '../services/aiTutorService.js';

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/tutor/context — Returns real-time learning context for tutor.
 */
router.get(
  '/context',
  asyncHandler(async (req, res) => {
    const context = await getTutorContext(req.user._id);
    res.json({ context });
  })
);

/**
 * POST /api/tutor/chat — Interactive pedagogical instruction.
 * Follows the 9-part teaching flow and prompts student for answers.
 */
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, topic, history } = z
      .object({
        message: z.string().min(1, 'Message is required'),
        topic: z.string().optional(),
        history: z.array(z.any()).optional().default([]),
      })
      .parse(req.body);

    const result = await teachTopic({
      userId: req.user._id,
      message,
      topic,
      history,
    });

    res.json(result);
  })
);

/**
 * POST /api/tutor/explain — Generates structured lesson for a specific topic.
 */
router.post(
  '/explain',
  asyncHandler(async (req, res) => {
    const { topic, userLevel } = z
      .object({
        topic: z.string().min(1),
        userLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      })
      .parse(req.body);

    const context = await getTutorContext(req.user._id);
    const lesson = generateDeterministicLesson({
      topic,
      userLevel: userLevel || context.userLevel,
      context,
    });

    res.json({ lesson });
  })
);

export default router;
