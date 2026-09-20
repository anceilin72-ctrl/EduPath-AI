import mongoose from 'mongoose';

/**
 * SkillEvidence — an item of evidence backing a learner's skill claim.
 *
 * EduPath 2.0 distinguishes between:
 * - SELF_DECLARED
 * - RESUME
 * - PROJECT
 * - CERTIFICATE
 * - ASSESSMENT
 * - LEARNING_ACTIVITY
 *
 * And verification statuses:
 * - UNVERIFIED
 * - USER_CONFIRMED
 * - VERIFIED
 */
export const SOURCE_TYPES = [
  'SELF_DECLARED',
  'RESUME',
  'PROJECT',
  'CERTIFICATE',
  'ASSESSMENT',
  'LEARNING_ACTIVITY',
];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'USER_CONFIRMED', 'VERIFIED'];

export const CONFIDENCE_LEVELS = ['Low', 'Medium', 'High'];

const skillEvidenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Matches CareerNode.key
    skillId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      required: true,
    },
    /** Reference identifier if linked to a project, certificate, or resume upload */
    sourceId: {
      type: String,
      trim: true,
      default: '',
    },
    /** Snippet, title, description, or excerpt backing this evidence */
    evidenceText: {
      type: String,
      required: true,
      trim: true,
    },
    /** Claimed / estimated level if known */
    skillLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'not-specified'],
      default: 'not-specified',
    },
    confidence: {
      type: String,
      enum: CONFIDENCE_LEVELS,
      default: 'Low',
    },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'UNVERIFIED',
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
  },
  { timestamps: true }
);

skillEvidenceSchema.index({ userId: 1, skillId: 1, sourceType: 1 });

export default mongoose.model('SkillEvidence', skillEvidenceSchema);
