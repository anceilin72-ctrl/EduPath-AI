import express from 'express';
import { z } from 'zod';

import CareerNode from '../models/CareerNode.js';
import Role from '../models/Role.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';

const router = express.Router();

/**
 * The node catalog, exposed mainly for the "what do you already know?" picker
 * during profile setup. Also public, for the same reason as the role catalog.
 */

const searchSchema = z.object({
  q: z.string().trim().optional(),
  domain: z.string().trim().toLowerCase().optional(),
  type: z.enum(['skill', 'exam', 'certification', 'qualification', 'experience']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(40),
});

const PICKER_FIELDS = 'key title type domain difficulty estimatedHours fixedDurationWeeks aliases';

// ------------------------------------------------------------- GET /api/nodes
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, domain, type, limit } = searchSchema.parse(req.query);

    const filter = {};
    if (domain) filter.domain = domain;
    if (type) filter.type = type;

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: rx }, { aliases: rx }, { key: rx }];
    }

    const nodes = await CareerNode.find(filter)
      .select(PICKER_FIELDS)
      .sort({ domain: 1, title: 1 })
      .limit(limit)
      .lean();

    res.json({ count: nodes.length, nodes });
  })
);

// ---------------------------------------------------- POST /api/nodes/resolve
/**
 * Turn free text the learner typed ("js, react, sql") into catalog keys.
 *
 * Kept as a POST because the list can be long, and it returns the unmatched
 * terms too — the picker shows those back to the learner rather than silently
 * dropping them, which is how someone finds out their spelling was off.
 */
router.post(
  '/resolve',
  asyncHandler(async (req, res) => {
    const { terms } = z
      .object({ terms: z.array(z.string()).max(200) })
      .parse(req.body);

    const cleaned = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))];

    if (cleaned.length === 0) {
      return res.json({ matched: [], unmatched: [] });
    }

    // Exact match on key, title or alias. Deliberately strict: a fuzzy match here
    // would quietly credit a learner with a skill they never claimed.
    const nodes = await CareerNode.find({
      $or: [
        { key: { $in: cleaned } },
        { title: { $in: cleaned.map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i')) } },
        { aliases: { $in: cleaned } },
      ],
    })
      .select(PICKER_FIELDS)
      .lean();

    const matchedTerms = new Set();
    for (const node of nodes) {
      const candidates = [node.key, node.title.toLowerCase(), ...(node.aliases ?? [])];
      for (const term of cleaned) {
        if (candidates.includes(term)) matchedTerms.add(term);
      }
    }

    res.json({
      matched: nodes,
      unmatched: cleaned.filter((t) => !matchedTerms.has(t)),
    });
  })
);

// -------------------------------------------------------- GET /api/nodes/:key
router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key).toLowerCase();

    const node = await CareerNode.findOne({ key }).lean();
    if (!node) throw ApiError.notFound(`No catalog step with the key "${key}".`);

    const [prerequisites, unlocks, usedBy] = await Promise.all([
      CareerNode.find({ key: { $in: node.prerequisites ?? [] } })
        .select('key title type estimatedHours')
        .lean(),
      // What this step opens up next — useful context on a step detail page.
      CareerNode.find({ prerequisites: key }).select('key title type').lean(),
      Role.find({ 'requiredNodes.nodeKey': key }).select('key title domain').lean(),
    ]);

    res.json({ node, prerequisites, unlocks, usedBy });
  })
);

export default router;
