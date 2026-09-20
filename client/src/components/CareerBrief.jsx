import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  DEMAND_LABELS,
  DIFFICULTY_LABELS,
  DOMAIN_LABELS,
  EDUCATION_LABELS,
  duration,
  hours,
  label,
  salaryRange,
} from '../lib/format.js';
import { Callout, Loading, Stat } from './ui.jsx';

/**
 * What one career involves, in six facts and a list.
 *
 * Shared by the wizard's last step and the public career page so the two cannot
 * describe the same job differently. The action underneath is passed in, because
 * that is the only thing that changes: the wizard generates a plan, the public page
 * invites you to sign up.
 *
 * `data` is an escape hatch for a caller that has already fetched this role. The
 * career page needs the same payload for its step list, and without this it would
 * request the role twice and show two loading spinners one after the other.
 */

const RANK = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * A career's difficulty, derived rather than declared.
 *
 * The hardest thing a path requires is what makes it hard, so this reports the
 * toughest step on it. Averaging would call every path "intermediate", which is true
 * of none of them and useful for none of them.
 */
function difficultyOf(requiredNodes = []) {
  let worst = 'beginner';
  for (const entry of requiredNodes) {
    const difficulty = entry.node?.difficulty;
    if (difficulty && (RANK[difficulty] ?? 0) > RANK[worst]) worst = difficulty;
  }
  return worst;
}

export default function CareerBrief({ roleKey, hoursPerWeek, data: given, children }) {
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (given) return undefined;

    let cancelled = false;
    setFetched(null);
    setError(null);

    api.roles
      .get(roleKey)
      .then((payload) => {
        if (!cancelled) setFetched(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [roleKey, given]);

  const data = given ?? fetched;

  if (error) return <Callout tone="error">{error}</Callout>;
  if (!data) return <Loading label="Loading this career" />;

  const { role, summary } = data;
  const core = (role.requiredNodes ?? []).filter((r) => r.importance === 'core');
  const difficulty = difficultyOf(role.requiredNodes);
  const salary = salaryRange(role.salaryINR);

  // Weeks at the learner's own pace, when we know it. Without a pace, hours are the
  // only honest figure — "6 months" means nothing until you say six months of what.
  const weeks = hoursPerWeek ? Math.ceil(summary.totalHours / hoursPerWeek) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">{label(DOMAIN_LABELS, role.domain)}</p>
        <h2 className="mt-1.5 text-2xl font-semibold">{role.title}</h2>
        <p className="mt-1.5 text-ink-soft max-w-prose">{role.description}</p>
      </div>

      <div className="card p-5 grid gap-5 sm:grid-cols-3">
        <Stat label="Difficulty" value={label(DIFFICULTY_LABELS, difficulty)} />
        <Stat label="Steps" value={summary.stepCount} hint={`${hours(summary.totalHours)} of work`} />
        <Stat
          label="Learning time"
          value={weeks ? duration(weeks, weeks / 4.345) : hours(summary.totalHours)}
          tone="effort"
          hint={hoursPerWeek ? `at ${hoursPerWeek} hours a week` : 'depends on your weekly hours'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="eyebrow">Main skills</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {core.slice(0, 8).map((entry) => (
              <li key={entry.nodeKey} className="chip">
                {entry.node?.title ?? entry.nodeKey}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4 space-y-1.5 text-sm">
          <p className="eyebrow">Good to know</p>
          <p className="text-ink-soft">
            Needs {label(EDUCATION_LABELS, role.minimumEducation).toLowerCase()} at a minimum.
          </p>
          <p className="text-ink-soft">{label(DEMAND_LABELS, role.demandLevel)} in India.</p>
          {salary ? (
            <p className="text-ink-soft">
              Pay <span className="figure">{salary}</span>
            </p>
          ) : null}
        </div>
      </div>

      {summary.hasCalendarBoundSteps ? (
        <Callout tone="info">
          This path includes a degree or placement with a fixed length. Studying more hours a
          week will not shorten that part.
        </Callout>
      ) : null}

      {children}
    </div>
  );
}
