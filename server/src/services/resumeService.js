import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

import { collectRequiredNodes, expandKnownNodes } from '../engine/graph.js';
import ApiError from '../utils/ApiError.js';

/**
 * Resume scanning and gap analysis.
 *
 * The extraction half touches the filesystem and a PDF library. The analysis half
 * is pure — text in, catalog keys out — which is why it lives here rather than in
 * the route, and why it can be tested without uploading a file.
 *
 * A NOTE ON WHAT THIS DOES AND DOES NOT DECIDE
 * -------------------------------------------
 * A scan of a resume *proposes*; the learner *confirms*. Nothing here writes to
 * `profile.knownNodeKeys`. Silently crediting somebody with React because the
 * word appeared in a list of technologies their team used would prune the very
 * steps they most need, and they would never know why. So every match comes back
 * with the text that triggered it, and the UI asks.
 */

// -------------------------------------------------------------- text extraction

/**
 * Load pdf-parse without tripping its debug mode.
 *
 * pdf-parse@1.1.1 has `if (!module.parent) { ...read a test PDF from disk... }`
 * at the top of its index.js. Under an ESM `import` there is no parent module, so
 * that branch runs and the import crashes with:
 *   ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'
 *
 * Requiring the library file directly skips index.js entirely. This is loaded
 * lazily inside the function so that importing this module — which the tests do —
 * never needs the dependency at all.
 */
function loadPdfParser() {
  const require = createRequire(import.meta.url);
  try {
    return require('pdf-parse/lib/pdf-parse.js');
  } catch {
    // Fall back to the package entry point in case a future version drops the
    // debug branch or moves the file.
    return require('pdf-parse');
  }
}

/**
 * Pull plain text out of an uploaded resume.
 *
 * Only PDF and plain text are supported, and the error message says so rather
 * than accepting a .docx and returning nothing useful. Word files are the common
 * case, so the message tells the learner how to convert one.
 */
export async function extractText({ filePath, mimetype, originalName = '' }) {
  const isPdf = mimetype === 'application/pdf' || /\.pdf$/i.test(originalName);
  const isText = mimetype?.startsWith('text/') || /\.(txt|md)$/i.test(originalName);

  if (isPdf) {
    const pdfParse = loadPdfParser();
    const buffer = await fs.readFile(filePath);
    const { text } = await pdfParse(buffer);
    return text ?? '';
  }

  if (isText) {
    return fs.readFile(filePath, 'utf8');
  }

  throw ApiError.badRequest(
    'Please upload a PDF or a plain text file. In Word, use File > Save As and choose PDF.'
  );
}

// ------------------------------------------------------------------- scanning

/** Characters that can legitimately end a technology name: c++, c#, f#. */
const WORD_EDGE = '[a-z0-9+#]';

/**
 * Terms shorter than this are ignored.
 *
 * Two characters is the shortest genuinely useful abbreviation in the catalog
 * ("js", "hr", "ca"), and single characters — "r", "c", "go" as a word — match
 * far too much ordinary prose to be worth the false positives.
 */
const MIN_TERM_LENGTH = 2;

function escapeForPattern(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build one regex for a search term.
 *
 * Separators inside the term are made flexible so that "node.js" also matches
 * "nodejs" and "node js", and "html-css" matches "HTML / CSS". Lookarounds stand
 * in for \b because \b treats "+" as a boundary, which would let "c" match
 * inside "c++".
 *
 * The term is split on separators *before* escaping, not after. Doing it the
 * other way round means the substitution also matches the backslashes that
 * escaping just added — which turned "CompTIA Security+" into a pattern ending
 * in "*+" and threw "Nothing to repeat" at runtime.
 */
function patternFor(term) {
  const pieces = term.split(/[\s\-_./\\]+/).filter(Boolean).map(escapeForPattern);
  if (pieces.length === 0) return null;

  const flexible = pieces.join('[\\s\\-_./]*');
  return new RegExp(`(?<!${WORD_EDGE})${flexible}(?!${WORD_EDGE})`, 'i');
}

/**
 * How much to trust a match, based on what matched rather than how often.
 *
 * A multi-word title appearing verbatim is strong evidence. A two-letter alias is
 * weak — "ca" is an accounting qualification and also half of "California". The
 * UI pre-ticks high confidence and leaves the rest for the learner to decide.
 */
function confidenceOf(term, isTitle) {
  if (term.length <= 3) return 'low';
  if (isTitle && /\s/.test(term)) return 'high';
  if (isTitle) return 'medium';
  return term.length >= 6 ? 'medium' : 'low';
}

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };

