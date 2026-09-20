/**
 * generate.js — the roadmap generator.
 *
 * This is the orchestration layer. It is still pure: give it a role, a node
 * catalog and a learner profile, and it returns a complete roadmap object with
 * no database, network or clock side effects. `now` is injected rather than read
 * from the system so the same inputs always produce the same output, which is
 * what makes the differentiation tests meaningful.
 *
 * PIPELINE
 *   1. collect   — every node the target role transitively requires
 *   2. expand    — what the learner knows, plus what that implies they know
 *   3. prune     — remove the overlap, recording a reason for each removal
 *   4. sort      — topological order, so prerequisites always come first
 *   5. depth     — longest prerequisite chain per node
 *   6. pack      — group into time-boxed phases using real weekly availability
 *   7. schedule  — project a finish date and compare against the target date
 */

import {
  buildNodeIndex,
  collectRequiredNodes,
  expandKnownNodes,
  topologicalSort,
  computeDepths,
} from './graph.js';
import { packIntoPhases } from './phasePacker.js';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Education levels in ascending order. Used to tell a learner when a role has a
 * formal entry requirement they have not met yet — common for healthcare,
 * teaching and government roles, where no amount of self-study substitutes for
 * the qualification.
 */
export const EDUCATION_RANK = {
  'none': 0,
  'class-10': 1,
  'class-12': 2,
  'diploma': 3,
  'bachelors': 4,
  'masters': 5,
  'doctorate': 6,
};

/**
 * How confident a learner says they are at a step, and what the engine does about it.
 *
 *   beginner      — kept in the plan, but at half its usual hours and flagged
 *                   `isRevision`. "I've seen this once" is not the same as knowing
 *                   it, and it is not the same as never having met it either.
 *   intermediate  — treated as known: pruned, and its prerequisites pruned with it.
 *   advanced      — same as intermediate.
 *
 * A level is therefore a *stronger* signal than the plain "I know this" tick, which
 * only has two states. Both are accepted; a level wins where the two disagree.
 */
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

/** Levels that mean "do not put this in my plan". */
const CONFIDENT_LEVELS = new Set(['intermediate', 'advanced']);

/** What a beginner rating multiplies a step's hours by. */
const REVISION_FACTOR = 0.5;

/**
 * @param {object} params
 * @param {object} params.role                 the target role document
 * @param {Array<object>|Map<string,object>} params.nodes  full catalog, or a prebuilt index
 * @param {object} params.profile              learner inputs
 * @param {Date}   [params.now]                injected clock, for testability
 * @returns {object} the generated roadmap
 */
