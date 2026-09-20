/**
 * The narrative layer — turning a computed plan into something readable.
 *
 * WHERE THE BOUNDARY SITS
 * -----------------------
 * The deterministic engine decides everything: which steps, in what order, how
 * long, by when. This module only *describes* that decision. Gemini, when a key is
 * configured, is allowed to reword the description and nothing else.
 *
 * That boundary is not a stylistic preference. An LLM asked to plan a career will
 * happily invent a certification that does not exist and a timeline it cannot
 * justify, and the output will read beautifully. Keeping generation deterministic
 * and narration optional means the app is still correct with the API key blank —
 * which is the default — and that turning AI on cannot change the advice.
 *
 * Everything below is enforced in code, not just asked for in the prompt:
 *   - the rule-based writer runs first and always produces a usable result;
 *   - the AI is given the finished summary and told to rewrite it;
 *   - its output is checked for invented numbers and rejected if it has any;
 *   - any failure, timeout or missing key falls back silently to the rule-based text.
 */

const AI_TIMEOUT_MS = 8000;
const MIN_AI_LENGTH = 180;
const MAX_AI_LENGTH = 1600;

// ---------------------------------------------------------------- formatting

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Phase titles are stored with their position baked in ("Phase 3: Going deeper")
 * because that is how they read as a heading. Dropped when the title appears
 * mid-sentence, where "closes with phase 5: certification" reads badly.
 */
const bareTitle = (phase) => phase.title.replace(/^phase\s+\d+:\s*/i, '');

/**
 * Months arrive from the engine as a fraction, so they are not whole numbers —
 * and `66.28 % 12` is how a summary ends up promising "5 years and
 * 6.299999999999997 months". Rounded to whole months for prose; the precise
 * figure stays in `totals` for anything that needs it.
 */
