import express from 'express';
import { z } from 'zod';

import Role from '../models/Role.js';
import { requireAuth } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { analyseGap, rankRoleFit } from '../services/resumeService.js';
import { loadCatalogIndex } from '../services/roadmapService.js';
import { EDUCATION_RANK } from '../engine/generate.js';

const router = express.Router();
router.use(requireAuth);

/**
 * Gap analysis and role fit.
 *
 * These answer questions a full roadmap does not. A roadmap says "here is the
 * path to the job you named"; this router answers "how far off am I?" and,
 * more usefully for somebody undecided, "which of these am I nearest to?".
 *
 * Both are cheap because they skip ordering, phasing and scheduling — which is
 * what makes it practical to score all thirty roles in one request.
 */

/** Skills to analyse against: the confirmed profile, plus optional extras. */
function skillsFor(user, extra = []) {
  return [...new Set([...(user.profile?.knownNodeKeys ?? []), ...extra])];
}

/**
 * The learner's per-skill levels as a plain object.
 *
 * `profile.skillLevels` is a Mongoose Map on a hydrated document. Object.entries on
 * a Map returns an empty array rather than throwing, so skipping this conversion
 * would silently drop every level the learner set.
 */
function levelsFor(user) {
  const levels = user.profile?.skillLevels;
  if (!levels) return {};
  return levels instanceof Map ? Object.fromEntries(levels) : { ...levels };
}

/**
 * Flag an education requirement the learner does not yet meet.
 *
 * Reported rather than used to filter roles out. Somebody in class 12 aiming at
 * the civil services has not made a mistake — they just need to know a degree is
 * part of the path.
 */
function educationNote(role, user) {
  const need = EDUCATION_RANK[role.minimumEducation] ?? 0;
  const have = EDUCATION_RANK[user.profile?.educationLevel ?? 'none'] ?? 0;

  if (have >= need) return null;

  return {
    level: 'warning',
    message: `${role.title} normally requires ${role.minimumEducation.replace('-', ' ')} as a minimum. Your profile says ${(user.profile?.educationLevel ?? 'none').replace('-', ' ')}, so factor that in — the hours below do not include it.`,
  };
}

// -------------------------------------- POST /api/analysis/gap
router.post(
  '/gap',
  asyncHandler(async (req, res) => {
    const { roleKey, extraSkills, includeOptional } = z
      .object({
        roleKey: z.string().trim().toLowerCase().min(1, 'Choose a role to compare against.'),
        // Lets the UI ask "what if I also had these?" without saving anything.
        extraSkills: z.array(z.string().trim().toLowerCase()).max(300).default([]),
        includeOptional: z.boolean().default(false),
      })
      .parse(req.body);

    const [index, role] = await Promise.all([
      loadCatalogIndex(),
      Role.findOne({ key: roleKey }).lean(),
    ]);

    if (!role) throw ApiError.notFound(`No target role with the key "${roleKey}".`);

    const knownNodeKeys = skillsFor(req.user, extraSkills);
    const skillLevels = levelsFor(req.user);
    const gap = analyseGap({ role, index, knownNodeKeys, skillLevels, includeOptional });
    const note = educationNote(role, req.user);

    res.json({
      gap,
      notes: note ? [note] : [],
      basedOn: {
        confirmedSkillCount: req.user.profile?.knownNodeKeys?.length ?? 0,
        extraSkillCount: extraSkills.length,
        ratedSkillCount: Object.keys(skillLevels).length,
      },
    });
  })
);

// -------------------------------------- GET /api/analysis/role-fit
router.get(
  '/role-fit',
  asyncHandler(async (req, res) => {
    const { limit, domain, includeResumeSkills } = z
      .object({
        limit: z.coerce.number().int().min(1).max(30).default(8),
        domain: z.string().trim().toLowerCase().optional(),
        // Query strings are strings, so compare against the literal — coercing
        // with Boolean() would turn "false" into true.
        includeResumeSkills: z
          .string()
          .optional()
          .transform((value) => value === 'true'),
      })
      .parse(req.query);

    const index = await loadCatalogIndex();

    const filter = domain ? { domain } : {};
    const roles = await Role.find(filter).lean();

    if (roles.length === 0) {
      throw ApiError.notFound(domain ? `No roles in the "${domain}" domain.` : 'No roles in the catalog.');
    }

    /**
     * Unconfirmed resume detections are opt-in. Folding them in by default would
     * quietly rank roles using skills the learner never agreed they had.
     */
    const extra = includeResumeSkills ? (req.user.resume?.detectedNodeKeys ?? []) : [];
    const knownNodeKeys = skillsFor(req.user, extra);

    const ranking = rankRoleFit({ roles, index, knownNodeKeys, skillLevels: levelsFor(req.user), limit });


    res.json({
      ranking: ranking.map((entry) => {
        const role = roles.find((r) => r.key === entry.roleKey);
        return { ...entry, educationNote: educationNote(role, req.user) };
      }),
      basedOn: {
        skillCount: knownNodeKeys.length,
        includedUnconfirmedResumeSkills: includeResumeSkills,
        rolesConsidered: roles.length,
      },
      message:
        knownNodeKeys.length === 0
          ? 'Add some skills to your profile — or upload a resume — and this ranking becomes meaningful.'
          : `Ranked ${roles.length} roles against ${knownNodeKeys.length} skill(s) you have.`,
    });
  })
);

export default router;