export function generateRoadmap({ role, nodes, profile, now = new Date() }) {
  if (!role) throw new Error('generateRoadmap requires a role');
  if (!profile) throw new Error('generateRoadmap requires a learner profile');

  const {
    knownNodeKeys = [],
    skillLevels = {},
    hoursPerWeek = 10,
    targetDate = null,
    educationLevel = 'none',
    currentStatus = 'student',
    includeOptional = false,
    weeksPerPhase = 4,
  } = profile;

  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek <= 0) {
    throw new RangeError('hoursPerWeek must be a positive number');
  }

  const index = nodes instanceof Map ? nodes : buildNodeIndex(nodes);

  // --- 1. everything the role demands, with importance propagated downwards ---
  const required = collectRequiredNodes(role, index, { includeOptional });

  // --- 2. what the learner knows, and what that implies ---
  // A level of intermediate or better counts as a claim of knowledge, so the two
  // inputs are merged before the graph expands them. Deduplicated, because a
  // learner will often both tick a skill and rate it.
  const levelEntries = Object.entries(skillLevels).filter(([key]) => index.has(key));
  const confidentKeys = levelEntries
    .filter(([, level]) => CONFIDENT_LEVELS.has(level))
    .map(([key]) => key);

  /**
   * A beginner rating is a statement that the learner has *not* arrived yet, so it
   * outranks both the bare tick and anything inferred from a neighbouring claim.
   *
   * This matters because of what the setup wizard actually sends: selecting React in
   * the skill picker ticks it *and* attaches a level. Without this demotion the tick
   * would win, React would be pruned, and the rating the learner took the trouble to
   * set would make their plan worse rather than better — the opposite of what the
   * levels are for.
   */
  const beginnerKeys = new Set(
    levelEntries.filter(([, level]) => level === 'beginner').map(([key]) => key)
  );

  const claimedKeys = [...new Set([...knownNodeKeys, ...confidentKeys])].filter(
    (key) => !beginnerKeys.has(key)
  );
  const { known, implied } = expandKnownNodes(claimedKeys, index);

  // Also undo any *inferred* credit for a beginner-rated step. Ticking state
  // management implies React, but if the learner has explicitly said "beginner at
  // React" then the explicit answer is the better evidence.
  for (const key of beginnerKeys) {
    known.delete(key);
    implied.delete(key);
  }


  // --- 3. prune the overlap, keeping an auditable reason for every removal ---
  const remaining = new Set();
  const skipped = [];

  for (const [key, importance] of required) {
    if (!known.has(key)) {
      remaining.add(key);
      continue;
    }
    const node = index.get(key);
    const impliedBy = implied.get(key);
    const level = skillLevels[key];
    skipped.push({
      nodeKey: key,
      title: node.title,
      importance,
      level: level ?? null,
      hoursSaved: node.estimatedHours ?? 0,
      reason: impliedBy
        ? `Assumed known because you already know ${index.get(impliedBy)?.title ?? impliedBy}`
        : level
          ? `You rated yourself ${level} at this`
          : 'You marked this as already known',
      inferred: Boolean(impliedBy),
    });
  }

  /**
   * Steps rated `beginner` stay in the plan at half their hours, marked as revision.
   *
   * Calendar-bound steps are exempt. A three-year degree does not become eighteen
   * months because you have read ahead, and halving it would be the one kind of lie
   * this whole design exists to avoid.
   */
  const adjustments = new Map();

  for (const [key, level] of levelEntries) {
    if (level !== 'beginner' || !remaining.has(key)) continue;
    const node = index.get(key);
    if (Number.isFinite(node.fixedDurationWeeks) && node.fixedDurationWeeks > 0) continue;

    const original = node.estimatedHours ?? 0;
    adjustments.set(key, {
      hours: Math.max(1, Math.round(original * REVISION_FACTOR)),
      originalHours: original,
      isRevision: true,
      level,
    });
  }

  // --- 4 & 5. order the work and measure prerequisite depth ---
  const orderedKeys = topologicalSort(remaining, index);
  const depths = computeDepths(orderedKeys, index);

  // --- 6. pack into phases sized to the learner's actual weekly availability ---
  const phases = packIntoPhases(orderedKeys, depths, index, {
    hoursPerWeek,
    weeksPerPhase,
    adjustments,
  });

  // --- 7. schedule and deadline feasibility ---
  const totalHours = phases.reduce((sum, phase) => sum + phase.hours, 0);
  const totalWeeks = phases.reduce((sum, phase) => sum + phase.weeks, 0);

  const projectedFinishDate = new Date(now.getTime() + totalWeeks * MS_PER_WEEK);

  let schedule = {
    startDate: new Date(now.getTime()),
    projectedFinishDate,
    targetDate: targetDate ? new Date(targetDate) : null,
    weeksAvailable: null,
    onTrack: null,
    requiredHoursPerWeek: null,
    shortfallWeeks: null,
  };

  if (targetDate) {
    const target = new Date(targetDate);
    const weeksAvailable = Math.max(0, Math.floor((target.getTime() - now.getTime()) / MS_PER_WEEK));
    const onTrack = totalWeeks <= weeksAvailable;

    schedule = {
      ...schedule,
      weeksAvailable,
      onTrack,
      // What they would need to commit weekly to still hit the target date.
      requiredHoursPerWeek: weeksAvailable > 0 ? Math.ceil(totalHours / weeksAvailable) : null,
      shortfallWeeks: onTrack ? 0 : totalWeeks - weeksAvailable,
    };
  }

  // --- readiness: how much of the role the learner already satisfies ---
  /**
   * Two measures, because they answer different questions and often disagree.
   *
   * `percentComplete` counts steps. It is the intuitive one, and it is the one that
   * flatters: ticking off five short steps out of twenty looks like 25% progress
   * even if the fifteen left are the long ones.
   *
   * `percentHoursComplete` counts hours, and is what the interface shows as career
   * readiness. Revision credit is included in it: a step rated beginner is half
   * paid-for already, so half of it counts as met.
   */
  const requiredCount = required.size;
  const alreadyMet = requiredCount - remaining.size;

  let requiredHours = 0;
  for (const [key] of required) requiredHours += index.get(key).estimatedHours ?? 0;

  const prunedHours = skipped.reduce((sum, entry) => sum + entry.hoursSaved, 0);
  const revisionCreditHours = [...adjustments.values()].reduce(
    (sum, entry) => sum + (entry.originalHours - entry.hours),
    0
  );
  const metHours = prunedHours + revisionCreditHours;

  const readiness = {
    requiredNodeCount: requiredCount,
    alreadyMetCount: alreadyMet,
    remainingNodeCount: remaining.size,
    percentComplete: requiredCount === 0 ? 100 : Math.round((alreadyMet / requiredCount) * 100),
    hoursSaved: prunedHours,
    requiredHours,
    metHours,
    revisionCount: adjustments.size,
    revisionCreditHours,
    percentHoursComplete: requiredHours === 0 ? 100 : Math.round((metHours / requiredHours) * 100),
  };

  // --- advisory notes: things the engine cannot plan away ---
  const notes = [];

  if (role.minimumEducation) {
    const need = EDUCATION_RANK[role.minimumEducation] ?? 0;
    const have = EDUCATION_RANK[educationLevel] ?? 0;
    if (have < need) {
      notes.push({
        level: 'blocker',
        message:
          `${role.title} normally requires ${labelEducation(role.minimumEducation)} ` +
          `as a minimum qualification. Your profile says ${labelEducation(educationLevel)}. ` +
          `The study plan below still applies, but the formal qualification is a separate track you will need alongside it.`,
      });
    }
  }

  if (remaining.size === 0) {
    notes.push({
      level: 'success',
      message:
        `You already meet every requirement recorded for ${role.title}. ` +
        `Shift your effort to portfolio work, interview practice and applications.`,
    });
  }

  if (adjustments.size > 0) {
    notes.push({
      level: 'info',
      message:
        'Steps you rated beginner are still in the plan, but as revision at half the usual hours. ' +
        'They are marked so you know to move quickly through them.',
    });
  }

  if (schedule.onTrack === false) {
    notes.push({
      level: 'warning',
      message:
        `At ${hoursPerWeek} hours a week this plan runs ${totalWeeks} weeks, which is ` +
        `${schedule.shortfallWeeks} week(s) past your target date. You would need about ` +
        `${schedule.requiredHoursPerWeek} hours a week to finish on time, or you can move the date.`,
    });
  }

  if (currentStatus === 'working' && hoursPerWeek > 25) {
    notes.push({
      level: 'info',
      message:
        `You have logged ${hoursPerWeek} hours a week alongside a job. That is ambitious — ` +
        `if it slips, the phase durations below stretch proportionally rather than the plan failing.`,
    });
  }

  return {
    roleKey: role.key,
    roleTitle: role.title,
    roleDomain: role.domain,
    generatedAt: new Date(now.getTime()),
    engineVersion: '1.0.0',
    input: {
      knownNodeKeys: [...knownNodeKeys],
      skillLevels: { ...skillLevels },
      hoursPerWeek,
      targetDate: targetDate ? new Date(targetDate) : null,
      educationLevel,
      currentStatus,
      includeOptional,
      weeksPerPhase,
    },
    totals: {
      hours: totalHours,
      weeks: totalWeeks,
      months: Math.round((totalWeeks / 4.345) * 10) / 10,
      nodeCount: orderedKeys.length,
      phaseCount: phases.length,
    },
    readiness,
    schedule,
    phases,
    skipped,
    notes,
  };
}

function labelEducation(level) {
  const labels = {
    'none': 'no formal qualification',
    'class-10': 'Class 10',
    'class-12': 'Class 12',
    'diploma': 'a diploma',
    'bachelors': "a bachelor's degree",
    'masters': "a master's degree",
    'doctorate': 'a doctorate',
  };
  return labels[level] ?? level;
}
