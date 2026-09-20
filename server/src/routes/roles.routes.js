import express from 'express';
import { z } from 'zod';

import Role from '../models/Role.js';
import CareerNode from '../models/CareerNode.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';

const router = express.Router();

/**
 * The role catalog is public — a visitor should be able to browse careers before
 * creating an account. Only generating and saving a roadmap requires a login.
 */

const listQuerySchema = z.object({
  domain: z.string().trim().toLowerCase().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

/** Fields the browse/list view needs. Keeps the payload small. */
const LIST_FIELDS = 'key title domain description minimumEducation salaryINR demandLevel aliases';

// ------------------------------------------------------------- GET /api/roles
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { domain, q, limit } = listQuerySchema.parse(req.query);

    const filter = {};
    if (domain) filter.domain = domain;

    if (q) {
      /**
       * Substring regex rather than the $text index on purpose: a text index
       * matches whole words, so someone typing "reac" or "account" would get
       * nothing back. A picker needs to respond to partial input.
       */
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: rx }, { aliases: rx }, { key: rx }, { description: rx }];
    }

    const roles = await Role.find(filter).select(LIST_FIELDS).sort({ domain: 1, title: 1 }).limit(limit).lean();

    res.json({ count: roles.length, roles });
  })
);

// --------------------------------------------------- GET /api/roles/domains
// Declared before "/:key" so that "domains" is not read as a role key.
router.get(
  '/domains',
  asyncHandler(async (req, res) => {
    const grouped = await Role.aggregate([
      { $group: { _id: '$domain', roleCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, domain: '$_id', roleCount: 1 } },
    ]);

    res.json({ domains: grouped });
  })
);

// -------------------------------------------------- GET /api/roles/:key
router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key).toLowerCase();

    const role = await Role.findOne({ key }).lean();
    if (!role) throw ApiError.notFound(`No target role with the key "${key}".`);

    /**
     * Hydrate the required-node references with enough detail for the role page
     * to show what the path actually involves, without the client having to make
     * one request per step.
     */
    const nodeKeys = (role.requiredNodes ?? []).map((r) => r.nodeKey);
    const nodes = await CareerNode.find({ key: { $in: nodeKeys } })
      .select('key title type difficulty estimatedHours fixedDurationWeeks domain')
      .lean();

    const byKey = new Map(nodes.map((n) => [n.key, n]));

    const requiredNodes = (role.requiredNodes ?? []).map((entry) => ({
      ...entry,
      node: byKey.get(entry.nodeKey) ?? null,
    }));

    // A rough headline figure for the role page. The real number comes from the
    // engine once a profile exists, because prior knowledge changes it.
    const totalHours = requiredNodes
      .filter((r) => r.importance !== 'optional' && r.node)
      .reduce((sum, r) => sum + (r.node.estimatedHours ?? 0), 0);

    res.json({
      role: { ...role, requiredNodes },
      summary: {
        stepCount: requiredNodes.filter((r) => r.importance !== 'optional').length,
        optionalStepCount: requiredNodes.filter((r) => r.importance === 'optional').length,
        totalHours,
        hasCalendarBoundSteps: requiredNodes.some((r) => r.node?.fixedDurationWeeks > 0),
      },
    });
  })
);

export default router;
