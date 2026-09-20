import Role from '../models/Role.js';
import { allRoles } from '../data/roles.js';
import escapeRegex from './escapeRegex.js';

/**
 * Normalizes input role keys/names (e.g. "ml-engineer", "ML Engineer", "Machine Learning Engineer")
 * to match canonical Role document keys in MongoDB or static role catalog.
 */
export async function resolveRoleKey(inputKey) {
  if (!inputKey || typeof inputKey !== 'string' || inputKey.includes('[object Promise]')) {
    return 'frontend-developer';
  }

  const cleaned = inputKey.trim().toLowerCase();
  const unhyphenated = cleaned.replace(/-/g, ' ');

  // 1. Database query if MongoDB is active
  try {
    const exact = await Role.findOne({ key: cleaned }).select('key').lean();
    if (exact) return exact.key;

    const slugified = cleaned.replace(/[\s_]+/g, '-');
    const slugMatch = await Role.findOne({ key: slugified }).select('key').lean();
    if (slugMatch) return slugMatch.key;

    const rx = new RegExp(`^${escapeRegex(cleaned)}$`, 'i');
    const unhyphenatedRx = new RegExp(`^${escapeRegex(unhyphenated)}$`, 'i');

    const aliasMatch = await Role.findOne({
      $or: [
        { title: rx }, { aliases: rx }, { key: rx },
        { title: unhyphenatedRx }, { aliases: unhyphenatedRx }, { key: unhyphenatedRx },
      ],
    }).select('key').lean();

    if (aliasMatch) return aliasMatch.key;
  } catch (err) {
    // Database fallback to static catalog
  }

  // 2. Static catalog fallback (supports all 30 target roles and aliases)
  const exactCatalog = allRoles.find((r) => r.key === cleaned || r.key === cleaned.replace(/[\s_]+/g, '-'));
  if (exactCatalog) return exactCatalog.key;

  const aliasCatalog = allRoles.find((r) => {
    const titleMatch = r.title.toLowerCase() === cleaned || r.title.toLowerCase() === unhyphenated;
    const keyMatch = r.key.toLowerCase() === cleaned || r.key.toLowerCase() === unhyphenated;
    const hasAlias = (r.aliases || []).some(
      (a) => a.toLowerCase() === cleaned || a.toLowerCase() === unhyphenated
    );
    return titleMatch || keyMatch || hasAlias;
  });

  if (aliasCatalog) return aliasCatalog.key;

  return cleaned;
}
