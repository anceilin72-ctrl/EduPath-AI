import WeeklyPlan from '../models/WeeklyPlan.js';
import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import User from '../models/User.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import { loadCatalogIndex } from './roadmapService.js';
import Role from '../models/Role.js';
import ApiError from '../utils/ApiError.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function normalizeResource(res, defaultTopic = '') {
  if (!res) return null;
  const rawType = (res.type || '').toLowerCase();
  let type = 'Article';
  if (rawType.includes('doc') || rawType.includes('official')) {
    type = 'Official Documentation';
  } else if (rawType.includes('tutorial') || rawType.includes('guide') || rawType.includes('course')) {
    type = 'Tutorial';
  } else if (rawType.includes('video') || rawType.includes('youtube')) {
    type = 'Video';
  } else if (rawType.includes('practice') || rawType.includes('exercise') || rawType.includes('challenge') || rawType.includes('project')) {
    type = 'Practice';
  } else if (rawType.includes('assessment') || rawType.includes('quiz') || rawType.includes('test') || rawType.includes('exam')) {
    type = 'Assessment';
  } else if (rawType.includes('article') || rawType.includes('book') || rawType.includes('post')) {
    type = 'Article';
  }

  const estimatedMinutes = res.estimatedMinutes 
    ? Number(res.estimatedMinutes) 
    : (res.durationHours ? Math.round(Number(res.durationHours) * 60) : 30);

  return {
    title: res.title || 'Learning Resource',
    type,
    url: res.url || '',
    source: res.source || res.provider || '',
    topic: res.topic || defaultTopic || '',
    estimatedMinutes,
  };
}

export function normalizeResources(resources, defaultTopic = '') {
  if (!Array.isArray(resources) || resources.length === 0) return [];
  return resources.map((r) => normalizeResource(r, defaultTopic)).filter(Boolean);
}

/**
 * normalizeLearningTask() — the SINGLE place that converts a roadmap step
 * (adaptive step or phase node, whatever shape the roadmap engine produced)
 * into the task shape the Weekly Planner / MongoDB WeeklyPlan schema expects:
 * { title, skillId, estimatedMinutes, ... }.
 *
 * Both getOrGenerateWeeklyPlan() and getTodayTasks() need to walk the same
 * roadmap and build the same "pending nodes" list; previously that walk was
 * duplicated in two places and could drift out of sync. This is now the only
 * place that logic lives.
 */
function normalizeLearningTask(step, { type, priority, roadmapStep, defaultHours }) {
  const normalizedRes = normalizeResources(step.resources, step.title);
  return {
    skillId: step.nodeKey,
    title: step.title,
    estimatedMinutes: Math.round((step.estimatedHours || defaultHours) * 60),
    type,
    priority,
    resource: normalizedRes[0] || { title: `${step.title} Resource`, url: '', type: 'Article' },
    resources: normalizedRes,
    roadmapStep,
  };
}

/**
 * Walk a roadmap's adaptive steps and phase nodes and return every pending
 * (not-yet-completed) learning task, normalized via normalizeLearningTask().
 * Shared by plan generation and the today's-tasks time-budget path so the two
 * can never disagree about what "pending work" means.
 */
async function collectPendingNodes({ userId, roadmap }) {
  const progressRows = await Progress.find({ userId, roadmapId: roadmap._id }).lean();
  const completedKeys = new Set(
    progressRows.filter((p) => p.status === 'completed' || p.status === 'skipped').map((p) => p.nodeKey)
  );

  const recentAttempts = await AssessmentAttempt.find({ userId }).sort({ createdAt: -1 }).limit(5).lean();
  const weakTopics = new Set(recentAttempts.flatMap((a) => a.weakTopics || []));

  const pendingNodes = [];
  let stepIndex = 1;

  for (const step of roadmap.adaptiveSteps ?? []) {
    if (step.status === 'active' && !completedKeys.has(step.nodeKey)) {
      pendingNodes.push(
        normalizeLearningTask(step, {
          type: step.type || 'practice',
          priority: 'CRITICAL',
          roadmapStep: stepIndex++,
          defaultHours: 1,
        })
      );
    }
  }

  for (const phase of roadmap.phases ?? []) {
    for (const node of phase.nodes ?? []) {
      if (!completedKeys.has(node.nodeKey)) {
        pendingNodes.push(
          normalizeLearningTask(node, {
            type: 'skill',
            priority: weakTopics.has(node.nodeKey) ? 'HIGH' : 'MEDIUM',
            roadmapStep: stepIndex++,
            defaultHours: 2,
          })
        );
      }
    }
  }

  return pendingNodes;
}

