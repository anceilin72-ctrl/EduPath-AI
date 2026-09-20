import mongoose from 'mongoose';

/**
 * AssessmentAttempt — record of a completed or submitted assessment attempt.
 */
const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    userAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, required: true },
    subtopic: { type: String, default: '' },
  },
  { _id: false }
);

const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    skillId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    answers: { type: [answerSchema], default: [] },
    score: { type: Number, required: true, min: 0, max: 100 },
    weakTopics: { type: [String], default: [] },
    strongTopics: { type: [String], default: [] },
    repeatedMistakes: { type: [String], default: [] },
    masteryStatus: {
      type: String,
      enum: ['Unknown', 'Introduced', 'Learning', 'Developing', 'Proficient', 'Strong', 'Needs Review'],
      default: 'Developing',
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ userId: 1, skillId: 1, createdAt: -1 });

export default mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
