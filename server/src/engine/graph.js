/**
 * graph.js — pure graph algorithms over the roadmap node catalog.
 *
 * DESIGN NOTE
 * -----------
 * Nothing in this file imports mongoose, express, or any npm package. It works
 * on plain JavaScript objects. That is deliberate:
 *   1. it can be unit-tested with `node` alone (see tests/engine.test.mjs),
 *   2. the planning logic stays independent of how the data is stored, and
 *   3. the same functions run identically on seed fixtures and on real DB rows.
 *
 * A "node" is any step on a career path, not just a coding skill:
 *   skill | exam | certification | qualification | experience
 * That is what lets one engine serve a React developer and a UPSC aspirant.
 *
 * A node looks like:
 *   {
 *     key: 'js-fundamentals',        // unique slug, referenced by prerequisites
 *     title: 'JavaScript Fundamentals',
 *     type: 'skill',
 *     estimatedHours: 60,
 *     difficulty: 'beginner',
 *     prerequisites: ['html-css'],   // array of OTHER node keys
 *     ...
 *   }
 */

/** Ordering used for deterministic tie-breaks and for reporting. */
export const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

/** Importance levels, strongest first. A prerequisite inherits the strongest
 *  importance of anything that depends on it. */
export const IMPORTANCE_RANK = { core: 0, recommended: 1, optional: 2 };

/**
 * Index nodes by key and validate referential integrity of the catalog.
 *
 * With ~30 roles and hundreds of nodes maintained by hand, a typo in a
 * prerequisite slug is the single most likely data bug. We fail loudly at load
 * time rather than silently generating an incomplete roadmap.
 *
 * @param {Array<object>} nodes
 * @returns {Map<string, object>}
 */
