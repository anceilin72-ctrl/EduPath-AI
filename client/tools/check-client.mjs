#!/usr/bin/env node
/**
 * Static checks for the client, runnable with plain `node` and no dependencies.
 *
 * WHY THIS EXISTS
 * ---------------
 * The server has four test suites because its logic can be exercised in isolation.
 * The client cannot: it needs a browser and a Tailwind compile. That leaves two
 * classes of mistake that a normal read-through misses and that only appear as a
 * blank screen or a silently broken layout:
 *
 *   1. An import that does not resolve, or that names an export the target module
 *      does not have. Vite fails the build; before a build, nothing tells you.
 *   2. A class name Tailwind does not know. There is no error for this at all —
 *      `text-ink-fiant` simply produces no CSS, and the text quietly renders in
 *      the inherited colour. On a design where ochre versus blue carries actual
 *      meaning, that is a wrong statement rather than a cosmetic slip.
 *
 * So this checks both against the real files, and prints the full class inventory
 * so the tokens it cannot classify can be read once by eye.
 *
 *   node tools/check-client.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, '..');
const SRC = join(CLIENT, 'src');

const errors = [];
const fail = (file, message) => errors.push(`${relative(CLIENT, file)}: ${message}`);

// ---------------------------------------------------------------- file walking

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (['.js', '.jsx'].includes(extname(entry))) found.push(full);
  }
  return found;
}

const files = walk(SRC);
const read = (path) => readFileSync(path, 'utf8');
const sources = new Map(files.map((file) => [file, read(file)]));

// ============================================================ 1. imports

/**
 * What a module exports.
 *
 * A regex scan rather than a parse. That is a real limitation — it would miss
 * `export { x }` written across several lines with comments in between — but the
 * codebase writes exports plainly, and a wrong answer here shows up as a false
 * failure rather than a missed one, which is the safe direction.
 */
function exportsOf(source) {
  const names = new Set();
  let hasDefault = false;

  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (alias === 'default') hasDefault = true;
      else if (alias) names.add(alias);
    }
  }
  if (/export\s+default/.test(source)) hasDefault = true;

  return { names, hasDefault };
}

/** Resolve a relative specifier the way Vite would. */
function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js'), join(base, 'index.jsx')];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const IMPORT_PATTERN = /import\s+([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g;

let importsChecked = 0;

for (const [file, source] of sources) {
  for (const [, clause, specifier] of source.matchAll(IMPORT_PATTERN)) {
    if (!specifier.startsWith('.')) continue; // npm packages are package.json's problem

    const target = resolveSpecifier(file, specifier);
    if (!target) {
      fail(file, `imports "${specifier}", which does not resolve to a file`);
      continue;
    }

    const targetSource = sources.get(target) ?? read(target);
    const { names, hasDefault } = exportsOf(targetSource);
    const shortTarget = relative(CLIENT, target);

    // Split "Default, { a, b as c }" / "* as ns" into what is actually wanted.
    const braced = clause.match(/\{([^}]*)\}/);
    const beforeBrace = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();

    if (beforeBrace && !beforeBrace.startsWith('*')) {
      importsChecked += 1;
      if (!hasDefault) fail(file, `imports a default from ${shortTarget}, which has no default export`);
    }

    if (braced) {
      for (const part of braced[1].split(',')) {
        const wanted = part.split(/\s+as\s+/)[0].trim();
        if (!wanted) continue;
        importsChecked += 1;
        if (!names.has(wanted)) {
          fail(file, `imports { ${wanted} } from ${shortTarget}, which does not export it`);
        }
      }
    }
  }
}

// ============================================================ 2. class names

const config = read(join(CLIENT, 'tailwind.config.js'));
const css = read(join(SRC, 'index.css'));

/**
 * The custom colour palette, flattened to the strings Tailwind will accept.
 * `ink: { DEFAULT, soft }` becomes ink, ink-soft — exactly the suffixes a class
 * may legally use.
 */
function customColours() {
  // Bounded to the `colors` block itself — it is indented six spaces inside
  // theme.extend, so its closing brace is the first `      },` after it. Matching
  // a four-space close instead would swallow fontFamily, keyframes and animation
  // and quietly accept nonsense like `text-keyframes`.
  const block = config.match(/colors:\s*\{([\s\S]*?)\n {6}\},/);
  if (!block) throw new Error('Could not find the colors block in tailwind.config.js');

  const families = new Map();
  const text = block[1];

  // Only top-level entries are families, which is why both patterns are anchored to
  // the eight-space indent. Without that, the nested `DEFAULT:`/`soft:` keys inside
  // ink and effort get registered as families of their own.
  // family: { DEFAULT: '#...', soft: '#...' }
  for (const match of text.matchAll(/^ {8}([\w-]+):\s*\{([^}]*)\}/gm)) {
    const keys = [...match[2].matchAll(/([\w-]+):/g)].map((m) => m[1]);
    families.set(match[1], new Set(keys));
  }
  // family: '#...'
  for (const match of text.matchAll(/^ {8}([\w-]+):\s*'#[0-9a-fA-F]{3,8}'/gm)) {
    if (!families.has(match[1])) families.set(match[1], new Set(['DEFAULT']));
  }

  const legal = new Set();
  for (const [family, keys] of families) {
    for (const key of keys) legal.add(key === 'DEFAULT' ? family : `${family}-${key}`);
  }
  return { families, legal };
}

