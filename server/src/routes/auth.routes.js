import express from 'express';
import { z } from 'zod';

import User from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

const router = express.Router();

const EDUCATION_LEVELS = ['none', 'class-10', 'class-12', 'diploma', 'bachelors', 'masters', 'doctorate'];
const STATUSES = ['student', 'working', 'career-change', 'unemployed'];
const YEARS = ['', '1st-year', '2nd-year', '3rd-year', 'final-year', 'graduated'];
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

/** A study day longer than this is not a plan, it is a wish. */
const MAX_HOURS_PER_DAY = 12;


const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  // Long enough to matter, with the reason stated so the UI can show it.
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
});

const profileSchema = z
  .object({
    educationLevel: z.enum(EDUCATION_LEVELS),
    fieldOfStudy: z.string().trim().max(120),
    currentYear: z.enum(YEARS),
    currentStatus: z.enum(STATUSES),
    experienceLevel: z.enum(SKILL_LEVELS),
    knownNodeKeys: z.array(z.string().trim().toLowerCase()),
    /**
     * nodeKey -> level. `record` keeps the keys open, because they are catalog slugs
     * and the catalog grows; the values are closed, because the engine branches on
     * them and an unknown level would silently be treated as "not rated".
     */
    skillLevels: z.record(z.string().trim().toLowerCase(), z.enum(SKILL_LEVELS)),
    hoursPerDay: z
      .number()
      .min(1, 'At least 1 hour a day.')
      .max(MAX_HOURS_PER_DAY, `More than ${MAX_HOURS_PER_DAY} hours a day is not realistic.`),
    hoursPerWeek: z
      .number()
      .int()
      .min(1, 'At least 1 hour a week.')
      .max(80, 'More than 80 hours a week is not realistic.'),
    targetDate: z.coerce.date().nullable(),
    targetRoleKey: z.string().trim().toLowerCase(),
    city: z.string().trim().max(80),
    onboarded: z.boolean(),
  })
  .partial();

/** Shape sent to the client. Never includes the password hash. */
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  profile: user.profile,
  resume: user.resume
    ? {
        originalName: user.resume.originalName,
        uploadedAt: user.resume.uploadedAt,
        detectedNodeKeys: user.resume.detectedNodeKeys,
      }
    : null,
  createdAt: user.createdAt,
});

// ---------------------------------------------------------------- register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);

    // Check explicitly so the message is friendly; the unique index is still the
    // real guarantee against a race between two simultaneous signups.
    if (await User.exists({ email })) {
      throw ApiError.conflict('An account with that email already exists. Try signing in.');
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await User.hashPassword(password),
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

// ------------------------------------------------------------------- login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    // passwordHash is select:false on the model, so ask for it explicitly.
    const user = await User.findOne({ email }).select('+passwordHash');

    // One message for both "no such email" and "wrong password", so the endpoint
    // cannot be used to discover which emails have accounts.
    const invalid = ApiError.unauthorized('That email and password combination is not right.');
    if (!user) throw invalid;
    if (!(await user.verifyPassword(password))) throw invalid;

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// --------------------------------------------------------------- who am i
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

// --------------------------------------------------------- update profile
router.patch(
  '/me/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { onboarded, ...updates } = profileSchema.parse(req.body);

    // Assign field by field so an unexpected key in the body cannot overwrite
    // something outside the profile.
    for (const [field, value] of Object.entries(updates)) {
      req.user.profile[field] = value;
    }

    /**
     * Hours are stored twice — as the daily figure the learner chose and the weekly
     * figure the engine plans with — so the conversion lives here, in the one place
     * that writes them. A request that sends only hoursPerWeek (the older shape, and
     * what the "what if I had more time" control sends) still works.
     */
    if (updates.hoursPerDay !== undefined && updates.hoursPerWeek === undefined) {
      req.user.profile.hoursPerWeek = Math.min(80, Math.round(updates.hoursPerDay * 7));
    }

    // Onboarding is a one-way door: it records when setup was first finished, and
    // re-running the wizard later should not move the date.
    if (onboarded && !req.user.profile.onboardedAt) {
      req.user.profile.onboardedAt = new Date();
    }

    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);

export default router;
