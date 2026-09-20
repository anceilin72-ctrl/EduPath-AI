/**
 * Formatting helpers.
 *
 * These exist so the same figure is never written two different ways in two
 * different components. A plan that says "288 weeks" on one screen and "5.5 years"
 * on the next looks like two different plans.
 *
 * The duration logic deliberately mirrors server/src/services/narrative.js. If the
 * narrative says "5 years and 6 months", the header beside it must not say "5.5
 * years" — so both round whole months the same way.
 */

export const plural = (n, word, suffix = 's') => `${n} ${word}${n === 1 ? '' : suffix}`;

/** Thousands separators, Indian grouping. 4675 → "4,675". */
export function num(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('en-IN');
}

export function hours(value) {
  if (value === null || value === undefined) return '—';
  return `${num(Math.round(value))} h`;
}

/**
 * Weeks and months into something a person would say out loud.
 * Under two months it stays in weeks, because "1 month" hides the difference
 * between five weeks and eight.
 */
export function duration(weeks, months) {
  if (weeks === null || weeks === undefined) return '—';
  if (weeks < 8) return plural(weeks, 'week');

  const whole = Math.round(months ?? weeks / 4.345);
  if (whole < 24) return plural(whole, 'month');

  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  return rest === 0 ? plural(years, 'year') : `${plural(years, 'year')} ${plural(rest, 'month')}`;
}

export function monthYear(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function fullDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** For "updated 3 days ago" style labels on the dashboard. */
export function relativeDate(value) {
  if (!value) return '';
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/**
 * Salary in lakhs, which is how these numbers are actually quoted in India.
 * 400000 → "4 LPA"; 1600000 → "16 LPA".
 */
export function lakhs(rupees) {
  if (!rupees) return null;
  const value = rupees / 100_000;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} LPA`;
}

export function salaryRange(salaryINR) {
  if (!salaryINR) return null;
  const entry = lakhs(salaryINR.entryLevel);
  const experienced = lakhs(salaryINR.experienced);
  if (!entry) return null;
  return experienced ? `${entry} → ${experienced}` : entry;
}

/** "nodejs-express" → "Nodejs express", for the rare case a key has no title. */
export function humanise(key = '') {
  const text = String(key).replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ------------------------------------------------------------------- vocabulary
/**
 * Labels for the enums the API uses. Written the way a learner would say them,
 * not the way they are stored — nobody describes themselves as "career-change".
 */
export const EDUCATION_LABELS = {
  none: 'No formal qualification yet',
  'class-10': 'Class 10',
  'class-12': 'Class 12',
  diploma: 'Diploma',
  bachelors: "Bachelor's degree",
  masters: "Master's degree",
  doctorate: 'Doctorate',
};

export const STATUS_LABELS = {
  student: 'Studying',
  working: 'Working',
  'career-change': 'Changing career',
  unemployed: 'Between jobs',
};

export const DOMAIN_LABELS = {
  technology: 'Technology',
  business: 'Business & finance',
  creative: 'Creative',
  healthcare: 'Healthcare',
  government: 'Government & civil services',
  education: 'Education',
};

/** One line per domain, for the cards on the landing page. */
export const DOMAIN_BLURBS = {
  technology: 'Build software, data and systems.',
  business: 'Money, markets and managing people.',
  creative: 'Design, write, film and edit.',
  healthcare: 'Care for patients and run labs.',
  government: 'Civil services, banking and defence exams.',
  education: 'Teach in schools, colleges or online.',
};

/** Which year of a course the learner is in. */
export const YEAR_LABELS = {
  '': 'Not studying right now',
  '1st-year': '1st year',
  '2nd-year': '2nd year',
  '3rd-year': '3rd year',
  'final-year': 'Final year',
  graduated: 'Finished studying',
};

/**
 * How confident the learner says they are at a skill, and what each answer does to
 * the plan. Written as promises rather than adjectives, because the choice only
 * makes sense if you know what it changes.
 */
export const LEVEL_LABELS = {
  beginner: 'Just started',
  intermediate: 'Comfortable',
  advanced: 'Strong',
};

export const LEVEL_EFFECTS = {
  beginner: 'Stays in your plan, at half the hours',
  intermediate: 'Removed from your plan',
  advanced: 'Removed from your plan',
};

/**
 * Step types. The distinction matters: an exam is a date you sit for, a
 * qualification is years of your life, a skill is hours of practice.
 */
export const TYPE_LABELS = {
  skill: 'Skill',
  exam: 'Exam',
  certification: 'Certification',
  qualification: 'Qualification',
  experience: 'Experience',
};

export const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const IMPORTANCE_LABELS = {
  core: 'Core',
  recommended: 'Recommended',
  optional: 'Optional',
};

export const DEMAND_LABELS = {
  'very-high': 'Very high demand',
  high: 'High demand',
  moderate: 'Moderate demand',
};

export const STATUS_STEP_LABELS = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const label = (map, key, fallback) => map[key] ?? fallback ?? humanise(key);