/** A short window of surrounding text, so the learner can see why it matched. */
function evidenceAround(text, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - 35);
  const end = Math.min(text.length, matchIndex + matchLength + 35);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
}

/**
 * Find catalog steps mentioned in a block of text.
 *
 * @param {string} text
 * @param {Map<string, object>} index — the catalog
 * @returns {Array<{nodeKey, title, type, domain, matchedTerm, confidence, evidence}>}
 */
export function scanForSkills(text, index) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];

  // Newlines and non-breaking spaces from PDFs would otherwise break multi-word
  // titles that happen to wrap across a line.
  const haystack = text.replace(/ /g, ' ').replace(/\s+/g, ' ');

  const found = new Map();

  for (const node of index.values()) {
    const candidates = [
      { term: node.title, isTitle: true },
      { term: node.key.replace(/-/g, ' '), isTitle: true },
      ...(node.aliases ?? []).map((alias) => ({ term: alias, isTitle: false })),
    ];

    for (const { term, isTitle } of candidates) {
      if (typeof term !== 'string' || term.trim().length < MIN_TERM_LENGTH) continue;

      const pattern = patternFor(term.trim());
      if (!pattern) continue;

      const match = pattern.exec(haystack);
      if (!match) continue;

      const confidence = confidenceOf(term.trim(), isTitle);
      const existing = found.get(node.key);

      // Keep the strongest evidence for each node rather than the first found.
      if (existing && CONFIDENCE_RANK[existing.confidence] <= CONFIDENCE_RANK[confidence]) continue;

      found.set(node.key, {
        nodeKey: node.key,
        title: node.title,
        type: node.type,
        domain: node.domain,
        estimatedHours: node.estimatedHours,
        matchedTerm: term.trim(),
        confidence,
        evidence: evidenceAround(haystack, match.index, match[0].length),
      });
    }
  }

  // Strongest first, then alphabetically so the list is stable between scans.
  return [...found.values()].sort(
    (a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      a.title.localeCompare(b.title)
  );
}

// -------------------------------------------------------------- gap analysis

/**
 * Compare what somebody knows against what a role needs.
 *
 * This is lighter than generating a roadmap: no ordering, no phases, no schedule.
 * It answers "how far off am I?" and nothing else, which makes it cheap enough to
 * run against every role at once (see rankRoleFit).
 *
 * `skillLevels` must be read the same way the engine reads it, or the skill-gap
 * screen and the plan it leads to would show two different readiness figures for
 * the same learner: intermediate and advanced count as known, and a step rated
 * beginner is half paid-for.
 *
 * @returns {{roleKey, roleTitle, have, missing, requiredCount, metCount,
 *            percentReady, hoursRemaining, hoursCovered}}
 */