const { families: colourFamilies, legal: legalColours } = customColours();

const listFrom = (key) => {
  const block = config.match(new RegExp(`${key}:\\s*\\{([\\s\\S]*?)\\n {4}\\}`));
  return new Set(block ? [...block[1].matchAll(/^\s*'?([\w-]+)'?:/gm)].map((m) => m[1]) : []);
};

const customFonts = listFrom('fontFamily');
const customMaxWidths = listFrom('maxWidth');
const customAnimations = listFrom('animation');

/** Component classes declared in index.css, e.g. `.btn-primary { @apply ... }`. */
const componentClasses = new Set(
  [...css.matchAll(/^\s*\.([\w-]+)\s*\{/gm)].map((match) => match[1])
);

// ------------------------------------------------------------- the vocabulary

/**
 * The first hyphen-segment of every Tailwind utility this project uses. Its job is
 * to answer "could this token be a class at all?", which is what separates
 * `text-fixed` from the words in `'a fixed-length commitment'`.
 *
 * Listing them by hand is tedious but it is the only way to get a real answer
 * without running Tailwind. A missing entry produces a false failure, never a
 * missed one, so the list can be corrected as it is hit.
 */
const UTILITY_PREFIXES = new Set([
  // layout & box
  'flex', 'grid', 'col', 'row', 'gap', 'space', 'place', 'items', 'justify', 'self',
  'basis', 'grow', 'shrink', 'order', 'inset', 'top', 'right', 'bottom', 'left', 'z',
  'w', 'h', 'min', 'max', 'aspect', 'object', 'overflow', 'overscroll', 'float', 'clear',
  'inline', 'flow', 'content', 'size', 'columns', 'snap', 'isolation',
  // spacing
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'scroll',
  // typography
  'text', 'font', 'leading', 'tracking', 'list', 'whitespace', 'break', 'indent', 'align',
  'line', 'decoration', 'underline',
  // colour & border
  'bg', 'border', 'rounded', 'divide', 'ring', 'outline', 'shadow', 'opacity',
  'from', 'via', 'to', 'fill', 'stroke', 'accent', 'caret', 'placeholder',
  // effects & motion
  'transition', 'duration', 'delay', 'ease', 'animate', 'transform', 'translate',
  'scale', 'rotate', 'skew', 'origin', 'blur', 'backdrop', 'filter', 'mix',
  // interaction
  'cursor', 'select', 'pointer', 'resize', 'appearance', 'touch', 'will',
  // state helpers that appear as a first segment in a compound utility
  'sr', 'not',
]);

/**
 * Utilities that are a single bare word. A Tailwind class almost always has a
 * prefix and a value, so a lone word is either one of these, a component class
 * from index.css, or a mistake.
 */
const SINGLE_WORD_UTILITIES = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden', 'table', 'contents', 'flow-root',
  'relative', 'absolute', 'fixed', 'sticky', 'static',
  'italic', 'underline', 'truncate', 'uppercase', 'lowercase', 'capitalize',
  'container', 'group', 'peer', 'isolate', 'invisible', 'visible', 'collapse',
  'resize', 'transform', 'transition', 'antialiased', 'border', 'rounded',
  'outline', 'ring', 'shadow', 'filter', 'blur', 'grayscale', 'invert',
  'tabular-nums', 'sr-only', 'not-sr-only', 'overflow-auto', 'overflow-hidden',
]);

/** Could this token be a Tailwind class or one of ours? */
function classifiable(token) {
  if (!token) return false;
  if (token.includes('[')) return true; // arbitrary value, e.g. text-[15px]
  if (componentClasses.has(token) || SINGLE_WORD_UTILITIES.has(token)) return true;
  if (!token.includes('-')) return false;
  return UTILITY_PREFIXES.has(token.replace(/^-/, '').split('-')[0]);
}

/**
 * Every class token the app uses.
 *
 * Covers className="..." and the template literals used for conditional classes,
 * plus the @apply lines in index.css — those are Tailwind classes too, and a typo
 * in one breaks a component class everywhere at once.
 */
