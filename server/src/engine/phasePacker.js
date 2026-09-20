/**
 * phasePacker.js — turn an ordered list of nodes into coherent learning phases.
 *
 * WHY GROUP BY DEPTH RATHER THAN BY RAW POSITION
 * ----------------------------------------------
 * The topological sort produces one valid linear order, but many orders are
 * valid. Slicing that line at arbitrary points would put a node in an earlier
 * phase than something it depends on only by luck. Walking depth level by depth
 * level instead means we only ever grow a phase with work that is genuinely
 * available at that stage, and the order inside every phase remains a valid
 * topological order.
 *
 * HOW BIG IS A PHASE
 * ------------------
 * A phase is primarily a *content* unit — "Foundations", "Going deeper" — of
 * roughly 3 to 6 items, not a fixed block of calendar time. An earlier version
 * of this file time-boxed phases at four weeks of the learner's availability,
 * and it produced nonsense for part-time learners: at 10 hours a week the budget
 * is 40 hours, less than one substantial skill, so every phase collapsed to a
 * single item and the grouping carried no meaning.
 *
 * So availability is a *soft* signal. It decides when a phase has enough in it
 * to close, between the 3-item floor and the 6-item ceiling, and it sets each
 * phase's real week span. A learner with 30 hours a week gets fewer, denser
 * phases; one with 5 hours a week gets more phases spread over more weeks. The
 * plan describes their calendar without shredding the curriculum.
 *
 * WHAT THIS GUARANTEES (and what it does not)
 * -------------------------------------------
 * Guaranteed: a prerequisite never appears later than something that depends on
 * it, anywhere in the plan. Working top to bottom always works.
 *
 * NOT guaranteed: that a phase can be tackled in any order. A phase may span
 * several depth levels, so a later item can depend on an earlier one in the same
 * phase. Every node carries its `depth` and `prerequisites` so the UI can grey
 * out an item until its prerequisites are ticked off.
 */

/** Fallback when a node forgets to declare its cost. */
const DEFAULT_NODE_HOURS = 20;

/** A phase below this many items reads as noise rather than a stage. */
const MIN_NODES_PER_PHASE = 3;

/** Above this, a phase becomes an undifferentiated dumping ground. */
const MAX_NODES_PER_PHASE = 6;

/**
 * @param {string[]} orderedKeys   output of topologicalSort
 * @param {Map<string, number>} depths  output of computeDepths
 * @param {Map<string, object>} index
 * @param {object} options
 * @param {number} options.hoursPerWeek   the learner's real weekly availability
 * @param {number} [options.weeksPerPhase=4]  soft target length of a phase
 * @param {Map<string, {hours: number, originalHours: number, isRevision: boolean}>} [options.adjustments]
 *        per-node overrides from the learner's self-rated skill levels
 * @returns {Array<object>} phases
 */
