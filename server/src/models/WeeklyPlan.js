import mongoose from 'mongoose';

/**
 * WeeklyPlan — EduPath 2.0 Phase 5
 *
 * Stores the learner's personalized 7-day plan (Monday - Sunday) with task statuses,
 * resource recommendations, time constraints, missed task feedback, and weekly reports.
 */
const resourceItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Official Documentation', 'Tutorial', 'Video', 'Article', 'Practice', 'Assessment', 'Course', 'Documentation', 'Other'],
      default: 'Article',
    },
    url: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: '' },
    topic: { type: String, trim: true, default: '' },
    estimatedMinutes: { type: Number, min: 0, default: 30 },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true },
    title: { type: String, required: true },
    skillId: { type: String, required: true, lowercase: true, trim: true },
    estimatedMinutes: { type: Number, required: true, min: 1 },
    priority: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      default: 'MEDIUM',
    },
    resource: {
      title: { type: String, default: '' },
      url: { type: String, default: '' },
      type: { type: String, default: 'Article' },
    },
    resources: { type: [resourceItemSchema], default: [] },
    roadmapStep: { type: Number, default: 0 },
    completion: {
      type: String,
      enum: ['pending', 'completed', 'missed', 'rescheduled'],
      default: 'pending',
    },
    plannedMinutes: { type: Number, default: 0 },
    actualMinutes: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ['skill', 'concept', 'practice', 'assessment', 'project', 'revision'],
      default: 'skill',
    },
    missedReason: {
      type: String,
      enum: ['', 'No time', 'Too difficult', 'Already know', 'Not interested', 'Other'],
      default: '',
    },
    missedNotes: { type: String, default: '' },
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    dayName: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true,
    },
    date: { type: Date, required: true },
    availableMinutes: { type: Number, default: 120 },
    tasks: { type: [taskSchema], default: [] },
  },
  { _id: false }
);

const weeklyReportSchema = new mongoose.Schema(
  {
    summary: { type: String, default: '' },
    skillsImproved: { type: [String], default: [] },
    tasksCompleted: { type: Number, default: 0 },
    tasksMissed: { type: Number, default: 0 },
    avgAssessmentScore: { type: Number, default: null },
    weakAreas: { type: [String], default: [] },
    nextWeekPriorities: { type: [String], default: [] },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const weeklyPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roadmapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Roadmap',
      required: true,
      index: true,
    },
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },
    days: { type: [daySchema], default: [] },
    weeklyReport: { type: weeklyReportSchema, default: null },
  },
  { timestamps: true }
);

weeklyPlanSchema.index({ userId: 1, weekStartDate: -1 });

export default mongoose.model('WeeklyPlan', weeklyPlanSchema);