function collectTokens() {
  const tokens = new Map(); // token -> where it was first seen

  const add = (token, where) => {
    if (token && !tokens.has(token)) tokens.set(token, where);
  };

  /**
   * Does this string literal look like a class list rather than a sentence?
   *
   * Needed because the ternary sweep below cannot tell `cond ? 'btn-primary' :
   * 'btn-quiet'` from `cond ? 'a fixed-length commitment' : 'hours you control'` —
   * both are two string literals either side of a colon. So a branch is harvested
   * only when every single token could be a class. One unclassifiable word rejects
   * the whole branch, which is what stops prose reaching the checks below.
   */
  const looksLikeClasses = (text) => {
    const parts = text.split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every((part) => classifiable(part.split(':').pop()));
  };

  for (const [file, source] of sources) {
    const where = relative(CLIENT, file);
    for (const match of source.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const text = match[1] ?? match[2] ?? match[3] ?? '';
      // Drop ${...} interpolations — their contents are string literals elsewhere
      // in the same file and get picked up on their own.
      for (const token of text.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) add(token, where);
    }
    // Ternaries that produce a whole class list, e.g. cond ? 'btn-primary' : 'btn-quiet'
    for (const match of source.matchAll(/\?\s*'([^']*)'\s*:\s*'([^']*)'/g)) {
      for (const text of [match[1], match[2]]) {
        if (!looksLikeClasses(text)) continue;
        for (const token of text.split(/\s+/)) add(token, where);
      }
    }
  }

  for (const match of css.matchAll(/@apply\s+([^;]+);/g)) {
    for (const token of match[1].split(/\s+/)) add(token, 'src/index.css');
  }

  return tokens;
}

const tokens = collectTokens();

/** Utilities whose value is a colour. */
const COLOUR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'from', 'via', 'to',
  'placeholder', 'decoration', 'outline', 'accent', 'caret', 'fill', 'stroke', 'shadow',
];

/**
 * Tailwind's own scales for the three prefixes we also extend. `font-` is shared
 * with the font-weight utilities, which is why the weights are listed here.
 */
const STANDARD_FONT = new Set([
  'sans', 'serif', 'mono',
  'thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black',
]);

const STANDARD_ANIMATION = new Set(['none', 'spin', 'ping', 'pulse', 'bounce']);

const STANDARD_MAX_WIDTH = new Set([
  '0', 'none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl',
  'full', 'min', 'max', 'fit', 'prose',
  'screen-sm', 'screen-md', 'screen-lg', 'screen-xl', 'screen-2xl',
]);

const unclassified = [];

for (const [raw, where] of tokens) {
  // Strip variants (hover:, sm:, first:, focus-visible:) and any leading !
  const token = raw.split(':').pop().replace(/^!/, '');
  if (!token || token.startsWith('[')) continue;

  const colourPrefix = COLOUR_PREFIXES.find((prefix) => token.startsWith(`${prefix}-`));
  const value = colourPrefix ? token.slice(colourPrefix.length + 1) : null;

  // A token whose value names one of our colour families must name a real shade.
  if (value && colourFamilies.has(value.split('-')[0])) {
    if (!legalColours.has(value)) {
      const family = value.split('-')[0];
      const shades = [...colourFamilies.get(family)].join(', ');
      errors.push(
        `${where}: "${raw}" — there is no "${value}" in the palette (${family} has: ${shades})`
      );
    }
    continue;
  }

  /**
   * `font-`, `max-w-` and `animate-` are shared between our config and Tailwind's
   * own scale, so a name is only wrong when it is in neither. Without the standard
   * lists this flags `font-semibold` and `max-w-md`, which are perfectly valid.
   */
  const checkConfig = (prefix, set, standard, label) => {
    if (!token.startsWith(prefix)) return false;
    const name = token.slice(prefix.length);
    if (name.startsWith('[')) return true; // arbitrary value — Tailwind takes it as given
    if (!set.has(name) && !standard.has(name)) {
      errors.push(
        `${where}: "${raw}" — "${name}" is neither in ${label} nor a standard Tailwind value`
      );
    }
    return true;
  };

  if (checkConfig('font-', customFonts, STANDARD_FONT, 'tailwind.config.js fontFamily')) continue;
  if (checkConfig('animate-', customAnimations, STANDARD_ANIMATION, 'tailwind.config.js animation')) continue;
  if (checkConfig('max-w-', customMaxWidths, STANDARD_MAX_WIDTH, 'tailwind.config.js maxWidth')) continue;

  /**
   * Anything left is either an ordinary Tailwind utility — which this script has no
   * way to validate without running Tailwind — or a typo. `classifiable` separates
   * the two by shape: a real utility has a known first segment or is one of the
   * bare-word utilities, so `crad` and `bgg-paper` fall out here.
   */
  if (!classifiable(token)) {
    errors.push(`${where}: "${raw}" is neither a Tailwind utility nor declared in index.css`);
    continue;
  }

  unclassified.push(token);
}

// ============================================================ report

console.log(`Checked ${files.length} client modules.`);
console.log(`  imports:  ${importsChecked} bindings verified against their target module`);
console.log(`  classes:  ${tokens.size} distinct tokens`);
console.log(
  `  palette:  ${legalColours.size} legal colour tokens, ` +
    `${componentClasses.size} component classes in index.css`
);

if (process.argv.includes('--inventory')) {
  console.log('\nTokens not checkable against the config (standard Tailwind utilities):');
  console.log(
    [...new Set(unclassified)]
      .sort()
      .reduce((lines, token) => {
        const last = lines[lines.length - 1];
        if (last && last.length + token.length < 96) lines[lines.length - 1] = `${last}  ${token}`;
        else lines.push(`  ${token}`);
        return lines;
      }, [])
      .join('\n')
  );
}

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s):`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log('\nNo problems found.');