export function buildNodeIndex(nodes) {
  if (!Array.isArray(nodes)) {
    throw new TypeError('buildNodeIndex expects an array of nodes');
  }

  const index = new Map();
  const duplicates = [];

  for (const node of nodes) {
    if (!node || typeof node.key !== 'string' || node.key.length === 0) {
      throw new Error(`Every node needs a non-empty string "key". Offender: ${JSON.stringify(node)}`);
    }
    if (index.has(node.key)) {
      duplicates.push(node.key);
    }
    index.set(node.key, node);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate node keys in catalog: ${duplicates.join(', ')}`);
  }

  // Validate that every prerequisite points at a node that actually exists.
  const dangling = [];
  for (const node of index.values()) {
    for (const prereq of node.prerequisites ?? []) {
      if (!index.has(prereq)) {
        dangling.push(`${node.key} -> ${prereq}`);
      }
      if (prereq === node.key) {
        throw new Error(`Node "${node.key}" lists itself as a prerequisite`);
      }
    }
  }

  if (dangling.length > 0) {
    throw new Error(
      `Catalog references prerequisites that do not exist:\n  ${dangling.join('\n  ')}`
    );
  }

  return index;
}

/**
 * Walk from a role's directly-required nodes through every prerequisite chain
 * to produce the full set of nodes the role demands.
 *
 * Importance propagates *downwards*: if a "core" node depends on some other
 * node, that dependency is itself core — you cannot skip the foundation of
 * something mandatory.
 *
 * @param {object} role  { requiredNodes: [{ nodeKey, importance }] }
 * @param {Map<string, object>} index
 * @param {{ includeOptional?: boolean }} [options]
 * @returns {Map<string, string>} node key -> effective importance
 */
export function collectRequiredNodes(role, index, options = {}) {
  const { includeOptional = false } = options;
  const required = new Map();

  /** Depth-first walk that keeps the strongest importance seen for each node. */
  const visit = (key, importance, trail) => {
    const node = index.get(key);
    if (!node) {
      throw new Error(`Role "${role.key}" requires unknown node "${key}"`);
    }

    if (trail.includes(key)) {
      throw new Error(
        `Circular prerequisite chain detected: ${[...trail, key].join(' -> ')}`
      );
    }

    const existing = required.get(key);
    // Already recorded at an equal or stronger importance? Nothing to change.
    if (existing !== undefined && IMPORTANCE_RANK[existing] <= IMPORTANCE_RANK[importance]) {
      return;
    }

    // Either brand new, or we arrived via a stronger path — stronger wins.
    required.set(key, importance);

    for (const prereq of node.prerequisites ?? []) {
      visit(prereq, importance, [...trail, key]);
    }
  };

  for (const entry of role.requiredNodes ?? []) {
    const importance = entry.importance ?? 'core';
    if (importance === 'optional' && !includeOptional) continue;
    visit(entry.nodeKey, importance, []);
  }

  return required;
}

/**
 * Expand what the user claims to know into what they must therefore know.
 *
 * ASSUMPTION (documented, and surfaced to the user in the result):
 * if someone knows React, they necessarily know React's prerequisites —
 * JavaScript, the DOM, HTML/CSS. So we treat those as known too and prune them.
 *
 * This is the single most important step for personalization. Without it, an
 * experienced developer who ticks "React" would still be told to start at
 * "Introduction to HTML", which is exactly the behaviour that makes generated
 * roadmaps feel fake.
 *
 * @param {string[]} knownKeys — nodes the user explicitly said they know
 * @param {Map<string, object>} index
 * @returns {{ known: Set<string>, implied: Map<string, string> }}
 *          `implied` maps an inferred node key -> the explicit node that implied it
 */
export function expandKnownNodes(knownKeys, index) {
  const known = new Set();
  const implied = new Map();

  const visitPrereqs = (key, rootCause) => {
    const node = index.get(key);
    if (!node) return;
    for (const prereq of node.prerequisites ?? []) {
      if (!known.has(prereq)) {
        known.add(prereq);
        implied.set(prereq, rootCause);
        visitPrereqs(prereq, rootCause);
      }
    }
  };

  // Pass 1: everything explicitly claimed.
  for (const key of knownKeys ?? []) {
    if (index.has(key)) known.add(key);
  }

  // Pass 2: everything implied by those claims.
  for (const key of knownKeys ?? []) {
    if (index.has(key)) visitPrereqs(key, key);
  }

  // An explicitly-claimed node is never merely "implied".
  for (const key of knownKeys ?? []) implied.delete(key);

  return { known, implied };
}

/**
 * Kahn's algorithm — order nodes so that every prerequisite appears before the
 * node that depends on it.
 *
 * Ties (nodes that become available at the same moment) are broken
 * deterministically by difficulty, then estimated hours, then title. Two things
 * matter about that: easier and shorter work comes first, which builds
 * momentum; and the same input always produces the same output, so the app is
 * reproducible and testable.
 *
 * @param {Iterable<string>} keys — the subset of the catalog to sort
 * @param {Map<string, object>} index
 * @returns {string[]} ordered node keys
 * @throws if the subset contains a prerequisite cycle
 */
export function topologicalSort(keys, index) {
  const subset = new Set(keys);

  // Build in-degree and adjacency, restricted to the subset. Prerequisites that
  // fall outside the subset are ignored — they are either already known or not
  // needed for this role.
  const indegree = new Map();
  const dependents = new Map();

  for (const key of subset) {
    indegree.set(key, 0);
    dependents.set(key, []);
  }

  for (const key of subset) {
    const node = index.get(key);
    for (const prereq of node.prerequisites ?? []) {
      if (!subset.has(prereq)) continue;
      indegree.set(key, indegree.get(key) + 1);
      dependents.get(prereq).push(key);
    }
  }

  const compare = (a, b) => {
    const nodeA = index.get(a);
    const nodeB = index.get(b);
    const diff = (DIFFICULTY_RANK[nodeA.difficulty] ?? 1) - (DIFFICULTY_RANK[nodeB.difficulty] ?? 1);
    if (diff !== 0) return diff;
    const hours = (nodeA.estimatedHours ?? 0) - (nodeB.estimatedHours ?? 0);
    if (hours !== 0) return hours;
    return String(nodeA.title).localeCompare(String(nodeB.title));
  };

  const ready = [...subset].filter((key) => indegree.get(key) === 0).sort(compare);
  const ordered = [];

  while (ready.length > 0) {
    const key = ready.shift();
    ordered.push(key);

    let unlockedSomething = false;
    for (const dependent of dependents.get(key)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) {
        ready.push(dependent);
        unlockedSomething = true;
      }
    }
    // Keep the frontier sorted so tie-breaking stays deterministic.
    if (unlockedSomething) ready.sort(compare);
  }

  if (ordered.length !== subset.size) {
    const stuck = [...subset].filter((key) => !ordered.includes(key));
    throw new Error(
      `Prerequisite cycle detected — these nodes can never be reached: ${stuck.join(', ')}`
    );
  }

  return ordered;
}

/**
 * Depth of each node = length of the longest prerequisite chain leading to it
 * *within the given subset*. Roots are depth 0.
 *
 * Depth is what the phase packer groups on. Grouping by depth rather than by
 * raw topological position guarantees that everything in phase N only depends
 * on things in phases before N, so a learner can genuinely work through a
 * phase in any order they like.
 *
 * @param {string[]} orderedKeys — output of topologicalSort
 * @param {Map<string, object>} index
 * @returns {Map<string, number>}
 */
export function computeDepths(orderedKeys, index) {
  const subset = new Set(orderedKeys);
  const depths = new Map();

  // Because the input is already topologically ordered, every prerequisite has
  // its depth computed before we reach the node itself — one pass is enough.
  for (const key of orderedKeys) {
    const node = index.get(key);
    let depth = 0;
    for (const prereq of node.prerequisites ?? []) {
      if (!subset.has(prereq)) continue;
      depth = Math.max(depth, (depths.get(prereq) ?? 0) + 1);
    }
    depths.set(key, depth);
  }

  return depths;
}