export async function getOrGenerateWeeklyPlan({ userId, force = false }) {
  const weekStart = getStartOfWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  let existing = await WeeklyPlan.findOne({
    userId,
    weekStartDate: { $gte: weekStart, $lte: weekEnd },
  });

  if (existing && !force) return existing;

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');

  const roadmap = await Roadmap.findOne({ userId, isArchived: false }).sort({ createdAt: -1 });
  if (!roadmap) {
    throw new ApiError(400, 'You need an active roadmap to generate a weekly plan.');
  }

  const pendingNodes = await collectPendingNodes({ userId, roadmap });

  const preferredDays = user.profile?.preferredDays || DAY_NAMES;
  const hoursPerDay = user.profile?.hoursPerDay || 2;

  const days = DAY_NAMES.map((dayName, idx) => {
    const dayDate = new Date(weekStart.getTime() + idx * 24 * 60 * 60 * 1000);
    const isPreferred = preferredDays.includes(dayName);
    const availableMinutes = isPreferred ? hoursPerDay * 60 : 0;
    const tasks = [];

    if (availableMinutes > 0 && pendingNodes.length > 0) {
      let allocated = 0;
      while (pendingNodes.length > 0 && allocated < availableMinutes) {
        const nextNode = pendingNodes.shift();
        const taskId = `task-${idx + 1}-${nextNode.skillId}-${Date.now()}`;
        const taskDuration = Math.min(nextNode.estimatedMinutes, availableMinutes - allocated || 60);

        tasks.push({
          ...nextNode,
          taskId,
          estimatedMinutes: taskDuration,
          plannedMinutes: taskDuration,
          actualMinutes: 0,
          completion: 'pending',
        });
        allocated += taskDuration;
      }
    }

    return { dayName, date: dayDate, availableMinutes, tasks };
  });

  if (existing) {
    existing.days = days;
    await existing.save();
    return existing;
  }

  return WeeklyPlan.create({
    userId,
    roadmapId: roadmap._id,
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    days,
  });
}

