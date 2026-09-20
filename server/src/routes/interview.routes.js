import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { conductInterview, getInterviewContext, evaluateAnswer } from '../services/interviewCoachService.js';

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/interview/context — Returns real-time interview context.
 */
router.get(
  '/context',
  asyncHandler(async (req, res) => {
    const context = await getInterviewContext(req.user._id);
    res.json({ context });
  })
);

/**
 * POST /api/interview/chat — Interactive interview coach session.
 */
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, mode, history } = z
      .object({
        message: z.string().min(1, 'Message is required'),
        mode: z.string().optional(),
        history: z.array(z.any()).optional().default([]),
      })
      .parse(req.body);

    const result = await conductInterview({
      userId: req.user._id,
      message,
      mode,
      history,
    });

    res.json(result);
  })
);

/**
 * POST /api/interview/evaluate — Evaluates a single answer deterministically.
 */
router.post(
  '/evaluate',
  asyncHandler(async (req, res) => {
    const { question, answer } = z
      .object({
        question: z.string().min(1),
        answer: z.string().min(1),
      })
      .parse(req.body);

    const context = await getInterviewContext(req.user._id);
    const feedback = evaluateAnswer({
      question,
      answer,
      context,
    });

    res.json({ feedback });
  })
);

/**
 * GET /api/interview/modes — Returns available interview modes.
 */
router.get(
  '/modes',
  asyncHandler(async (req, res) => {
    res.json({
      modes: [
        { id: 'TECHNICAL', label: 'Technical' },
        { id: 'ROLE_SPECIFIC', label: 'Role-specific' },
        { id: 'PROJECT', label: 'Project' },
        { id: 'RAPID_FIRE', label: 'Rapid-fire' },
        { id: 'MOCK', label: 'Mock Interview' },
        { id: 'HR', label: 'HR / Behavioral' }
      ]
    });
  })
);

export default router;
