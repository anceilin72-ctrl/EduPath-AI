/**
 * careerSimulator.js — EduPath 2.0 Phase 6 (upgraded Phase 12)
 *
 * What-If Career Simulator:
 * Performs non-destructive simulation comparing current active roadmap against:
 * - A different target role (e.g., AI Engineer vs ML Engineer)
 * - Available daily/weekly hours overrides (hoursPerDay × daysPerWeek)
 * - Extra known skill overrides (multi-select, mapped to canonical node keys)
 * - Learning pace (relaxed / normal / intensive)
 * - Target deadline
 *
 * Does NOT mutate the active database Roadmap until `applySimulatedPath` is
 * explicitly invoked.
 */

import Role from '../models/Role.js';
import CareerNode from '../models/CareerNode.js';
import Roadmap from '../models/Roadmap.js';
import { generateForUser, createRoadmapForUser, loadCatalogIndex } from './roadmapService.js';
import { resolveRoleKey } from '../utils/roleNormalization.js';
import { allNodes } from '../data/index.js';
import ApiError from '../utils/ApiError.js';

// ─────────────────────────────── pace multipliers ───────────────────────────
// These adjust how many effective hours/week the engine sees.
// relaxed = fewer effective hours → longer duration
// intensive = more effective hours → shorter duration
const PACE_MULTIPLIER = {
  relaxed: 0.75,
  normal: 1.0,
  intensive: 1.35,
};

// ────────────────────── flexible skill-name → node-key map ──────────────────
let _skillAliasMap = null;

async function getSkillAliasMap() {
  if (_skillAliasMap) return _skillAliasMap;

  let nodes = [];
  try {
    nodes = await CareerNode.find({}).select('key title').lean();
  } catch {
    nodes = allNodes;
  }
  if (!nodes.length) nodes = allNodes;

  const map = new Map();
  for (const n of nodes) {
    map.set(n.key.toLowerCase(), n.key);
    map.set(n.title.toLowerCase(), n.key);
    map.set(n.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(), n.key);
    map.set(n.title.toLowerCase().replace(/\s+/g, '-'), n.key);
  }

  // Hand-authored common aliases for convenient override input
  const handAlias = {
    python: 'python-basics',
    'python programming': 'python-basics',
    sql: 'sql',
    javascript: 'javascript',
    js: 'javascript',
    react: 'react',
    git: 'git-version-control',
    github: 'git-version-control',
    docker: 'docker',
    kubernetes: 'kubernetes',
    k8s: 'kubernetes',
    'machine learning': 'machine-learning-basics',
    ml: 'machine-learning-basics',
    'deep learning': 'deep-learning',
    numpy: 'pandas-numpy',
    pandas: 'pandas-numpy',
    'pandas/numpy': 'pandas-numpy',
    statistics: 'statistics-fundamentals',
    excel: 'excel-spreadsheets',
    typescript: 'typescript',
    figma: 'figma',
    'html css': 'html-css',
    html: 'html-css',
    css: 'html-css',
    'node.js': 'nodejs-express',
    node: 'nodejs-express',
    express: 'nodejs-express',
    mongodb: 'mongodb',
    linux: 'linux-administration',
    aws: 'cloud-fundamentals-aws',
    ci: 'ci-cd',
    cicd: 'ci-cd',
  };
  for (const [alias, nodeKey] of Object.entries(handAlias)) {
    map.set(alias, nodeKey);
  }

  _skillAliasMap = map;
  return map;
}

/**
 * Resolve a list of flexible skill names/keys to canonical node keys.
 * Unknown names are silently dropped so bad input cannot break a simulation.
 */
async function resolveSkillKeys(names = []) {
  if (!names.length) return [];
  const aliasMap = await getSkillAliasMap();
  const resolved = new Set();
  for (const name of names) {
    const cleaned = String(name).toLowerCase().trim();
    const found = aliasMap.get(cleaned);
    if (found) resolved.add(found);
  }
  return [...resolved];
}

/** Extract a flat list of node keys from a generated roadmap's phases array. */
function extractNodeKeys(roadmap) {
  return (roadmap.phases || []).flatMap((p) => (p.nodes || []).map((n) => n.nodeKey ?? n.key));
}

