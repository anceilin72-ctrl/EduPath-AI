import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { DOMAIN_LABELS, LEVEL_LABELS, label } from '../lib/format.js';
import { Loading } from './ui.jsx';

/**
 * Rating what you already know.
 *
 * ONE QUESTION PER SKILL
 * ----------------------
 * The obvious design is a checkbox to say "I know this" and a level control that
 * appears once it is ticked. That is two decisions per skill, and the second one is
 * hidden until the first is made — so the learner cannot see what the levels even
 * are while deciding whether to tick anything.
 *
 * This asks once. "Not yet" is a real answer and the default, so every skill is in
 * exactly one of four states and nothing is hidden. The absence of a rating and the
 * answer "not yet" mean the same thing to the engine, which is what makes the
 * simplification safe.
 *
 * WHAT EACH ANSWER DOES
 * ---------------------
 * Stated on screen, not just in a tooltip, because the answers change the plan:
 * comfortable or strong removes a step, just-started halves it. A learner who thinks
 * they are being asked for a self-assessment will answer differently from one who
 * knows they are editing their own plan.
 */

const CHOICES = [
  { value: null, label: 'Not yet' },
  { value: 'beginner', label: LEVEL_LABELS.beginner },
  { value: 'intermediate', label: LEVEL_LABELS.intermediate },
  { value: 'advanced', label: LEVEL_LABELS.advanced },
];

const SELECTED_STYLE = {
  beginner: 'bg-effort-soft text-effort',
  intermediate: 'bg-done-soft text-done',
  advanced: 'bg-done text-paper',
};

const DOMAIN_ORDER = ['technology', 'business', 'creative', 'healthcare', 'government', 'education'];

const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

function LevelChoice({ nodeKey, value, onChange }) {
  return (
    <div className="seg shrink-0" role="group" aria-label={`Your level at ${nodeKey}`}>
      {CHOICES.map((choice) => {
        const selected = (value ?? null) === choice.value;
        const style = selected
          ? (SELECTED_STYLE[choice.value] ?? 'bg-panel text-ink')
          : '';

        return (
          <button
            key={choice.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(choice.value)}
            className={`seg-btn ${style} ${selected ? '' : 'hover:bg-panel'}`}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SkillPicker({ levels, onChange, autoFocus = false }) {
  const [nodes, setNodes] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('technology');

  useEffect(() => {
    let cancelled = false;

    api.nodes
      .search({ type: 'skill', limit: 200 })
      .then(({ nodes: found }) => {
        if (!cancelled) setNodes(found);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Grouped by field, easiest first — the order somebody would learn them in. */
  const groups = useMemo(() => {
    if (!nodes) return [];
    const text = query.trim().toLowerCase();

    const matching = text
      ? nodes.filter(
          (n) =>
            n.title.toLowerCase().includes(text) ||
            (n.aliases ?? []).some((a) => a.toLowerCase().includes(text))
        )
      : nodes;

    return DOMAIN_ORDER.map((domain) => ({
      domain,
      items: matching
        .filter((n) => n.domain === domain)
        .sort(
          (a, b) =>
            (DIFFICULTY_RANK[a.difficulty] ?? 1) - (DIFFICULTY_RANK[b.difficulty] ?? 1) ||
            a.title.localeCompare(b.title)
        ),
    })).filter((group) => group.items.length > 0);
  }, [nodes, query]);

  if (!nodes) return <Loading label="Loading skills" />;

  const ratedCount = Object.keys(levels).length;
  const searching = query.trim().length > 0;

  const set = (nodeKey) => (value) => {
    const next = { ...levels };
    if (value === null) delete next[nodeKey];
    else next[nodeKey] = value;
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem]">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search skills"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus={autoFocus}
            aria-label="Search skills"
          />
        </div>
        <p className="figure text-sm text-ink-faint">{ratedCount} rated</p>
      </div>

      {groups.length === 0 ? (
        <p className="panel px-4 py-3 text-sm text-ink-soft">
          Nothing matches “{query.trim()}”. Try a shorter word.
        </p>
      ) : null}

      {groups.map(({ domain, items }) => {
        // A search result is no use collapsed, so searching opens everything.
        const expanded = searching || open === domain;
        const ratedHere = items.filter((n) => levels[n.key]).length;

        return (
          <section key={domain} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(expanded && !searching ? null : domain)}
              aria-expanded={expanded}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-panel transition-colors"
            >
              <span className="font-display font-semibold">{label(DOMAIN_LABELS, domain)}</span>
              <span className="flex items-center gap-2 text-sm text-ink-faint">
                {ratedHere > 0 ? <span className="figure text-done">{ratedHere}</span> : null}
                <span className="figure">{items.length}</span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </span>
            </button>

            {expanded ? (
              <ul className="divide-y divide-rule border-t border-rule">
                {items.map((node) => (
                  <li
                    key={node.key}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{node.title}</span>
                      <span className="figure text-xs text-ink-faint ml-2">{node.estimatedHours} h</span>
                    </span>
                    <LevelChoice nodeKey={node.title} value={levels[node.key]} onChange={set(node.key)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Split ratings into what the API wants.
 *
 * `knownNodeKeys` is the older, two-state field and other screens still read it, so
 * it is kept in step here rather than left to drift: comfortable and strong are
 * claims of knowledge, just-started is not.
 */
export function splitLevels(levels) {
  const entries = Object.entries(levels);
  return {
    skillLevels: { ...levels },
    knownNodeKeys: entries.filter(([, level]) => level !== 'beginner').map(([key]) => key),
  };
}
