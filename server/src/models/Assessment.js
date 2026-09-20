import mongoose from 'mongoose';

/**
 * Assessment — a generated test evaluating learner knowledge on a skill.
 *
 * Types supported:
 * - multiple-choice
 * - short-answer
 * - scenario
 * - coding
 * - debugging
 */
const questionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    type: {
      type: String,
      enum: ['multiple-choice', 'short-answer', 'scenario', 'coding', 'debugging'],
      default: 'multiple-choice',
    },
    question: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    /** Correct answer is omitted when sent to client before submission */
    correctAnswer: { type: String, required: true, trim: true },
    explanation: { type: String, default: '' },
    skillId: { type: String, required: true, lowercase: true, trim: true },
    subtopic: { type: String, required: true, trim: true },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'intermediate',
    },
    codeSnippet: { type: String, default: '' },
  },
  { _id: false }
);

const assessmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    skillId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'intermediate',
    },
    targetRoleKey: { type: String, trim: true, default: '' },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Assessment', assessmentSchema);
