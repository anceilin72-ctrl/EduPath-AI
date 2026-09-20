import mongoose from 'mongoose';

/**
 * CareerNode — one step on a career path.
 *
 * Named "CareerNode" rather than "Node" to avoid any confusion with Node.js.
 *
 * The `type` field is what lets a single engine serve every domain. A step is
 * not assumed to be a coding skill: it may be an exam you sit, a certification
 * you hold, a formal qualification you earn, or supervised experience you
 * accumulate. A UPSC roadmap and a React roadmap are both just graphs of these.
 */
const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, trim: true, default: '' },
    provider: { type: String, trim: true },
    source: { type: String, trim: true },
    topic: { type: String, trim: true },
    estimatedMinutes: { type: Number, min: 0 },
    type: {
      type: String,
      default: 'Article',
    },
    cost: { type: String, enum: ['free', 'paid', 'freemium'], default: 'free' },
    durationHours: { type: Number, min: 0 },
  },
  { _id: false }
);

const careerNodeSchema = new mongoose.Schema(
  {
    /**
     * Stable human-readable slug. Prerequisites reference nodes by this key
     * rather than by ObjectId, which keeps the seed files readable and lets the
     * team add nodes by hand without looking up database ids.
     */
    key: {
      type: String,
      required: [true, 'A career node needs a key'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: [true, 'A career node needs a title'], trim: true },
    type: {
      type: String,
      enum: ['skill', 'exam', 'certification', 'qualification', 'experience'],
      default: 'skill',
    },
    domain: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },

    /** Realistic study hours for someone starting from the prerequisites. */
    estimatedHours: { type: Number, default: 20, min: 1 },

    /**
     * Set only for steps whose length an institution fixes — a three-year
     * degree, a mandatory articleship, a licence exam cycle. When present the
     * planner schedules this node by its own duration and gives it a phase to
     * itself, instead of dividing effort by the learner's weekly availability.
     */
    fixedDurationWeeks: { type: Number, min: 1, default: undefined },

    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'intermediate',
    },

    /** Keys of nodes that must come first. Validated at seed time. */
    prerequisites: { type: [String], default: [] },

    /**
     * Alternative spellings used when scanning an uploaded resume. "js",
     * "es6" and "javascript" should all match the JavaScript node.
     */
    aliases: { type: [String], default: [] },

    resources: { type: [resourceSchema], default: [] },

    /** How a learner knows they are actually finished with this step. */
    checkpoints: { type: [String], default: [] },

    projectIdeas: { type: [String], default: [] },
  },
  { timestamps: true }
);

/** Supports the resume scanner and the skill-picker search box. */
careerNodeSchema.index({ title: 'text', aliases: 'text', description: 'text' });

export default mongoose.model('CareerNode', careerNodeSchema);
