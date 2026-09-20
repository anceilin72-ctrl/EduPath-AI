import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Plus, Scale, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, EmptyState, Loading, SectionHeading } from '../components/ui.jsx';
import {
  DOMAIN_LABELS,
  duration,
  hours,
  label,
  monthYear,
  plural,
  relativeDate,
} from '../lib/format.js';

/**
 * The plans a learner has saved.
 *
 * Deliberately factual rather than motivational. Each card answers the questions
 * someone returning after a fortnight actually has: how long is this, when does it
 * finish, and how much of it did my existing skills already cover.
 */
export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    return api.roadmaps
      .list({ includeArchived: showArchived ? 'true' : undefined })
      .then(({ roadmaps }) => setPlans(roadmaps))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  async function setArchived(id, isArchived) {
    setBusyId(id);
    try {
      await api.roadmaps.archive(id, isArchived);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(plan) {
    // A plan carries progress with it, so deleting is worth one confirmation.
    const ok = window.confirm(`Delete your ${plan.roleTitle} plan? Your ticks on it go too.`);
    if (!ok) return;

    setBusyId(plan._id);
    try {
      await api.roadmaps.remove(plan._id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-rise-in">
      <SectionHeading
        eyebrow="Saved"
        title="My plans"
        action={
          <Link to="/careers" className="btn-accent">
            <Plus size={16} aria-hidden="true" />
            New plan
          </Link>
        }
      >
        Open one to tick things off. A second plan for another career costs nothing.
      </SectionHeading>

      {error ? (
        <div className="mb-5">
          <Callout tone="error">{error}</Callout>
        </div>
      ) : null}

      {loading ? (
        <Loading label="Loading your plans" />
      ) : plans.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Nothing here yet' : 'No plans yet'}
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Link to="/careers" className="btn-accent">
                Browse careers
              </Link>
              <Link to="/compare" className="btn-quiet">
                <Scale size={15} aria-hidden="true" />
                Which fits me best?
              </Link>
            </div>
          }
        >
          Pick a career and we turn it into a dated schedule built around your hours.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {plans.map((plan) => (
            <li key={plan._id}>
              <div className={`card p-5 ${plan.isArchived ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link to={`/plans/${plan._id}`} className="text-xl font-semibold hover:underline">
                        {plan.roleTitle}
                      </Link>
                      <Badge>{label(DOMAIN_LABELS, plan.roleDomain)}</Badge>
                      {plan.isArchived ? <Badge tone="neutral">Archived</Badge> : null}
                    </div>
                    <p className="text-sm text-ink-faint mt-1">
                      Built {relativeDate(plan.createdAt)} · <span className="figure">{plan.input.hoursPerWeek}</span>{' '}
                      hours a week
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setArchived(plan._id, !plan.isArchived)}
                      disabled={busyId === plan._id}
                      className="btn-ghost"
                    >
                      {plan.isArchived ? (
                        <>
                          <ArchiveRestore size={15} aria-hidden="true" />
                          Restore
                        </>
                      ) : (
                        <>
                          <Archive size={15} aria-hidden="true" />
                          Archive
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(plan)}
                      disabled={busyId === plan._id}
                      className="btn-ghost text-ink-faint hover:text-warn"
                      aria-label={`Delete the ${plan.roleTitle} plan`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-rule text-[15px]">
                  <div>
                    <dt className="eyebrow">Steps</dt>
                    <dd className="figure font-semibold mt-0.5">{plan.totals.nodeCount}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Study time</dt>
                    <dd className="figure font-semibold mt-0.5 text-effort">{hours(plan.totals.hours)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Length</dt>
                    <dd className="figure font-semibold mt-0.5">
                      {duration(plan.totals.weeks, plan.totals.months)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Finishes</dt>
                    <dd className="figure font-semibold mt-0.5">
                      {monthYear(plan.schedule.projectedFinishDate)}
                    </dd>
                  </div>
                </dl>

                {plan.readiness.alreadyMetCount > 0 ? (
                  <p className="text-[15px] text-done mt-3">
                    {plural(plan.readiness.alreadyMetCount, 'step')} skipped — {hours(plan.readiness.hoursSaved)}{' '}
                    saved by what you already know.
                  </p>
                ) : null}

                {plan.schedule.targetDate && plan.schedule.onTrack === false ? (
                  <p className="text-[15px] text-warn mt-3">
                    Your {monthYear(plan.schedule.targetDate)} target needs{' '}
                    <span className="figure">{plan.schedule.requiredHoursPerWeek}</span> hours a week at
                    this scope.
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-center gap-2 mt-6 text-[15px] text-ink-soft">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived plans
      </label>
    </div>
  );
}
