import mongoose from 'mongoose';
import CareerNode from '../models/CareerNode.js';
import Role from '../models/Role.js';
import Roadmap from '../models/Roadmap.js';
import SkillEvidence from '../models/SkillEvidence.js';
import { buildNodeIndex } from '../engine/graph.js';
import { generateRoadmap } from '../engine/generate.js';
import { allNodes } from '../data/index.js';
import { allRoles } from '../data/roles.js';
import { buildNarrative } from './narrative.js';
import ApiError from '../utils/ApiError.js';

/**
 * The layer between HTTP and the pure engine.
 *
 * The engine knows nothing about Mongo or Express. This module does the
 * translation: fetch the catalog, merge the stored profile with any per-request
 * overrides, call the engine, and persist the result.
 */

/**
 * The node catalog is read on every generation but changes only when someone
 * runs the seeder, so it is cached in process. The TTL exists so that re-seeding
 * a running server is picked up within a minute rather than requiring a restart.
 */
const CATALOG_TTL_MS = 60_000;
let catalogCache = { index: null, loadedAt: 0 };

export async function loadCatalogIndex({ force = false } = {}) {
  const fresh = Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS;
  if (!force && catalogCache.index && fresh) return catalogCache.index;

  let nodes = [];
  try {
    // If not connected to Mongo, fallback to static catalog nodes
    if (mongoose.connection.readyState !== 1) {
      nodes = allNodes;
    } else {
      nodes = await CareerNode.find({}).lean();
    }
  } catch (err) {
    nodes = allNodes;
  }

  if (!nodes || nodes.length === 0) {
    nodes = allNodes;
  }

  const index = buildNodeIndex(nodes);
  catalogCache = { index, loadedAt: Date.now() };
  return index;
}

/** Drop the cache — used by tests and after a reseed. */
export function invalidateCatalogCache() {
  catalogCache = { index: null, loadedAt: 0 };
}

/**
 * Merge the learner's saved profile with any overrides sent on the request.
 *
 * Overrides let the UI offer "what if I could do 20 hours a week instead of 10"
 * without the user having to permanently edit their profile.
 */
export function resolveProfile(user, overrides = {}) {
  const saved = user?.profile ?? {};

  const merged = {
    educationLevel: overrides.educationLevel ?? saved.educationLevel ?? 'class-12',
    currentStatus: overrides.currentStatus ?? saved.currentStatus ?? 'student',
    knownNodeKeys: overrides.knownNodeKeys ?? saved.knownNodeKeys ?? [],
    skillLevels: overrides.skillLevels ?? saved.skillLevels ?? {},
    hoursPerWeek: overrides.hoursPerWeek ?? saved.hoursPerWeek ?? 10,
    targetDate: overrides.targetDate ?? saved.targetDate ?? null,
    includeOptional: overrides.includeOptional ?? false,
  };

  // Mongoose arrays are not plain arrays; the engine spreads this, so normalise.
  merged.knownNodeKeys = [...merged.knownNodeKeys];

  // Same for skillLevels, which is a Mongoose Map on a hydrated document and a plain
  // object on a `.lean()` one. The engine calls Object.entries, which returns nothing
  // at all for a Map — a silent wrong answer rather than an error, so convert here.
  merged.skillLevels =
    merged.skillLevels instanceof Map
      ? Object.fromEntries(merged.skillLevels)
      : { ...merged.skillLevels };

  return merged;
}

/**
 * Generate a roadmap without saving it. Used by the preview endpoint so a
 * learner can experiment with different availability before committing.
 *
 * EduPath 2.0 integration: Checks verified/confirmed evidence from the Skill
 * Passport. If a skill has confirmed high/medium evidence, ensure it is treated
 * as known and not repeatedly placed in the roadmap as a fresh beginner step.
 */
export async function generateForUser({ user, roleKey, overrides = {}, now = new Date() }) {
  const [index, dbRole, confirmedEvidences] = await Promise.all([
    loadCatalogIndex(),
    Role.findOne({ key: String(roleKey).toLowerCase() }).lean().catch(() => null),
    user?._id
      ? SkillEvidence.find({
          userId: user._id,
          verificationStatus: { $in: ['USER_CONFIRMED', 'VERIFIED'] },
        }).lean().catch(() => [])
      : Promise.resolve([]),
  ]);

  const role = dbRole || allRoles.find((r) => r.key === String(roleKey).toLowerCase()) || allRoles.find((r) => (r.aliases || []).includes(String(roleKey).toLowerCase()));

  if (!role) {
    throw ApiError.notFound(`No target role with the key "${roleKey}".`);
  }

  const profile = resolveProfile(user, overrides);

  // Augment profile from confirmed Skill Evidence if not already present
  const evidencedKeys = new Set(confirmedEvidences.map((e) => e.skillId));
  const currentKnown = new Set(profile.knownNodeKeys);
  for (const k of evidencedKeys) {
    currentKnown.add(k);
  }
  profile.knownNodeKeys = [...currentKnown];

  // If a skill has High confidence or multiple confirmed evidences, promote level if unset
  for (const ev of confirmedEvidences) {
    if (ev.skillLevel && ['intermediate', 'advanced'].includes(ev.skillLevel) && !profile.skillLevels[ev.skillId]) {
      profile.skillLevels[ev.skillId] = ev.skillLevel;
    }
  }

  return generateRoadmap({ role, nodes: index, profile, now });
}

/**
 * Generate and persist.
 *
 * The generated snapshot is stored rather than regenerated on every view. That is
 * deliberate: progress is recorded against specific node keys, so regenerating on
 * each load would reshuffle a plan somebody is halfway through. Regenerating is
 * an explicit action.
 */
export async function createRoadmapForUser({ user, roleKey, overrides = {} }) {
  const roadmap = await generateForUser({ user, roleKey, overrides });

  /**
   * The narrative is written once, when the plan is saved.
   *
   * buildNarrative never rejects — with no API key, or if Gemini is slow, down or
   * returns something that fails validation, it falls back to the rule-based
   * writer. So this cannot fail a roadmap request.
   */
  const narrative = await buildNarrative(roadmap);

  return Roadmap.create({
    userId: user._id,
    ...roadmap,
    narrative,
  });
}

/**
 * Fetch one roadmap, refusing to return another user's.
 *
 * Checking ownership in the query rather than after the fetch means an id-guessing
 * attempt cannot even confirm that the id exists.
 */
export async function getOwnedRoadmap(roadmapId, userId) {
  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId });
  if (!roadmap) throw ApiError.notFound('Roadmap not found.');
  return roadmap;
}
