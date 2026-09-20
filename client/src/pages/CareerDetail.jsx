import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CareerBrief from '../components/CareerBrief.jsx';
import PhaseSpine from '../components/PhaseSpine.jsx';
import { Callout, Eyebrow, Field, Loading, Stat, TextInput, TypeBadge } from '../components/ui.jsx';
import { IMPORTANCE_LABELS, duration, hours, label, monthYear, plural } from '../lib/format.js';

/**
 * One career, and the button that turns it into a plan.
 *
 * The page answers three questions in this order: what is this job, do I want the
 * plan, and — only if you ask — what exactly is on it. The step list is long by
 * nature, so it lives behind a summary you have to open. Somebody deciding between
 * two careers should not have to scroll past forty steps to reach the button.
 *
 * There is one primary action. The preview is offered second, because the plan page
 * shows everything the preview does and more, and a plan can be deleted.
 */

/** Steps grouped by how necessary they are, core first. */
const GROUPS = ['core', 'recommended', 'optional'];

function StepList({ entries }) {
  return (
    <ul className="divide-y divide-rule">
      {entries.map(({ nodeKey, node, rationale }) => (
        <li key={nodeKey} className="py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display font-medium">{node?.title ?? nodeKey}</span>
            <TypeBadge type={node?.type ?? 'skill'} />
            <span className="figure text-sm text-ink-faint">
              {node?.fixedDurationWeeks
                ? plural(node.fixedDurationWeeks, 'week')
                : hours(node?.estimatedHours)}
            </span>
          </div>
          {rationale ? <p className="text-[15px] text-ink-soft mt-0.5">{rationale}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function CareerDetail() {
  const { key } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- what the plan gets built with ---------------------------------------
  const [hoursPerWeek, setHoursPerWeek] = useState(14);
  const [targetDate, setTargetDate] = useState('');
  const [includeOptional, setIncludeOptional] = useState(false);
  const [preview, setPreview] = useState(null);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.roles
      .get(key)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  // Start from the saved profile, so the default is the answer already given.
  useEffect(() => {
    if (user?.profile?.hoursPerWeek) setHoursPerWeek(user.profile.hoursPerWeek);
    if (user?.profile?.targetDate) setTargetDate(String(user.profile.targetDate).slice(0, 10));
  }, [user]);

  /**
   * Clamped here rather than with `required` on the input. The field sits inside a
   * closed <details>, and a browser cannot focus a hidden invalid control — it
   * refuses to submit the form and says nothing the learner can act on.
   */
  const overrides = () => ({
    roleKey: key,
    hoursPerWeek: Math.min(80, Math.max(1, Number(hoursPerWeek) || 10)),
    targetDate: targetDate ? new Date(targetDate).toISOString() : null,
    includeOptional,
  });

  async function runPreview() {
    setWorking(true);
    setFormError(null);

    try {
      const { roadmap } = await api.roadmaps.preview(overrides());
      setPreview(roadmap);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function generate(event) {
    event.preventDefault();
    setWorking(true);
    setFormError(null);

    try {
      const { roadmap } = await api.roadmaps.create(overrides());
      navigate(`/plans/${roadmap._id}`);
    } catch (err) {
      setFormError(err.message);
      setWorking(false);
    }
  }

  if (loading) return <Loading label="Loading this career" />;

  if (error) {
    return (
      <div className="max-w-prose">
        <Callout tone="error" title="Could not load this career">
          {error}
        </Callout>
        <Link to="/careers" className="btn-quiet mt-4">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to careers
        </Link>
      </div>
    );
  }

  const { role, summary } = data;
  const grouped = GROUPS.map((importance) => ({
    importance,
    entries: (role.requiredNodes ?? []).filter((entry) => entry.importance === importance),
  })).filter((group) => group.entries.length > 0);

  const knownCount = user?.profile?.knownNodeKeys?.length ?? 0;

  return (
    <div className="animate-rise-in max-w-3xl space-y-6">
      <Link to="/careers" className="btn-ghost px-0">
        <ArrowLeft size={15} aria-hidden="true" />
        All careers
      </Link>

      {/* The facts, laid out by the same component the wizard uses. */}
      <CareerBrief roleKey={key} data={data} hoursPerWeek={Number(hoursPerWeek) || null}>
        {/* ============================================== the one action */}
        <div className="card p-5">
          {user ? (
            <form onSubmit={generate}>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={working} className="btn-accent">
                  {working ? 'Working…' : 'Generate My Roadmap'}
                </button>
                <button type="button" onClick={runPreview} disabled={working} className="btn-quiet">
                  {preview ? 'Update the preview' : 'Preview it first'}
                </button>
              </div>

              <p className="text-sm text-ink-faint mt-2.5">
                Skips the {plural(knownCount, 'skill')} on{' '}
                <Link to="/profile" className="link">
                  your profile
                </Link>
                . Paced at <span className="figure">{hoursPerWeek}</span> hours a week.
              </p>

              <details className="mt-4">
                <summary className="font-display text-sm font-semibold cursor-pointer">
                  Change the hours or set a deadline
                </summary>

                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <Field label="Hours a week" htmlFor="hours">
                    <TextInput
                      id="hours"
                      type="number"
                      min="1"
                      max="80"
                      value={hoursPerWeek}
                      onChange={(event) => setHoursPerWeek(event.target.value)}
                      className="input figure"
                    />
                  </Field>

                  <Field label="Finish by" htmlFor="target" hint="Optional.">
                    <TextInput
                      id="target"
                      type="date"
                      value={targetDate}
                      onChange={(event) => setTargetDate(event.target.value)}
                    />
                  </Field>
                </div>

                <label className="flex items-start gap-2.5 mt-3 text-[15px]">
                  <input
                    type="checkbox"
                    checked={includeOptional}
                    onChange={(event) => setIncludeOptional(event.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-ink-soft">Add the optional steps. Makes the plan longer.</span>
                </label>
              </details>
            </form>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Want this as a plan?</h2>
              <p className="text-ink-soft mt-1.5">
                Sign up and this becomes a dated, ordered path built around your hours.
              </p>
              <Link to="/sign-up" className="btn-accent mt-4">
                Get started
              </Link>
            </>
          )}

          {formError ? (
            <div className="mt-4">
              <Callout tone="error">{formError}</Callout>
            </div>
          ) : null}
        </div>
      </CareerBrief>

      {/* ============================================== preview */}
      {preview ? (
        <section className="card p-5 animate-rise-in">
          <Eyebrow>Preview — nothing saved yet</Eyebrow>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
            <Stat label="Steps left" value={preview.totals.nodeCount} />
            <Stat label="Study time" value={hours(preview.totals.hours)} tone="effort" />
            <Stat label="Takes" value={duration(preview.totals.weeks, preview.totals.months)} />
            <Stat label="Done by" value={monthYear(preview.schedule.projectedFinishDate)} />
          </dl>

          {preview.readiness.alreadyMetCount > 0 ? (
            <p className="text-[15px] text-done mt-4">
              {plural(preview.readiness.alreadyMetCount, 'step')} skipped —{' '}
              {hours(preview.readiness.hoursSaved)} saved by what you know.
            </p>
          ) : null}

          {preview.schedule.targetDate && preview.schedule.onTrack === false ? (
            <div className="mt-4">
              <Callout tone="warn" title="That date does not fit">
                It needs <span className="figure">{preview.schedule.requiredHoursPerWeek}</span> hours
                a week. Raise your hours, or move the date out by about{' '}
                {plural(preview.schedule.shortfallWeeks, 'week')}.
              </Callout>
            </div>
          ) : null}

          {/* A picture of the calendar rather than a second list of the phases —
              the plan page lists them in full once the plan exists. */}
          <div className="mt-5 pt-4 border-t border-rule">
            <PhaseSpine phases={preview.phases} />
          </div>
        </section>
      ) : null}

      {/* ============================================== the steps, on request */}
      <section className="card p-5">
        <details>
          <summary className="font-display font-semibold cursor-pointer">
            All {summary.stepCount} steps on this path
          </summary>

          {grouped.map(({ importance, entries }) => (
            <div key={importance} className="mt-5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-lg font-semibold">{label(IMPORTANCE_LABELS, importance)}</h2>
                <span className="figure text-sm text-ink-faint">{plural(entries.length, 'step')}</span>
              </div>
              {importance === 'optional' ? (
                <p className="text-[15px] text-ink-faint mt-0.5">Left out unless you ask for them.</p>
              ) : null}
              <div className="mt-2">
                <StepList entries={entries} />
              </div>
            </div>
          ))}

          {role.typicalEntryPaths?.length > 0 ? (
            <div className="mt-6 pt-4 border-t border-rule">
              <Eyebrow>How people get in</Eyebrow>
              <ul className="mt-2 space-y-2">
                {role.typicalEntryPaths.map((path) => (
                  <li key={path} className="text-ink-soft border-l-2 border-rule pl-3">
                    {path}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
      </section>
    </div>
  );
}