function formatDuration(weeks, months) {
  if (weeks < 8) return plural(weeks, 'week');

  const whole = Math.round(months);
  if (whole < 24) return plural(whole, 'month');

  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const yearPart = plural(years, 'year');
  return rest === 0 ? yearPart : `${yearPart} and ${plural(rest, 'month')}`;
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

// ------------------------------------------------------- the rule-based writer

/**
 * Write the summary from the plan's own numbers.
 *
 * This is the default path, not a degraded one, so it is written to be worth
 * reading on its own. The shape of the paragraph changes with the facts — a
 * learner starting from nothing, one who has already covered half the ground, and
 * one whose path contains a three-year degree each get a genuinely different
 * account rather than the same sentence with different numbers slotted in.
 */
export function writeSummary(roadmap) {
  const { roleTitle, totals, readiness, schedule, input, phases } = roadmap;
  const sentences = [];

  const duration = formatDuration(totals.weeks, totals.months);
  const finish = formatDate(schedule.projectedFinishDate);

  // --- opening: where they are starting from -------------------------------
  if (readiness.alreadyMetCount === 0) {
    sentences.push(
      `This is a plan to become a ${roleTitle} from a standing start: ${plural(totals.nodeCount, 'step')} across ${plural(totals.phaseCount, 'phase')}, ${totals.hours} hours of work in total.`
    );
  } else if (readiness.percentComplete >= 60) {
    sentences.push(
      `You are already most of the way to ${roleTitle} — ${readiness.percentComplete}% of what the role needs is behind you, which takes ${readiness.hoursSaved} hours off the plan. What remains is ${plural(totals.nodeCount, 'step')} and ${totals.hours} hours.`
    );
  } else {
    sentences.push(
      `Counting what you already know, you are ${readiness.percentComplete}% of the way to ${roleTitle}. That leaves ${plural(totals.nodeCount, 'step')} across ${plural(totals.phaseCount, 'phase')} — ${totals.hours} hours, down from ${totals.hours + readiness.hoursSaved}.`
    );
  }

  // --- the schedule ---------------------------------------------------------
  const calendarBound = (phases ?? []).filter((p) => p.calendarBound);

  if (calendarBound.length > 0) {
    const names = calendarBound.flatMap((p) => p.nodes.map((n) => n.title));
    sentences.push(
      `At ${input.hoursPerWeek} hours a week that comes to about ${duration}, finishing around ${finish}. Most of that is not negotiable by studying harder: ${names.join(' and ')} ${names.length === 1 ? 'takes' : 'take'} a fixed length of time no matter how much effort you put in, so the honest figure includes ${names.length === 1 ? 'it' : 'them'} at full duration.`
    );
  } else {
    sentences.push(
      `At ${input.hoursPerWeek} hours a week that works out to roughly ${duration}, finishing around ${finish}. Every hour of that is effort you control — raising your weekly time genuinely shortens the path.`
    );
  }

  // --- the target date, if they set one ------------------------------------
  if (schedule.targetDate) {
    const target = formatDate(schedule.targetDate);

    if (schedule.onTrack) {
      sentences.push(`Your ${target} target is comfortably reachable at this pace.`);
    } else if (schedule.requiredHoursPerWeek && schedule.requiredHoursPerWeek <= 60) {
      sentences.push(
        `Your ${target} target is tight: hitting it means ${schedule.requiredHoursPerWeek} hours a week rather than ${input.hoursPerWeek}. That is a real commitment, but it is arithmetic rather than a wall.`
      );
    } else {
      sentences.push(
        `Your ${target} target is not reachable on this path — it would need ${schedule.requiredHoursPerWeek} hours a week. It is worth either moving the date out by about ${plural(schedule.shortfallWeeks, 'week')} or choosing a nearer role first.`
      );
    }
  }

  // --- the arc of the plan -------------------------------------------------
  if ((phases ?? []).length >= 2) {
    const first = bareTitle(phases[0]).toLowerCase();
    const last = bareTitle(phases[phases.length - 1]).toLowerCase();
    sentences.push(
      `The plan opens with ${first} and closes with ${last}, so the early weeks build the ground the later ones stand on. Work through it in order — the sequence is what makes it a path rather than a list.`
    );
  }

  return sentences.join(' ');
}

/**
 * One short note per phase, explaining what the phase is for.
 *
 * Written from the phase's own contents so that a phase containing a degree reads
 * differently from one containing three short skills. The closing clause says
 * something about the phase's *position* rather than restating its contents —
 * `phase.focus` is a re-listing of the same titles, so appending it read as a
 * stutter.
 */
export function writePhaseNotes(roadmap) {
  const phases = roadmap.phases ?? [];

  return phases.map((phase, i) => {
    const titles = phase.nodes.map((n) => n.title);
    const window = `weeks ${phase.startWeek}–${phase.endWeek}`;

    if (phase.calendarBound) {
      return `${phase.title} (${window}): ${titles.join(', ')}. This is a fixed-length commitment of ${plural(phase.weeks, 'week')} — plan the rest of your life around it rather than trying to compress it.`;
    }

    const closing =
      i === 0
        ? 'Nothing here waits on anything else, so this is where to start today.'
        : i === phases.length - 1
          ? 'Finishing this finishes the plan.'
          : 'Everything here rests on the phase before it, so resist jumping ahead.';

    if (titles.length === 1) {
      return `${phase.title} (${window}): ${titles[0]}, about ${plural(phase.hours, 'hour')}. A single substantial piece of work — treat finishing it as the milestone. ${closing}`;
    }

    return `${phase.title} (${window}): ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]} — ${plural(phase.hours, 'hour')} over ${plural(phase.weeks, 'week')}. ${closing}`;
  });
}

// ------------------------------------------------------------- AI validation

/**
 * Every number the plan can legitimately be described with.
 *
 * Anything else in the AI's output is invented, and an invented number in career
 * advice is worse than plain prose. This is the check that makes it safe to let a
 * language model near the text at all.
 */
export function allowedNumbers(roadmap) {
  const { totals, readiness, schedule, input, phases } = roadmap;
  const wholeMonths = Math.round(totals.months);

  const allowed = new Set([
    totals.hours,
    totals.weeks,
    totals.months,
    wholeMonths,
    Math.floor(wholeMonths / 12),
    wholeMonths % 12,
    totals.nodeCount,
    totals.phaseCount,
    readiness.percentComplete,
    readiness.alreadyMetCount,
    readiness.remainingNodeCount,
    readiness.requiredNodeCount,
    readiness.hoursSaved,
    totals.hours + readiness.hoursSaved,
    input.hoursPerWeek,
    schedule.requiredHoursPerWeek,
    schedule.shortfallWeeks,
    schedule.weeksAvailable,
  ]);

  for (const phase of phases ?? []) {
    allowed.add(phase.index);
    allowed.add(phase.index + 1);
    allowed.add(phase.hours);
    allowed.add(phase.weeks);
    allowed.add(phase.startWeek);
    allowed.add(phase.endWeek);
    allowed.add(phase.nodes.length);
  }

  // Years appearing in dates the plan actually references.
  for (const date of [schedule.startDate, schedule.projectedFinishDate, schedule.targetDate]) {
    if (date) allowed.add(new Date(date).getFullYear());
  }

  allowed.delete(null);
  allowed.delete(undefined);
  return allowed;
}

/**
 * The figures a plan may legitimately be described with, grouped by unit.
 *
 * The flat allow-list above is not enough on its own. Small integers are almost
 * always in it via phase indices and step counts, so "you could be job-ready in 4
 * months" sails through even when the plan says seventeen — and a recalculated
 * timeline is the single most damaging thing a rewrite can do. Checking the number
 * against the unit attached to it closes that gap.
 */
function allowedByUnit(roadmap) {
  const { totals, readiness, schedule, input, phases } = roadmap;
  const wholeMonths = Math.round(totals.months);

  const hours = new Set([
    totals.hours,
    totals.hours + readiness.hoursSaved,
    readiness.hoursSaved,
    input.hoursPerWeek,
    schedule.requiredHoursPerWeek,
  ]);

  const weeks = new Set([totals.weeks, schedule.shortfallWeeks, schedule.weeksAvailable]);

  for (const phase of phases ?? []) {
    hours.add(phase.hours);
    weeks.add(phase.weeks);
    weeks.add(phase.startWeek);
    weeks.add(phase.endWeek);
  }

  return {
    hour: hours,
    week: weeks,
    month: new Set([totals.months, wholeMonths, Math.floor(totals.months), wholeMonths % 12]),
    year: new Set([Math.floor(wholeMonths / 12), Math.floor(totals.months / 12)]),
    percent: new Set([readiness.percentComplete, readiness.percentHoursComplete, 100]),
  };
}

/** Singularise the unit word a number was attached to. */
function unitKey(word) {
  const w = word.toLowerCase();
  if (w === '%' || w.startsWith('percent')) return 'percent';
  return w.replace(/s$/, '');
}

/**
 * Check AI-written text against the plan.
 *
 * `sourceText` is the text the model was asked to rewrite. Any number already in
 * it is fair game to repeat — including digits that live inside a step's own name,
 * like "Frontend Portfolio (3 deployed projects)". Without this the check would
 * reject a faithful rewrite for quoting its own input.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateNarrative(text, roadmap, { sourceText = '' } = {}) {
  if (typeof text !== 'string') return { ok: false, reason: 'not a string' };

  const trimmed = text.trim();

  if (trimmed.length < MIN_AI_LENGTH) return { ok: false, reason: `too short (${trimmed.length} chars)` };
  if (trimmed.length > MAX_AI_LENGTH) return { ok: false, reason: `too long (${trimmed.length} chars)` };

  // Asked for prose; a bulleted list means it ignored the brief, and the rest of
  // the brief is probably ignored too.
  if (/^\s*[-*•]\s/m.test(trimmed)) return { ok: false, reason: 'returned a list instead of prose' };

  // Refusals and meta-commentary.
  if (/\b(as an AI|I cannot|I'm unable|language model)\b/i.test(trimmed)) {
    return { ok: false, reason: 'returned meta-commentary' };
  }

  const allowed = allowedNumbers(roadmap);

  for (const match of String(sourceText).matchAll(/\d+(?:[.,]\d+)?/g)) {
    allowed.add(Number(match[0].replace(/,/g, '')));
  }

  /**
   * Pass one: any quantity carrying a unit must match the plan's figure for that
   * unit. This is the check that catches a recalculated timeline.
   */
  const byUnit = allowedByUnit(roadmap);

  for (const match of trimmed.matchAll(/(\d+(?:[.,]\d+)?)\s*(hours?|weeks?|months?|years?|percent|%)/gi)) {
    const value = Number(match[1].replace(/,/g, ''));
    const unit = unitKey(match[2]);
    const permitted = byUnit[unit];

    if (permitted && !permitted.has(value)) {
      return {
        ok: false,
        reason: `restated a figure the plan does not contain: "${match[0].trim()}"`,
      };
    }
  }

  /** Pass two: anything else numeric must at least appear somewhere in the plan. */
  const invented = [];

  for (const match of trimmed.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(match[0].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (allowed.has(value)) continue;
    invented.push(match[0]);
  }

  if (invented.length > 0) {
    return { ok: false, reason: `invented figures: ${[...new Set(invented)].join(', ')}` };
  }

  return { ok: true };
}

// ----------------------------------------------------------------- the AI call

function buildPrompt(roadmap, ruleBasedSummary) {
  return `You are rewriting a career plan summary so it reads warmly and clearly for an Indian student or early-career professional.

TARGET ROLE: ${roadmap.roleTitle}

THE SUMMARY TO REWRITE:
${ruleBasedSummary}

RULES — these are checked automatically and your reply is discarded if it breaks them:
1. Do not introduce any number, figure, date, duration or percentage that is not already in the summary above. Do not recalculate anything.
2. Do not add, remove, rename or reorder any step, skill, exam or qualification.
3. Do not add advice, encouragement about job markets, or salary claims.
4. Write flowing prose in 3 to 5 sentences. No bullet points, no headings, no markdown.
5. Keep it under 1200 characters. Plain second person ("you"). British or Indian English spelling.

Return only the rewritten paragraph.`;
}

/**
 * Ask Gemini to reword the summary. Returns null on any problem at all.
 *
 * Every failure mode here — no key, package missing, network down, model
 * refusing, invented numbers — resolves to null so the caller uses the
 * rule-based text. The narrative is a presentation detail; it must never be able
 * to fail a roadmap request.
 */
async function narrateWithAI(roadmap, ruleBasedSummary) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    // Imported lazily so a missing or broken package cannot stop the server from
    // booting when AI is switched off.
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        // Low temperature: this is a rewriting task, not a creative one.
        temperature: 0.4,
        maxOutputTokens: 400,
      },
    });

    /**
     * A hard timeout. Without it a slow API call holds the request open, and the
     * learner waits on something that is decorative.
     */
    const result = await Promise.race([
      model.generateContent(buildPrompt(roadmap, ruleBasedSummary)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini did not respond within ${AI_TIMEOUT_MS}ms`)), AI_TIMEOUT_MS)
      ),
    ]);

    const text = result?.response?.text?.() ?? '';
    // Models often wrap prose in quotes or stray markdown emphasis.
    const cleaned = text.trim().replace(/^["'`*_\s]+|["'`*_\s]+$/g, '');

    const check = validateNarrative(cleaned, roadmap, { sourceText: ruleBasedSummary });
    if (!check.ok) {
      console.warn(`AI narrative rejected (${check.reason}) — using the rule-based summary.`);
      return null;
    }

    return cleaned;
  } catch (err) {
    console.warn(`AI narrative unavailable (${err.message}) — using the rule-based summary.`);
    return null;
  }
}

// -------------------------------------------------------------- entry point

/**
 * Produce the narrative for a roadmap.
 *
 * Always resolves. `source` tells the UI which writer produced the summary, so
 * the app can be honest about it on screen instead of implying AI wrote a plan it
 * did not touch.
 *
 * @returns {Promise<{summary: string, phaseNotes: string[], source: 'ai'|'rule-based'}>}
 */
export async function buildNarrative(roadmap, { useAI = true } = {}) {
  const ruleBased = writeSummary(roadmap);
  const phaseNotes = writePhaseNotes(roadmap);

  if (!useAI) {
    return { summary: ruleBased, phaseNotes, source: 'rule-based' };
  }

  const aiSummary = await narrateWithAI(roadmap, ruleBased);

  return {
    summary: aiSummary ?? ruleBased,
    // Phase notes stay rule-based either way: they are dense with figures, which
    // is exactly where a rewrite has the most to get wrong and the least to add.
    phaseNotes,
    source: aiSummary ? 'ai' : 'rule-based',
  };
}

export default buildNarrative;