export function analyseGap({
  role,
  index,
  knownNodeKeys = [],
  skillLevels = {},
  includeOptional = false,
}) {
  const required = collectRequiredNodes(role, index, { includeOptional });

  const levels = new Map(Object.entries(skillLevels).filter(([key]) => index.has(key)));
  const confident = [...levels]
    .filter(([, level]) => level === 'intermediate' || level === 'advanced')
    .map(([key]) => key);

  // Beginner outranks the tick and outranks inference, exactly as in the engine —
  // see the note there. Kept identical on purpose: if these two ever drift, the
  // skill-gap screen and the plan it leads to show different readiness figures for
  // the same learner, and there is no way to tell which one is lying.
  const beginners = new Set([...levels].filter(([, level]) => level === 'beginner').map(([key]) => key));

  const claimed = [...new Set([...knownNodeKeys, ...confident])].filter((key) => !beginners.has(key));
  const { known, implied } = expandKnownNodes(claimed, index);

  for (const key of beginners) {
    known.delete(key);
    implied.delete(key);
  }

  const have = [];
  const missing = [];
  let hoursCovered = 0;
  let hoursRemaining = 0;

  for (const [nodeKey, importance] of required) {
    const node = index.get(nodeKey);
    const hours = node.estimatedHours ?? 0;
    const calendarBound = Number.isFinite(node.fixedDurationWeeks) && node.fixedDurationWeeks > 0;

    const entry = {
      nodeKey,
      title: node.title,
      type: node.type,
      importance,
      estimatedHours: hours,
      fixedDurationWeeks: node.fixedDurationWeeks ?? null,
    };

    if (known.has(nodeKey)) {
      hoursCovered += hours;
      have.push({
        ...entry,
        level: levels.get(nodeKey) ?? null,
        // Say so when credit came from an inference rather than a claim, so the
        // learner can correct us if the assumption was wrong.
        inferredFrom: implied.get(nodeKey) ?? null,
      });
    } else if (levels.get(nodeKey) === 'beginner' && !calendarBound) {
      // Half credit, and it stays on the "need to learn" side — the learner has met
      // this but does not know it yet, so hiding it would be the wrong call.
      const revisionHours = Math.max(1, Math.round(hours / 2));
      hoursCovered += hours - revisionHours;
      hoursRemaining += revisionHours;
      missing.push({ ...entry, level: 'beginner', isRevision: true, revisionHours });
    } else {
      hoursRemaining += hours;
      missing.push({ ...entry, level: levels.get(nodeKey) ?? null, isRevision: false });
    }
  }

  // Heaviest gaps first — that is the answer to "what should I worry about?".
  missing.sort((a, b) => b.estimatedHours - a.estimatedHours || a.title.localeCompare(b.title));
  have.sort((a, b) => a.title.localeCompare(b.title));

  const requiredCount = required.size;

  return {
    roleKey: role.key,
    roleTitle: role.title,
    roleDomain: role.domain,
    requiredCount,
    metCount: have.length,
    missingCount: missing.length,
    /**
     * Readiness is measured in hours, not step count. A candidate missing only a
     * three-year degree is not "90% ready" just because they have nine of ten
     * boxes ticked.
     */
    percentReady:
      hoursCovered + hoursRemaining === 0
        ? 0
        : Math.round((hoursCovered / (hoursCovered + hoursRemaining)) * 100),
    hoursCovered,
    hoursRemaining,
    have,
    missing,
  };
}

/**
 * Rank every role by how close the learner already is.
 *
 * This inverts the usual question. Instead of "here is the plan for the job you
 * named", it answers "given what you have already done, which of these is
 * nearest?" — which for somebody unsure what to aim at is the more useful
 * question, and it is the same graph doing the work.
 *
 * Roles the learner is not yet eligible for on paper are still ranked, with the
 * education shortfall flagged rather than hidden.
 */
export function rankRoleFit({ roles, index, knownNodeKeys = [], skillLevels = {}, limit = 10 }) {
  const results = roles.map((role) => {
    const gap = analyseGap({ role, index, knownNodeKeys, skillLevels });

    return {
      roleKey: role.key,
      roleTitle: role.title,
      roleDomain: role.domain,
      demandLevel: role.demandLevel,
      salaryINR: role.salaryINR,
      minimumEducation: role.minimumEducation,
      percentReady: gap.percentReady,
      hoursRemaining: gap.hoursRemaining,
      metCount: gap.metCount,
      requiredCount: gap.requiredCount,
      /** The three biggest things standing in the way, for a one-line summary. */
      biggestGaps: gap.missing.slice(0, 3).map((m) => m.title),
    };
  });

  return results
    .sort(
      (a, b) =>
        b.percentReady - a.percentReady ||
        a.hoursRemaining - b.hoursRemaining ||
        a.roleTitle.localeCompare(b.roleTitle)
    )
    .slice(0, limit);
}
