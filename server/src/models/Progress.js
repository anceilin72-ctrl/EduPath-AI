import mongoose from 'mongoose';

/**
 * Progress — one row per (user, roadmap, node).
 *
 * Kept in its own collection rather than embedded in the roadmap because it is
 * written far more often than the plan itself: ticking off a skill or logging an
 * hour should not rewrite a document containing every phase and resource.
 */
const progressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },

    nodeKey: { type: String, required: true },

    status: {
      type: String,
      enum: ['not-started', 'in-progress', 'completed', 'skipped'],
      default: 'not-started',
    },

    /** Hours the learner actually logged, versus the node's estimate. */
    hoursLogged: { type: Number, default: 0, min: 0 },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

/**
 * One progress row per node per roadmap. The unique index makes the upsert in
 * the progress route safe against double-clicks and concurrent requests.
 */
progressSchema.index({ userId: 1, roadmapId: 1, nodeKey: 1 }, { unique: true });

export default mongoose.model('Progress', progressSchema);
