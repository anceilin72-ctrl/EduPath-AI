import mongoose from 'mongoose';

/**
 * Role — a target the learner is aiming for.
 *
 * A role does not list every step it needs. It lists its *end* requirements and
 * lets the engine walk the prerequisite chains to discover the rest. So
 * "Full-Stack Developer" can simply require a deployed portfolio project, and
 * the engine works out that this implies React, which implies JavaScript, which
 * implies HTML and CSS. That keeps the data small and impossible to get
 * internally inconsistent.
 */
const requiredNodeSchema = new mongoose.Schema(
  {
    nodeKey: { type: String, required: true, trim: true, lowercase: true },
    importance: {
      type: String,
      enum: ['core', 'recommended', 'optional'],
      default: 'core',
    },
    /** Short note on why this matters for the role, shown in the UI. */
    rationale: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    domain: {
      type: String,
      required: true,
      enum: ['technology', 'business', 'creative', 'healthcare', 'government', 'education'],
      index: true,
    },
    description: { type: String, trim: true, default: '' },

    requiredNodes: { type: [requiredNodeSchema], default: [] },

    /**
     * Formal entry requirement, where one genuinely exists. Self-study cannot
     * substitute for a nursing degree or a law degree, and the generator says so
     * rather than pretending otherwise.
     */
    minimumEducation: {
      type: String,
      enum: ['none', 'class-10', 'class-12', 'diploma', 'bachelors', 'masters', 'doctorate'],
      default: 'none',
    },

    /** Indicative Indian market figures, annual, in rupees. */
    salaryINR: {
      entryLevel: { type: Number, min: 0 },
      experienced: { type: Number, min: 0 },
    },

    demandLevel: {
      type: String,
      enum: ['low', 'moderate', 'high', 'very-high'],
      default: 'moderate',
    },

    /** Other titles the same job is advertised under. */
    aliases: { type: [String], default: [] },

    /** Plain-language notes on how people usually enter this role. */
    typicalEntryPaths: { type: [String], default: [] },
  },
  { timestamps: true }
);

roleSchema.index({ title: 'text', aliases: 'text', description: 'text' });

export default mongoose.model('Role', roleSchema);
