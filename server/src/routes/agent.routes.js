import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getOrGenerateWeeklyPlan,
  getTodayTasks,
  handleMissedTask,
  generateWeeklyReport,
} from '../services/weeklyPlannerService.js';
import { processAgentChat } from '../services/naturalLanguageAgent.js';
import AgentActivity from '../models/AgentActivity.js';
import AgentDecision from '../models/AgentDecision.js';

const router = express.Router();

router.use(requireAuth);

// -------------------------------- GET /api/agent/weekly-plan
router.get(
  '/weekly-plan',
  asyncHandler(async (req, res) => {
    const plan = await getOrGenerateWeeklyPlan({ userId: req.user._id });
    res.json({ plan });
  })
);

// --------------------------- POST /api/agent/weekly-plan/generate
router.post(
  '/weekly-plan/generate',
  asyncHandler(async (req, res) => {
    const plan = await getOrGenerateWeeklyPlan({ userId: req.user._id, force: true });
    res.json({ plan, message: 'Weekly plan re-calculated!' });
  })
);

// ------------------------------------ GET /api/agent/today
router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const hoursParam = req.query.hours ? parseFloat(req.query.hours) : null;
    const todayData = await getTodayTasks({ userId: req.user._id, availableHours: hoursParam });
    res.json(todayData);
  })
);

// ---------------------------- POST /api/agent/tasks/:taskId/missed
router.post(
  '/tasks/:taskId/missed',
  asyncHandler(async (req, res) => {
    const { reason, notes } = z
      .object({
        reason: z.enum(['No time', 'Too difficult', 'Already know', 'Not interested', 'Other']),
        notes: z.string().optional().default(''),
      })
      .parse(req.body);

    const result = await handleMissedTask({
      userId: req.user._id,
      taskId: req.params.taskId,
      reason,
      notes,
    });

    res.json(result);
  })
);

// ---------------------------- POST /api/agent/tasks/:taskId/complete
router.post(
  '/tasks/:taskId/complete',
  asyncHandler(async (req, res) => {
    const { actualMinutes } = z
      .object({
        actualMinutes: z.number().min(0).optional(),
      })
      .parse(req.body);

    // Call service (need to import or implement in service)
    const { completeTask } = await import('../services/weeklyPlannerService.js');
    const result = await completeTask({
      userId: req.user._id,
      taskId: req.params.taskId,
      actualMinutes,
    });

    res.json(result);
  })
);

// ------------------------------------- POST /api/agent/chat
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, history } = z
      .object({
        message: z.string().trim().min(1, 'Message cannot be empty.'),
        history: z.array(z.any()).optional().default([]),
      })
      .parse(req.body);

    const response = await processAgentChat({
      userId: req.user._id,
      message,
      history,
    });

    res.json(response);
  })
);

// --------------------------------- GET /api/agent/activity
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const activities = await AgentActivity.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    res.json({ count: activities.length, activities });
  })
);

// ---------------------------- GET /api/agent/weekly-report
router.get(
  '/weekly-report',
  asyncHandler(async (req, res) => {
    const report = await generateWeeklyReport({ userId: req.user._id });
    res.json({ report });
  })
);

// --------------------------- GET /api/agent/decisions/log
/**
 * Major adaptive decision log formatted for display.
 */
router.get(
  '/decisions/log',
  asyncHandler(async (req, res) => {
    const decisions = await AgentDecision.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const log = decisions.map((d) => ({
      id: d._id,
      actionTitle: d.skillTitle ? `${d.decisionType}: ${d.skillTitle}` : d.decisionType,
      reason: d.reason,
      status: d.status,
      evidence: d.evidence,
      createdAt: d.createdAt,
    }));

    res.json({ count: log.length, log });
  })
);

export default router;