export function packIntoPhases(orderedKeys, depths, index, options) {
  const {
    hoursPerWeek,
    weeksPerPhase = 4,
    minNodesPerPhase = MIN_NODES_PER_PHASE,
    maxNodesPerPhase = MAX_NODES_PER_PHASE,
    adjustments = new Map(),
  } = options;

  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek <= 0) {
    throw new RangeError(`hoursPerWeek must be a positive number, received ${hoursPerWeek}`);
  }
  if (orderedKeys.length === 0) return [];

  // The learner's own rating can lower a step's cost — a step they rated beginner is
  // revision rather than new learning. Read through `adjustments` in one place so
  // phase hours, phase weeks and the step's own figure can never disagree.
  const hoursOf = (key) =>
    adjustments.get(key)?.hours ?? index.get(key).estimatedHours ?? DEFAULT_NODE_HOURS;

  const softHourBudget = hoursPerWeek * weeksPerPhase;

  // ---- Step 1: bucket the ordered keys by depth, preserving sort order ----
  const levels = new Map();
  for (const key of orderedKeys) {
    const depth = depths.get(key) ?? 0;
    if (!levels.has(depth)) levels.set(depth, []);
    levels.get(depth).push(key);
  }
  const sortedDepths = [...levels.keys()].sort((a, b) => a - b);

  // ---- Step 2: grow phases level by level ----
  /** @type {Array<{ keys: string[], hours: number }>} */
  const rawPhases = [];
  let current = { keys: [], hours: 0 };

  const flush = () => {
    if (current.keys.length > 0) {
      rawPhases.push(current);
      current = { keys: [], hours: 0 };
    }
  };

  // Close only once the phase is a meaningful unit: never below the item floor,
  // then as soon as either the time budget or the item ceiling is reached.
  const shouldClose = () =>
    current.keys.length >= minNodesPerPhase &&
    (current.hours >= softHourBudget || current.keys.length >= maxNodesPerPhase);

  for (const depth of sortedDepths) {
    // A single very wide depth level would blow past the ceiling on its own, so
    // break it into chunks. Same-depth nodes never depend on each other, which
    // makes splitting a level safe at any point.
    for (const chunk of chunkArray(levels.get(depth), maxNodesPerPhase)) {
      for (const key of chunk) {
        // Calendar-bound steps — a three-year degree, a licence exam cycle — take
        // the time they take no matter how many hours a week you can spare. They
        // get a phase to themselves so their duration is never divided by the
        // learner's availability, which would be meaningless.
        if (isCalendarBound(index.get(key))) {
          flush();
          rawPhases.push({ keys: [key], hours: hoursOf(key), calendarBound: true });
          continue;
        }

        current.keys.push(key);
        current.hours += hoursOf(key);
      }
      if (shouldClose()) flush();
    }
  }
  // Whatever is left is the final phase, even if it is under the item floor —
  // the tail end of a plan is legitimately smaller.
  flush();

  // ---- Step 3: decorate each phase with weeks, calendar position, labels ----
  let weekCursor = 1;
  return rawPhases.map((phase, phaseIndex) => {
    // Calendar-bound phases report the programme's own fixed length. Everything
    // else converts effort into weeks using the learner's availability.
    const weeks = phase.calendarBound
      ? Math.max(1, index.get(phase.keys[0]).fixedDurationWeeks)
      : Math.max(1, Math.ceil(phase.hours / hoursPerWeek));

    const startWeek = weekCursor;
    const endWeek = weekCursor + weeks - 1;
    weekCursor = endWeek + 1;

    const nodes = phase.keys.map((key) => {
      const node = index.get(key);
      const adjustment = adjustments.get(key);
      return {
        nodeKey: node.key,
        title: node.title,
        type: node.type,
        difficulty: node.difficulty,
        estimatedHours: hoursOf(key),
        /* Present only when the learner's rating changed the cost, so the UI can say
           "revision, normally 40 h" instead of silently showing a smaller number. */
        fullHours: adjustment ? adjustment.originalHours : null,
        isRevision: Boolean(adjustment?.isRevision),
        selfRatedLevel: adjustment?.level ?? null,
        description: node.description,
        prerequisites: node.prerequisites ?? [],
        resources: node.resources ?? [],
        checkpoints: node.checkpoints ?? [],
        projectIdeas: node.projectIdeas ?? [],
        depth: depths.get(key) ?? 0,
      };
    });

    return {
      index: phaseIndex + 1,
      title: describePhase(phaseIndex, rawPhases.length, nodes),
      focus: summariseFocus(nodes),
      hours: phase.hours,
      weeks,
      startWeek,
      endWeek,
      calendarBound: Boolean(phase.calendarBound),
      nodes,
    };
  });
}

/**
 * True for steps whose length is set by an institution rather than by effort:
 * a degree, a mandatory articleship, a licence exam cycle. Dividing those by
 * "hours per week" would produce a meaningless number, so the packer schedules
 * them by their declared duration instead.
 */
function isCalendarBound(node) {
  return Number.isFinite(node?.fixedDurationWeeks) && node.fixedDurationWeeks > 0;
}

/** Split an array into consecutive chunks of at most `size`. */
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Human-readable phase name. Position in the journey drives the wording, with
 * exam- and certification-heavy phases called out because those are milestones
 * with fixed dates, not open-ended study.
 */
function describePhase(phaseIndex, totalPhases, nodes) {
  const position = totalPhases === 1 ? 0 : phaseIndex / (totalPhases - 1);
  const half = Math.ceil(nodes.length / 2);

  const typeCounts = nodes.reduce((counts, node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, {});

  if ((typeCounts.exam ?? 0) >= half) return `Phase ${phaseIndex + 1}: Examination push`;
  if ((typeCounts.certification ?? 0) >= half) return `Phase ${phaseIndex + 1}: Certification`;
  if ((typeCounts.experience ?? 0) >= half) return `Phase ${phaseIndex + 1}: Practical experience`;

  if (position === 0) return `Phase ${phaseIndex + 1}: Foundations`;
  if (position < 0.4) return `Phase ${phaseIndex + 1}: Building the core`;
  if (position < 0.75) return `Phase ${phaseIndex + 1}: Going deeper`;
  if (position < 1) return `Phase ${phaseIndex + 1}: Specialisation`;
  return `Phase ${phaseIndex + 1}: Job readiness`;
}

/** One-line summary listing the biggest items in the phase. */
function summariseFocus(nodes) {
  const headline = [...nodes]
    .sort((a, b) => b.estimatedHours - a.estimatedHours)
    .slice(0, 3)
    .map((node) => node.title);

  if (headline.length === 0) return '';
  if (nodes.length <= 3) return headline.join(', ');
  return `${headline.join(', ')} and ${nodes.length - headline.length} more`;
}