export async function getTodayTasks({ userId, availableHours = null }) {
  const plan = await getOrGenerateWeeklyPlan({ userId });

  // Get today's day name consistently
  // JavaScript getDay() returns: 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
  // DAY_NAMES array is: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  // So we need to convert: Sunday(0)→6, Monday(1)→0, Tuesday(2)→1, etc.
  // Formula: (jsDay + 6) % 7
  const now = new Date();
  const jsDayIndex = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const todayIndex = (jsDayIndex + 6) % 7; // Convert to DAY_NAMES index: 0=Monday, ..., 6=Sunday
  const todayName = DAY_NAMES[todayIndex];

  const todayObj = plan.days.find((d) => d.dayName === todayName) || plan.days[0];
  let tasks = todayObj ? [...todayObj.tasks] : [];

  if (availableHours !== null && Number.isFinite(availableHours) && availableHours > 0) {
    const availableMinutes = Math.round(availableHours * 60);

    // Fetch pending nodes dynamically to assemble an optimal schedule
    // that fits the time constraint exactly.
    const roadmap = await Roadmap.findById(plan.roadmapId);
    if (!roadmap) throw ApiError.notFound('Active roadmap for this plan could not be found.');

    const allPending = await collectPendingNodes({ userId, roadmap });

    const PRIO_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    allPending.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.roadmapStep - b.roadmapStep);

    const totalAvailablePendingMinutes = allPending.reduce((sum, n) => sum + (Number(n.estimatedMinutes) || 0), 0);

    let accumulated = 0;
    const constrained = [];

    for (const node of allPending) {
      if (accumulated >= availableMinutes) break;
      const remainingTime = availableMinutes - accumulated;

      // Only add task if it can fit at least partially (minimum 5 minutes)
      const taskMinutes = Math.min(Number(node.estimatedMinutes) || 30, remainingTime);
      if (taskMinutes >= 5) {
        constrained.push({
          ...node,
          taskId: `task-dynamic-${node.skillId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          estimatedMinutes: Math.round(taskMinutes),
          plannedMinutes: Math.round(taskMinutes),
          actualMinutes: 0,
          completion: 'pending',
        });
        accumulated += Math.round(taskMinutes);
      }
    }

    // Update the plan's today object with the new filtered tasks
    const dayIndex = plan.days.findIndex((d) => d.dayName === todayName);
    if (dayIndex !== -1) {
      plan.days[dayIndex].tasks = constrained;
      plan.days[dayIndex].availableMinutes = availableMinutes;
      await plan.save();
    }

    tasks = constrained;

    return {
      dayName: todayName,
      date: todayObj?.date || now,
      availableMinutes,
      requestedHours: availableHours,
      totalPlannedMinutes: accumulated,
      totalAvailablePendingMinutes,
      tasks,
    };
  }

  const totalPlanned = tasks.reduce((sum, t) => sum + (Number(t.estimatedMinutes) || 0), 0);

  return {
    dayName: todayName,
    date: todayObj?.date || now,
    availableMinutes: todayObj?.availableMinutes || 120,
    totalPlannedMinutes: totalPlanned,
    tasks,
  };
}

export async function handleMissedTask({ userId, taskId, reason, notes = '' }) {
  const weekStart = getStartOfWeek(new Date());
  const plan = await WeeklyPlan.findOne({ userId, weekStartDate: { $gte: weekStart } });
  if (!plan) throw ApiError.notFound('Weekly plan not found.');

  let targetTask = null;
  let targetDay = null;

  for (const day of plan.days) {
    const found = day.tasks.find((t) => t.taskId === taskId);
    if (found) {
      targetTask = found;
      targetDay = day;
      break;
    }
  }

  if (!targetTask) throw ApiError.notFound('Task not found in weekly plan.');

  targetTask.completion = 'missed';
  targetTask.missedReason = reason;
  targetTask.missedNotes = notes;

  let adaptationMessage = `Task "${targetTask.title}" marked as missed (${reason}).`;

  if (reason === 'No time') {
    const nextDay = plan.days.find((d) => d.availableMinutes > 0 && d.dayName !== targetDay.dayName && d.tasks.length < 3);
    if (nextDay) {
      const rescheduledTask = {
        ...targetTask.toObject(),
        taskId: `rescheduled-${Date.now()}`,
        completion: 'pending',
        priority: 'HIGH',
      };
      nextDay.tasks.push(rescheduledTask);
      adaptationMessage += ` Rescheduled to ${nextDay.dayName}.`;
    }
  } else if (reason === 'Already know') {
    targetTask.completion = 'completed';
    targetTask.actualMinutes = Math.min(15, targetTask.plannedMinutes);
    adaptationMessage += ` Updated status to completed.`;
  }

  await plan.save();

  return { task: targetTask, plan, message: adaptationMessage };
}

export async function generateWeeklyReport({ userId }) {
  const plan = await getOrGenerateWeeklyPlan({ userId });
  const allTasks = plan.days.flatMap((d) => d.tasks);

  const completed = allTasks.filter((t) => t.completion === 'completed').length;
  const missed = allTasks.filter((t) => t.completion === 'missed').length;

  const attempts = await AssessmentAttempt.find({ userId }).sort({ createdAt: -1 }).limit(5).lean();
  const scores = attempts.map((a) => a.score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const weakTopics = [...new Set(attempts.flatMap((a) => a.weakTopics || []))];
  const skillsImproved = [...new Set(allTasks.filter((t) => t.completion === 'completed').map((t) => t.title))];

  // A report with zero completed/missed tasks and no assessment history isn't
  // "generating" — it's genuinely empty. Say so explicitly instead of showing
  // a technically-true but meaningless "0 completed, 0 missed" summary.
  const hasActivity = completed > 0 || missed > 0 || attempts.length > 0;

  const report = {
    hasActivity,
    summary: hasActivity
      ? `You completed ${completed} task(s) and missed ${missed} task(s) this week.` +
        (avgScore !== null ? ` Assessment average: ${avgScore}%.` : '')
      : 'Not enough activity yet. Complete more tasks to generate a meaningful report.',
    skillsImproved,
    tasksCompleted: completed,
    tasksMissed: missed,
    avgAssessmentScore: avgScore,
    weakAreas: weakTopics,
    nextWeekPriorities: weakTopics.length > 0 ? weakTopics : ['Continue active roadmap phase'],
    generatedAt: new Date(),
  };

  plan.weeklyReport = report;
  await plan.save();
  return report;
}

export async function completeTask({ userId, taskId, actualMinutes }) {
  const weekStart = getStartOfWeek(new Date());
  const plan = await WeeklyPlan.findOne({ userId, weekStartDate: { $gte: weekStart } });
  if (!plan) throw ApiError.notFound('Weekly plan not found.');

  let targetTask = null;

  for (const day of plan.days) {
    const found = day.tasks.find((t) => t.taskId === taskId);
    if (found) {
      targetTask = found;
      break;
    }
  }

  if (!targetTask) throw ApiError.notFound('Task not found in weekly plan.');

  targetTask.completion = 'completed';
  if (actualMinutes !== undefined) {
    targetTask.actualMinutes = actualMinutes;
  } else {
    targetTask.actualMinutes = targetTask.plannedMinutes; // fallback
  }

  // Auto-complete the underlying progress step
  await Progress.findOneAndUpdate(
    { userId, roadmapId: plan.roadmapId, nodeKey: targetTask.skillId },
    { 
      $set: { 
        status: 'completed', 
        hoursLogged: Math.round(targetTask.actualMinutes / 60 * 10) / 10 
      } 
    },
    { upsert: true }
  );

  await plan.save();
  return { task: targetTask, plan };
}
