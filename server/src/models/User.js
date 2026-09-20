import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * User — account plus the profile that drives roadmap generation.
 *
 * Everything under `profile` is an engine input. Change any of it and the next
 * generated roadmap genuinely changes shape, which is the whole premise of the
 * project.
 */
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

const profileSchema = new mongoose.Schema(
  {
    educationLevel: {
      type: String,
      enum: ['none', 'class-10', 'class-12', 'diploma', 'bachelors', 'masters', 'doctorate'],
      default: 'class-12',
    },
    fieldOfStudy: { type: String, trim: true, default: '' },
    /** Where they are in the course, e.g. '3rd-year'. Free of meaning to the engine. */
    currentYear: {
      type: String,
      enum: ['', '1st-year', '2nd-year', '3rd-year', 'final-year', 'graduated'],
      default: '',
    },
    currentStatus: {
      type: String,
      enum: ['student', 'working', 'career-change', 'unemployed'],
      default: 'student',
    },

    /** Overall self-rating. Sets the default level on the skill picker, nothing more. */
    experienceLevel: { type: String, enum: SKILL_LEVELS, default: 'beginner' },

    /** Career node keys the learner says they already have. */
    knownNodeKeys: { type: [String], default: [] },

    /**
     * Per-skill confidence: nodeKey -> 'beginner' | 'intermediate' | 'advanced'.
     *
     * A stronger signal than knownNodeKeys, which only has two states. The engine
     * prunes intermediate and advanced, and keeps beginner as half-length revision.
     */
    skillLevels: {
      type: Map,
      of: {
        type: String,
        enum: SKILL_LEVELS,
      },
      default: () => new Map(),
    },

    /**
     * Study time. `hoursPerDay` is what the learner actually chose; `hoursPerWeek`
     * is the figure the engine plans with, and is always hoursPerDay × 7 so the two
     * cannot drift. The conversion happens in the profile route, the only writer.
     */
    hoursPerDay: { type: Number, default: 2, min: 1, max: 12 },

    /** Real weekly study availability. Drives phase density and total weeks. */
    hoursPerWeek: { type: Number, default: 14, min: 1, max: 80 },

    /** Optional deadline. When set, the engine reports feasibility against it. */
    targetDate: { type: Date, default: null },

    targetRoleKey: { type: String, trim: true, lowercase: true, default: '' },
    city: { type: String, trim: true, default: '' },

    /** Phase 5: Learning preferences */
    preferredDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    learningStyle: {
      type: String,
      enum: ['video', 'reading', 'hands-on', 'project', 'mixed'],
      default: 'mixed',
    },
    difficultyPreference: {
      type: String,
      enum: ['easy', 'balanced', 'challenging'],
      default: 'balanced',
    },

    /** Set the first time the setup wizard is completed. Drives post-login routing. */
    onboardedAt: { type: Date, default: null },
  },
  { _id: false }
);

const resumeSchema = new mongoose.Schema(
  {
    originalName: { type: String, trim: true },
    storedName: { type: String, trim: true },
    uploadedAt: { type: Date },
    /** Node keys detected in the resume text, pending user confirmation. */
    detectedNodeKeys: { type: [String], default: [] },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    /**
     * `select: false` keeps the hash out of every query result by default, so a
     * careless `res.json(user)` cannot leak it.
     */
    passwordHash: { type: String, required: true, select: false },

    profile: { type: profileSchema, default: () => ({}) },
    resume: { type: resumeSchema, default: null },
  },
  { timestamps: true }
);

/** Hash a plaintext password. Kept on the model so routes never touch bcrypt. */
userSchema.statics.hashPassword = function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

/** Belt and braces: strip the hash from any serialised user. */
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
