import mongoose from 'mongoose';

/**
 * Roadmap — a generated plan, stored as a snapshot.
 *
 * WHY STORE THE WHOLE THING RATHER THAN REGENERATE ON DEMAND
 * ---------------------------------------------------------
 * A learner's progress is pinned to specific phases and nodes. If the catalog
 * later gains a new prerequisite, regenerating on every page load would silently
 * reshuffle a plan somebody is halfway through. Storing the output, together
 * with the `input` snapshot that produced it, means the plan is stable and
 * auditable, and we can show exactly which inputs produced it. Regeneration is
 * an explicit user action.
 *
 * This is also why the nested phase data is denormalised rather than referencing
 * CareerNode documents — MongoDB suits this shape well, and it is a large part
 * of why the project uses MongoDB rather than a relational store.
 */
const phaseNodeSchema = new mongoose.Schema(
  {
    nodeKey: { type: String, required: true },
    title: String,
    type: String,
    difficulty: String,
    estimatedHours: Number,
    /** The step's catalog hours, when a beginner rating cut them. Null otherwise. */
    fullHours: Number,
    /** True when this step is revision rather than new learning. */
    isRevision: { type: Boolean, default: false },
    /** What the learner rated themselves at this step, if they rated it. */
    selfRatedLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced', null] },
    description: String,

    prerequisites: { type: [String], default: [] },
    resources: { type: Array, default: [] },
    checkpoints: { type: [String], default: [] },
    projectIdeas: { type: [String], default: [] },
    /** Longest prerequisite chain leading here; used by the UI to lock items. */
    depth: Number,
  },
  { _id: false }
);

const phaseSchema = new mongoose.Schema(
  {
    index: Number,
    title: String,
    focus: String,
    hours: Number,
    weeks: Number,
    startWeek: Number,
    endWeek: Number,
    /** True when this phase is a fixed-length programme (degree, articleship). */
    calendarBound: Boolean,
    nodes: { type: [phaseNodeSchema], default: [] },
  },
  { _id: false }
);

const roadmapSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    roleKey: { type: String, required: true, index: true },
    roleTitle: String,
    roleDomain: String,

    engineVersion: String,
    generatedAt: { type: Date, default: Date.now },

    /** Exactly what was fed to the engine — makes any result reproducible. */
    input: {
      knownNodeKeys: { type: [String], default: [] },
      /** nodeKey -> 'beginner' | 'intermediate' | 'advanced'. */
      skillLevels: { type: Map, of: String, default: () => new Map() },
      hoursPerWeek: Number,
      targetDate: Date,
      educationLevel: String,
      currentStatus: String,
      includeOptional: Boolean,
      weeksPerPhase: Number,
    },

    totals: {
      hours: Number,
      weeks: Number,
      months: Number,
      nodeCount: Number,
      phaseCount: Number,
    },

    readiness: {
      requiredNodeCount: Number,
      alreadyMetCount: Number,
      remainingNodeCount: Number,
      percentComplete: Number,
      hoursSaved: Number,
      /* Hours-based readiness — what the interface shows. See the engine for why
         there are two measures and why they disagree. */
      requiredHours: Number,
      metHours: Number,
      revisionCount: Number,
      revisionCreditHours: Number,
      percentHoursComplete: Number,
    },

    schedule: {
      startDate: Date,
      projectedFinishDate: Date,
      targetDate: Date,
      weeksAvailable: Number,
      onTrack: Boolean,
      requiredHoursPerWeek: Number,
      shortfallWeeks: Number,
    },

    phases: { type: [phaseSchema], default: [] },

    /** Nodes pruned because the learner already had them, each with a reason. */
    skipped: {
      type: [
        {
          _id: false,
          nodeKey: String,
          title: String,
          importance: String,
          level: String,
          hoursSaved: Number,
          reason: String,
          inferred: Boolean,
        },
      ],
      default: [],
    },

    notes: {
      type: [{ _id: false, level: String, message: String }],
      default: [],
    },

    narrative: {
      summary: { type: String, default: '' },
      phaseNotes: { type: [String], default: [] },
      /** 'ai' when Gemini wrote it, 'rule-based' when the fallback did. */
      source: { type: String, enum: ['ai', 'rule-based'], default: 'rule-based' },
    },

    /**
     * Adaptive Layer (Phase 4)
     *
     * Steps injected by the Adaptive Agent. These live outside the original
     * `phases` array so the engine snapshot stays untouched. The UI renders
     * them inline at the position indicated by `insertAfterKey`.
     */
    adaptiveSteps: {
      type: [
        {
          _id: false,
          nodeKey: { type: String, required: true },
          title: String,
          /** 'adaptive-resource' | 'reassessment' | 'practice' | 'concept' */
          type: { type: String, default: 'adaptive-resource' },
          /** The original phase node key after which this step appears. */
          insertAfterKey: String,
          reason: String,
          estimatedHours: { type: Number, default: 1 },
          resources: { type: Array, default: [] },
          decisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentDecision' },
          addedAt: { type: Date, default: Date.now },
          /** 'active' | 'completed' | 'skipped' */
          status: { type: String, default: 'active' },
        },
      ],
      default: [],
    },

    /** Append-only audit log of adaptation events. */
    adaptationHistory: {
      type: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          summary: String,
          decisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentDecision' },
        },
      ],
      default: [],
    },

    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Most common query: this user's roadmaps, newest first. */
roadmapSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Roadmap', roadmapSchema);
