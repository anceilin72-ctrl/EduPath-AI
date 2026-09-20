/**
 * Turning raw progress rows into the numbers the dashboard shows.
 *
 * Kept out of the route so it can be unit-tested without a database and reused
 * by both the roadmap detail endpoint and the progress endpoint.
 */

const COMPLETE = new Set(['completed', 'skipped']);

/** Every node in the plan, flattened into plan order. */
export function flattenNodes(roadmap) {
  const out = [];
  for (const phase of roadmap.phases ?? []) {
    for (const node of phase.nodes ?? []) {
      out.push({ ...(node.toObject ? node.toObject() : node), phaseIndex: phase.index, phaseTitle: phase.title });
    }
  }
  return out;
}

/**
 * Build the progress summary for one roadmap.
 *
 * Two completion percentages are reported, not one. Counting steps treats a
 * three-year degree and a two-week skill as equal, which flatters progress on
 * long paths; counting hours is fairer but feels discouraging early on when the
 * heavy items are still ahead. The dashboard shows both.
 */
export function summariseProgress(roadmap, rows = []) {
  const nodes = flattenNodes(roadmap);
  const byKey = new Map(rows.map((r) => [r.nodeKey, r]));
  const nodeKeysInPlan = new Set(nodes.map((n) => n.nodeKey));

  let completedNodes = 0;
  let inProgressNodes = 0;
  let hoursCompleted = 0;
  let hoursLogged = 0;
  let totalHours = 0;

  const phaseTally = new Map();

  for (const node of nodes) {
    const row = byKey.get(node.nodeKey);
    const status = row?.status ?? 'not-started';
    const hours = node.estimatedHours ?? 0;

    totalHours += hours;
    hoursLogged += row?.hoursLogged ?? 0;

    if (COMPLETE.has(status)) {
      completedNodes += 1;
      hoursCompleted += hours;
    } else if (status === 'in-progress') {
      inProgressNodes += 1;
    }

    if (!phaseTally.has(node.phaseIndex)) {
      phaseTally.set(node.phaseIndex, {
        index: node.phaseIndex,
        title: node.phaseTitle,
        total: 0,
        completed: 0,
        hours: 0,
        hoursCompleted: 0,
      });
    }
    const tally = phaseTally.get(node.phaseIndex);
    tally.total += 1;
    tally.hours += hours;
    if (COMPLETE.has(status)) {
      tally.completed += 1;
      tally.hoursCompleted += hours;
    }
  }

  const phases = [...phaseTally.values()]
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      ...p,
      percentComplete: p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100),
      isComplete: p.total > 0 && p.completed === p.total,
    }));

  /**
   * What the learner can actually start right now: not finished, and every
   * prerequisite either done or absent from the plan.
   *
   * Prerequisites missing from the plan count as satisfied — they were pruned
   * because the learner already had them, so blocking on them would leave the
   * dashboard permanently telling somebody they can't begin.
   */
  const nextUp = nodes
    .filter((node) => {
      const status = byKey.get(node.nodeKey)?.status ?? 'not-started';
      if (COMPLETE.has(status)) return false;

      return (node.prerequisites ?? []).every((prereq) => {
        if (!nodeKeysInPlan.has(prereq)) return true;
        return COMPLETE.has(byKey.get(prereq)?.status ?? 'not-started');
      });
    })
    .slice(0, 3)
    .map((node) => ({
      nodeKey: node.nodeKey,
      title: node.title,
      type: node.type,
      estimatedHours: node.estimatedHours,
      phaseIndex: node.phaseIndex,
      status: byKey.get(node.nodeKey)?.status ?? 'not-started',
    }));

  const totalNodes = nodes.length;

  return {
    totalNodes,
    completedNodes,
    inProgressNodes,
    remainingNodes: totalNodes - completedNodes,
    percentByNodes: totalNodes === 0 ? 0 : Math.round((completedNodes / totalNodes) * 100),
    percentByHours: totalHours === 0 ? 0 : Math.round((hoursCompleted / totalHours) * 100),
    totalHours,
    hoursCompleted,
    /** Hours the learner actually recorded, which may differ from the estimate. */
    hoursLogged,
    phases,
    nextUp,
    isComplete: totalNodes > 0 && completedNodes === totalNodes,
  };
}

/** Progress rows keyed by node key, for the client to merge into the plan. */
export function progressByNodeKey(rows = []) {
  const map = {};
  for (const row of rows) {
    map[row.nodeKey] = {
      status: row.status,
      hoursLogged: row.hoursLogged,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      notes: row.notes,
      updatedAt: row.updatedAt,
    };
  }
  return map;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Which calendar day a timestamp falls on, as an integer day number.
 *
 * Integers rather than date strings because the streak walk needs to ask "was the
 * day before this one active?", and `anchor - 1` cannot get month ends or leap
 * years wrong the way string arithmetic can.
 *
 * `offsetMinutes` is minutes ahead of UTC — 330 for India. It matters: a step
 * completed at 1am IST is still the previous day in UTC, so counting in UTC would
 * break a real streak for anyone who studies late.
 */
function dayNumber(date, offsetMinutes) {
  return Math.floor((new Date(date).getTime() + offsetMinutes * 60_000) / MS_PER_DAY);
}

/**
 * The study streak: consecutive days on which the learner completed at least one step.
 *
 * Deliberately computed from real progress rows rather than stored as a counter.
 * A stored counter has to be nudged by a scheduled job or it silently rots, and it
 * can disagree with the data it claims to summarise. This cannot: a fresh account
 * reads zero because nothing has been completed, which is the honest answer.
 *
 * Two rules worth stating, because both are choices:
 *   · Only `completed` counts. Marking a step "skipped" is a decision, not study.
 *   · Yesterday keeps the streak alive. The day is not over yet, so a learner who
 *     opens the app at 9am has not lost anything.
 *
 * @param {Array<object>} rows  progress rows for this learner (any roadmap)
 * @param {object} [options]
 * @param {Date}   [options.now]
 * @param {number} [options.offsetMinutes]  minutes ahead of UTC; defaults to the server's
 * @returns {{days:number, longest:number, activeToday:boolean, lastActiveAt:Date|null, activeDays:number}}
 */
export function studyStreak(rows = [], { now = new Date(), offsetMinutes } = {}) {
  const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : -now.getTimezoneOffset();

  const active = new Set();
  let lastActiveAt = null;

  for (const row of rows) {
    if (row.status !== 'completed' || !row.completedAt) continue;
    active.add(dayNumber(row.completedAt, offset));
    const at = new Date(row.completedAt);
    if (!lastActiveAt || at > lastActiveAt) lastActiveAt = at;
  }

  if (active.size === 0) {
    return { days: 0, longest: 0, activeToday: false, lastActiveAt: null, activeDays: 0 };
  }

  const today = dayNumber(now, offset);
  const activeToday = active.has(today);

  // Anchor on today if there is activity today, otherwise on yesterday. Anything
  // older means the streak has already lapsed.
  let days = 0;
  const anchor = activeToday ? today : active.has(today - 1) ? today - 1 : null;
  if (anchor !== null) {
    while (active.has(anchor - days)) days += 1;
  }

  // Longest run anywhere in the history, so a lapsed streak still has something to
  // beat rather than just showing a zero.
  const sorted = [...active].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return { days, longest, activeToday, lastActiveAt, activeDays: active.size };
}
