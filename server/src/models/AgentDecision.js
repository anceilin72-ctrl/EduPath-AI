import mongoose from 'mongoose';

/**
 * AgentDecision — every adaptive change the AI agent proposes, with full
 * audit trail. Decisions begin as PENDING and transition to ACCEPTED or REJECTED
 * by the learner. AUTO_APPLIED is reserved for low-risk automatic changes.
 *
 * The learner sees these on /plans/:id/adapt and controls which ones take effect.
 */
const agentDecisionSchema = new mongoose.Schema(
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

    /** The skill/node this decision is about. */
    skillId: { type: String, required: true, lowercase: true, trim: true },
    skillTitle: { type: String, default: '' },

    decisionType: {
      type: String,
      enum: [
        'ADD_STEP',           // Insert remediation / practice step
        'REMOVE_STEP',        // Remove a step the learner no longer needs
        'REORDER_STEP',       // Move step within plan
        'RESCHEDULE',         // Push step later due to missed/skipped
        'RECOMMEND_RESOURCE', // Suggest an external resource
        'CREATE_REASSESSMENT',// Schedule a follow-up assessment
        'ACCELERATE',         // Skip/abbreviate material the learner already knows
        'SKIP_SUGGESTION',    // Passport evidence suggests step can be skipped
      ],
      required: true,
    },

    /** Plain-English explanation of why this change is being proposed. */
    reason: { type: String, required: true },

    /** Structured evidence that drove this decision. */
    evidence: {
      scores: { type: [Number], default: [] },
      masteryStatus: { type: String, default: '' },
      weakTopics: { type: [String], default: [] },
      struggleType: { type: String, default: null },
      attemptCount: { type: Number, default: 0 },
      latestScore: { type: Number, default: null },
      sourceType: { type: String, default: '' },
    },

    /** Snapshot of what the plan looked like before this decision. */
    previousState: { type: mongoose.Schema.Types.Mixed, default: null },

    /** What the plan will look like after this decision is accepted. */
    newState: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Which adaptive steps this decision will inject (populated on accept). */
    proposedSteps: {
      type: [
        {
          _id: false,
          nodeKey: String,
          title: String,
          type: String,
          insertAfterKey: String,
          reason: String,
          estimatedHours: Number,
          resources: { type: Array, default: [] },
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'AUTO_APPLIED'],
      default: 'PENDING',
      index: true,
    },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

agentDecisionSchema.index({ userId: 1, roadmapId: 1, createdAt: -1 });
agentDecisionSchema.index({ userId: 1, status: 1 });

export default mongoose.model('AgentDecision', agentDecisionSchema);
