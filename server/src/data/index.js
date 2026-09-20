/**
 * Catalog entry point and integrity gate.
 *
 * Seed data written by hand across six files will drift: a prerequisite gets
 * renamed, a role points at a node someone deleted, two people add the same key.
 * None of that is caught by MongoDB, and all of it produces a roadmap that is
 * quietly wrong rather than loudly broken.
 *
 * So every path into the data — the seeder and the engine tests — goes through
 * `validateCatalog` first, and it throws on anything structural.
 */

import { allNodes, nodesByDomain } from './nodes/index.js';
import { allRoles } from './roles.js';
import { buildNodeIndex, collectRequiredNodes, topologicalSort } from '../engine/graph.js';

export { allNodes, nodesByDomain, allRoles };

const NODE_TYPES = new Set(['skill', 'exam', 'certification', 'qualification', 'experience']);
const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const IMPORTANCES = new Set(['core', 'recommended', 'optional']);
const DOMAINS = new Set(['technology', 'business', 'creative', 'healthcare', 'government', 'education']);
const EDUCATION_LEVELS = new Set(['none', 'class-10', 'class-12', 'diploma', 'bachelors', 'masters', 'doctorate']);

/**
 * Validate the whole catalog.
 *
 * Throws an Error listing every problem found, rather than the first one — if
 * you have renamed a node you want to see all twelve broken references at once.
 *
 * @returns {{nodeIndex: Map, stats: object, warnings: string[]}}
 */
export function validateCatalog({ nodes = allNodes, roles = allRoles } = {}) {
  const errors = [];
  const warnings = [];

  // buildNodeIndex already checks duplicate keys, dangling prerequisites and
  // self-reference. Let it run first — nothing below makes sense without it.
  let nodeIndex;
  try {
    nodeIndex = buildNodeIndex(nodes);
  } catch (err) {
    throw new Error(`Node catalog is structurally invalid.\n  ${err.message}`);
  }

  // The graph must be acyclic, or the topological sort in the engine cannot
  // terminate. A cycle here means someone made A require B while B requires A.
  try {
    topologicalSort([...nodeIndex.keys()], nodeIndex);
  } catch (err) {
    errors.push(`Prerequisite cycle: ${err.message}`);
  }

  // ------------------------------------------------------------- node field checks
  for (const node of nodes) {
    const where = `node "${node.key}"`;
    if (node.type !== undefined && !NODE_TYPES.has(node.type)) {
      errors.push(`${where}: unknown type "${node.type}"`);
    }
    if (node.difficulty !== undefined && !DIFFICULTIES.has(node.difficulty)) {
      errors.push(`${where}: unknown difficulty "${node.difficulty}"`);
    }
    if (!DOMAINS.has(node.domain)) {
      errors.push(`${where}: unknown domain "${node.domain}"`);
    }
    if (node.estimatedHours !== undefined && !(node.estimatedHours > 0)) {
      errors.push(`${where}: estimatedHours must be a positive number`);
    }
    if (node.fixedDurationWeeks !== undefined && !(node.fixedDurationWeeks > 0)) {
      errors.push(`${where}: fixedDurationWeeks must be a positive number when present`);
    }
    if (!node.title) errors.push(`${where}: missing title`);
    if (!node.description) warnings.push(`${where}: no description — the UI will show an empty card`);
  }

  // ------------------------------------------------------------- role field checks
  const seenRoleKeys = new Set();
  for (const role of roles) {
    const where = `role "${role.key}"`;
    if (seenRoleKeys.has(role.key)) errors.push(`${where}: duplicate role key`);
    seenRoleKeys.add(role.key);

    if (!role.title) errors.push(`${where}: missing title`);
    if (!DOMAINS.has(role.domain)) errors.push(`${where}: unknown domain "${role.domain}"`);
    if (role.minimumEducation !== undefined && !EDUCATION_LEVELS.has(role.minimumEducation)) {
      errors.push(`${where}: unknown minimumEducation "${role.minimumEducation}"`);
    }
    if (!role.requiredNodes?.length) {
      errors.push(`${where}: has no requiredNodes, so it can never produce a roadmap`);
    }

    const seenNodeKeys = new Set();
    for (const requirement of role.requiredNodes ?? []) {
      if (!nodeIndex.has(requirement.nodeKey)) {
        errors.push(`${where}: requires unknown node "${requirement.nodeKey}"`);
      }
      if (seenNodeKeys.has(requirement.nodeKey)) {
        errors.push(`${where}: lists node "${requirement.nodeKey}" twice`);
      }
      seenNodeKeys.add(requirement.nodeKey);

      if (requirement.importance !== undefined && !IMPORTANCES.has(requirement.importance)) {
        errors.push(`${where}: node "${requirement.nodeKey}" has unknown importance "${requirement.importance}"`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Catalog validation failed with ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  }

  // ------------------------------------------------------------------- soft signals
  // A node no role can reach is dead weight: it costs maintenance and will never
  // appear in a roadmap. Worth knowing about, but not worth failing a build over.
  const reachable = new Set();
  for (const role of roles) {
    for (const key of collectRequiredNodes(role, nodeIndex, { includeOptional: true }).keys()) {
      reachable.add(key);
    }
  }
  const orphans = [...nodeIndex.keys()].filter((key) => !reachable.has(key));
  if (orphans.length) {
    warnings.push(`${orphans.length} node(s) are not reachable from any role: ${orphans.join(', ')}`);
  }

  const stats = {
    nodeCount: nodes.length,
    roleCount: roles.length,
    reachableNodeCount: reachable.size,
    orphanNodeCount: orphans.length,
    calendarBoundNodeCount: nodes.filter((n) => n.fixedDurationWeeks > 0).length,
    nodesByDomain: Object.fromEntries(Object.entries(nodesByDomain).map(([d, list]) => [d, list.length])),
    rolesByDomain: roles.reduce((acc, role) => {
      acc[role.domain] = (acc[role.domain] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return { nodeIndex, stats, warnings };
}

export default { allNodes, allRoles, nodesByDomain, validateCatalog };
