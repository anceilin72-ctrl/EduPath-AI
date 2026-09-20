import mongoose from 'mongoose';

/**
 * AgentActivity — EduPath 2.0 Phase 5
 *
 * Log of all actions taken or recommended by the Natural Language AI Agent
 * (e.g. "Detected ML weakness", "Recommended ML revision", "Added assessment").
 */
const agentActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: { type: String, required: true },
    reason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

agentActivitySchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model('AgentActivity', agentActivitySchema);