/** Build a diff between current and simulated node lists. */
function buildNodeDiff(currentNodes, simulatedNodes) {
  const currentSet = new Set(currentNodes);
  const simulatedSet = new Set(simulatedNodes);
  return {
    added: simulatedNodes.filter((k) => !currentSet.has(k)),
    removed: currentNodes.filter((k) => !simulatedSet.has(k)),
  };
}

// ─────────────────────────────── main exports ────────────────────────────────

export async function simulateCareerPath({ user, targetRoleKey, overrides = {} }) {
  const {
    hoursPerDay,
    daysPerWeek = 5,
    pace = 'normal',
    extraKnownKeys: rawKnownKeys = [],
    targetDate,
  } = overrides;

  // ── resolve target role ──────────────────────────────────────────────────
  const currentRoadmap = await Roadmap.findOne({ userId: user._id, isArchived: false })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);

  const rawRoleKey = targetRoleKey || currentRoadmap?.roleKey || 'frontend-developer';
  const roleKey = await resolveRoleKey(rawRoleKey);
  const targetRoleDoc = await Role.findOne({ key: roleKey }).lean().catch(() => null);
  if (!targetRoleDoc) {
    throw ApiError.notFound('The selected career role could not be found. Please select another role.');
  }

  // ── resolve skill overrides → canonical node keys ────────────────────────
  const resolvedKnownKeys = await resolveSkillKeys(rawKnownKeys);

  // ── compute effective hoursPerWeek ───────────────────────────────────────
  const effectiveHoursPerDay =
    Number.isFinite(hoursPerDay) && hoursPerDay > 0
      ? hoursPerDay
      : (user.profile?.hoursPerDay ?? 2);
  const effectiveDaysPerWeek = Math.min(7, Math.max(1, daysPerWeek));
  const rawHoursPerWeek = effectiveHoursPerDay * effectiveDaysPerWeek;
  const paceMultiplier = PACE_MULTIPLIER[pace] ?? 1.0;
  const effectiveHoursPerWeek = Math.max(1, rawHoursPerWeek * paceMultiplier);

  // ── build simulated overrides (no DB write) ──────────────────────────────
  const simulatedOverrides = {
    hoursPerWeek: effectiveHoursPerWeek,
    targetDate: targetDate || null,
    knownNodeKeys: [
      ...new Set([...(user.profile?.knownNodeKeys || []), ...resolvedKnownKeys]),
    ],
  };

  const simulatedRoadmap = await generateForUser({
    user,
    roleKey,
    overrides: simulatedOverrides,
  });

  // ── current path metrics ─────────────────────────────────────────────────
  const currentHours = currentRoadmap?.totals?.hours ?? 0;
  const currentWeeks = currentRoadmap?.totals?.weeks ?? 0;
  const currentNodeKeys = currentRoadmap
    ? (currentRoadmap.phases || []).flatMap((p) => (p.nodes || []).map((n) => n.nodeKey ?? n.key))
    : [];

  const simHours = simulatedRoadmap.totals.hours;
  const simWeeks = simulatedRoadmap.totals.weeks;
  const simNodeKeys = extractNodeKeys(simulatedRoadmap);

  // ── node diff ────────────────────────────────────────────────────────────
  const catalogIndex = await loadCatalogIndex();
  const toTitle = (key) => catalogIndex.get(key)?.title ?? key;

  const nodeDiff = buildNodeDiff(currentNodeKeys, simNodeKeys);
  const skillsAdded = nodeDiff.added.map((k) => ({ nodeKey: k, title: toTitle(k) }));
  const skillsRemoved = nodeDiff.removed.map((k) => ({ nodeKey: k, title: toTitle(k) }));

  // Skills that were in the role requirements but skipped because of overrides
  const simSkipped = (simulatedRoadmap.skipped || [])
    .filter((s) => resolvedKnownKeys.includes(s.nodeKey))
    .map((s) => ({ nodeKey: s.nodeKey, title: s.title, hoursSaved: s.hoursSaved ?? 0 }));

  // ── simulated skill gaps ─────────────────────────────────────────────────
  const savedLevels =
    user.profile?.skillLevels instanceof Map
      ? Object.fromEntries(user.profile.skillLevels)
      : { ...(user.profile?.skillLevels ?? {}) };

  const LEVEL_RANK = { 'not demonstrated': 0, beginner: 1, intermediate: 2, advanced: 3 };

  const skillGaps = simNodeKeys
    .map((key) => {
      const node = catalogIndex.get(key);
      const currentLevel = savedLevels[key] ?? 'not demonstrated';
      const targetLevel = node?.difficulty ?? 'intermediate';
      const currentRank = LEVEL_RANK[currentLevel] ?? 0;
      const targetRank = LEVEL_RANK[targetLevel] ?? 2;
      const gapLevels = Math.max(0, targetRank - currentRank);
      return { nodeKey: key, title: node?.title ?? key, currentLevel, targetLevel, gapLevels };
    })
    .filter((g) => g.gapLevels > 0)
    .slice(0, 20);

  // ── target date feasibility ──────────────────────────────────────────────
  let targetDateFeasibility = null;
  if (targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    const weeksUntilTarget = Math.max(0, Math.floor((target - now) / (7 * 24 * 60 * 60 * 1000)));
    const requiredHoursPerWeek = weeksUntilTarget > 0 ? Math.ceil(simHours / weeksUntilTarget) : null;
    const shortfallPerWeek = requiredHoursPerWeek !== null
      ? Math.max(0, requiredHoursPerWeek - rawHoursPerWeek)
      : null;
    targetDateFeasibility = {
      targetDate: target.toISOString(),
      weeksUntilTarget,
      requiredHoursPerWeek,
      availableHoursPerWeek: rawHoursPerWeek,
      shortfallPerWeek,
      feasible: shortfallPerWeek !== null ? shortfallPerWeek === 0 : false,
    };
  }

  return {
    isSimulation: true,
    inputs: {
      hoursPerDay: effectiveHoursPerDay,
      daysPerWeek: effectiveDaysPerWeek,
      pace,
      extraKnownKeys: resolvedKnownKeys,
      targetDate: targetDate ? new Date(targetDate).toISOString() : null,
    },
    currentPath: {
      roleKey: currentRoadmap?.roleKey ?? 'none',
      roleTitle: currentRoadmap?.roleTitle ?? 'Current Path',
      totalHours: currentHours,
      totalWeeks: currentWeeks,
      nodeCount: currentNodeKeys.length,
    },
    simulatedPath: {
      roleKey: simulatedRoadmap.roleKey,
      roleTitle: simulatedRoadmap.roleTitle,
      totalHours: simHours,
      totalWeeks: simWeeks,
      nodeCount: simNodeKeys.length,
      phasesCount: simulatedRoadmap.totals.phaseCount,
      projectedFinishDate: simulatedRoadmap.schedule.projectedFinishDate,
      readiness: simulatedRoadmap.readiness,
    },
    delta: {
      hoursDiff: simHours - currentHours,
      weeksDiff: simWeeks - currentWeeks,
      nodeCountDiff: simNodeKeys.length - currentNodeKeys.length,
      skillsAdded,
      skillsRemoved,
      skillsSkipped: simSkipped,
    },
    skillGaps,
    roadmapDiff: { added: skillsAdded, removed: skillsRemoved },
    targetDateFeasibility,
  };
}

export async function applySimulatedPath({ user, targetRoleKey, overrides = {} }) {
  const roleKey = await resolveRoleKey(targetRoleKey);

  // Archive previous roadmaps
  await Roadmap.updateMany({ userId: user._id }, { $set: { isArchived: true } });

  // Update user profile
  user.profile.targetRoleKey = roleKey;
  const effectiveDays = overrides.daysPerWeek ?? 5;
  if (overrides.hoursPerDay) {
    user.profile.hoursPerDay = overrides.hoursPerDay;
    user.profile.hoursPerWeek = overrides.hoursPerDay * effectiveDays;
  }
  const resolvedKnownKeys = await resolveSkillKeys(overrides.extraKnownKeys ?? []);
  if (resolvedKnownKeys.length > 0) {
    user.profile.knownNodeKeys = [...new Set([...user.profile.knownNodeKeys, ...resolvedKnownKeys])];
  }
  await user.save();

  // Create & persist new active roadmap
  const newRoadmap = await createRoadmapForUser({
    user,
    roleKey,
    overrides: {
      hoursPerWeek: user.profile.hoursPerWeek,
      knownNodeKeys: user.profile.knownNodeKeys,
    },
  });

  return newRoadmap;
}
