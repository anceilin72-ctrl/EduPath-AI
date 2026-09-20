import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, CalendarClock, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import PhaseCard from '../components/PhaseCard.jsx';
import PhaseChain from '../components/PhaseChain.jsx';
import SkillGapPanel from '../components/SkillGapPanel.jsx';
import { Badge, Callout, Loading, Meter, Stat } from '../components/ui.jsx';
import { DOMAIN_LABELS, duration, hours, label, monthYear, plural } from '../lib/format.js';

/**
 * One plan.
 *
 * THE THREE FIGURES AT THE TOP
 * ----------------------------
 * Readiness, how long it takes, and the hours a day it assumes. Those three make the
 * plan legible: the first says how far along you are, the second is the answer to the
 * question everybody actually asks, and the third is the assumption the second
 * depends on — a duration without the hours behind it is a number with no meaning.
 *
 * Readiness is measured in hours rather than steps. Ticking five short steps out of
 * twenty looks like 25% while the fifteen left hold 90% of the work, and the
 * flattering version of that is a small lie told on every page load.
 *
 * Progress writes return the recalculated summary, so a tick updates the meter, the
 * phase tallies and "next up" from one request rather than refetching the plan.
 */
export default function PlanDetail() {
  const { id } = useParams();

  const [state, setState] = useState(null);
  const [pendingDecisions, setPendingDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      api.roadmaps.get(id),
      api.roadmaps.agentDecisions(id, { status: 'PENDING' }).catch(() => ({ decisions: [] })),
    ])
      .then(([roadmapData, decisionsData]) => {
        setState(roadmapData);
        setPendingDecisions(decisionsData.decisions ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Merge one step's new state in place, using the summary the server just sent. */
  const changeStep = useCallback(
    async (nodeKey, changes) => {
      const { progress, summary } = await api.progress.set(id, nodeKey, changes);
      setState((current) => ({
        ...current,
        progress: { ...current.progress, [nodeKey]: progress },
        summary,
      }));
    },
    [id]
  );

  async function resetProgress() {
    if (!window.confirm('Clear every tick on this plan? The plan itself stays.')) return;

    setWorking(true);
    try {
      await api.progress.reset(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function regenerate() {
    if (!window.confirm('Rebuild this plan from your profile? Steps that stay keep their ticks.')) {
      return;
    }

    setWorking(true);
    try {
      const fresh = await api.roadmaps.regenerate(id);
      setState((current) => ({ ...current, ...fresh }));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <Loading label="Loading your plan" />;

  if (error && !state) {
    return (
      <div className="max-w-prose">
        <Callout tone="error" title="Could not open this plan">
          {error}
        </Callout>
        <Link to="/home" className="btn-quiet mt-4">
          <ArrowLeft size={15} aria-hidden="true" />
          Back
        </Link>
      </div>
    );
  }

  const { roadmap, progress, summary } = state;
  const tallyFor = (index) => summary.phases.find((phase) => phase.index === index);
  const currentPhase = summary.nextUp[0]?.phaseIndex ?? null;
  const hoursPerDay = Math.round((roadmap.input.hoursPerWeek / 7) * 10) / 10;

  return (
    <div className="animate-rise-in space-y-6">
      <Link to="/home" className="btn-ghost px-0">
        <ArrowLeft size={15} aria-hidden="true" />
        Home
      </Link>

      {/* ============================================================ header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{roadmap.roleTitle}</h1>
            <Badge>{label(DOMAIN_LABELS, roadmap.roleDomain)}</Badge>
          </div>
          <p className="text-sm text-ink-faint mt-1.5">
            {plural(roadmap.totals.phaseCount, 'phase')} ·{' '}
            <Link to={`/careers/${roadmap.roleKey}`} className="link">
              about this career
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          <Link to={`/plans/${id}/adapt`} className="btn-accent relative">
            <BrainCircuit size={15} aria-hidden="true" />
            Adaptive AI
            {pendingDecisions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-paper text-ink font-mono font-bold">
                {pendingDecisions.length}
              </span>
            )}
          </Link>
          <button type="button" onClick={regenerate} disabled={working} className="btn-quiet">
            <RefreshCw size={15} aria-hidden="true" />
            Rebuild
          </button>
          <button type="button" onClick={resetProgress} disabled={working} className="btn-ghost">
            <RotateCcw size={15} aria-hidden="true" />
            Clear ticks
          </button>
        </div>
      </header>

      {error ? <Callout tone="error">{error}</Callout> : null}

      {/* ================================================== the three figures */}
      <section className="card p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Stat
            label="Career readiness"
            value={`${summary.percentByHours}%`}
            tone="done"
            hint={`${hours(summary.hoursCompleted)} of ${hours(summary.totalHours)}`}
          />
          <Stat
            label="Estimated duration"
            value={duration(roadmap.totals.weeks, roadmap.totals.months)}
            tone="effort"
            hint={`finishes around ${monthYear(roadmap.schedule.projectedFinishDate)}`}
          />
          <Stat
            label="Study time"
            value={hoursPerDay}
            unit="h / day"
            hint={`${roadmap.input.hoursPerWeek} hours a week`}
          />
        </div>

        <Meter
          value={summary.percentByHours}
          label="Hours done"
          caption={
            summary.percentByNodes !== summary.percentByHours
              ? `${summary.completedNodes} of ${summary.totalNodes} steps ticked — a different figure, because steps are not the same size.`
              : `${summary.completedNodes} of ${summary.totalNodes} steps ticked.`
          }
        />
      </section>

      {summary.isComplete ? (
        <Callout tone="success" title="Every step is done">
          Worth rebuilding this against your profile now — with these skills confirmed, a harder
          target may be closer than you think.
        </Callout>
      ) : null}

      {pendingDecisions.length > 0 ? (
        <Callout tone="info" title={`Adaptive Agent has ${plural(pendingDecisions.length, 'recommendation')}`}>
          Based on your latest assessments and progress, the adaptive agent recommends updates to your roadmap.{' '}
          <Link to={`/plans/${id}/adapt`} className="link font-semibold">
            Review recommendations &rarr;
          </Link>
        </Callout>
      ) : null}

      {/* ======================================================= skill gap */}
      <SkillGapPanel roadmap={roadmap} />

      {/* ========================================================== notes */}
      {roadmap.narrative?.summary ? (
        <section className="panel p-5">
          <p className="flex items-center gap-1.5 eyebrow mb-2">
            <Sparkles size={12} aria-hidden="true" />
            Your plan in plain words
          </p>
          <p className="text-ink-soft max-w-prose">{roadmap.narrative.summary}</p>
          <p className="text-xs text-ink-faint mt-3">
            {roadmap.narrative.source === 'ai'
              ? 'Worded by Gemini from the figures above. The plan itself was computed, not generated.'
              : 'Written from the plan’s own figures.'}
          </p>
        </section>
      ) : null}

      {roadmap.schedule.targetDate && roadmap.schedule.onTrack === false ? (
        <Callout tone="warn" title={`Your ${monthYear(roadmap.schedule.targetDate)} target does not fit`}>
          Hitting it would take <span className="figure">{roadmap.schedule.requiredHoursPerWeek}</span>{' '}
          hours a week, not <span className="figure">{roadmap.input.hoursPerWeek}</span>. Moving the
          date out about {plural(roadmap.schedule.shortfallWeeks, 'week')} makes it honest — change it
          on{' '}
          <Link to="/profile" className="link">
            your profile
          </Link>{' '}
          and rebuild.
        </Callout>
      ) : null}

      {/* Notes are { level, message } objects from the engine, so the message has to
          be pulled out — rendering the object itself crashes React. */}
      {(roadmap.notes ?? []).map((note) => (
        <Callout key={note.message} tone={note.level === 'warning' ? 'warn' : 'info'}>
          {note.message}
        </Callout>
      ))}

      {/* ========================================================= phases */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Your path, in order</h2>

        <PhaseChain>
          {roadmap.phases.map((phase, i) => (
            <PhaseCard
              key={phase.index}
              phase={phase}
              note={roadmap.narrative?.phaseNotes?.[i]}
              tally={tallyFor(phase.index)}
              progress={progress}
              onChange={changeStep}
              isCurrent={phase.index === currentPhase}
              adaptiveSteps={roadmap.adaptiveSteps}
            />
          ))}
        </PhaseChain>
      </section>

      {roadmap.phases.some((phase) => phase.calendarBound) ? (
        <p className="flex items-start gap-2 text-sm text-fixed">
          <CalendarClock size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Phases marked in blue have a fixed length. Studying more hours a week will not shorten
            them.
          </span>
        </p>
      ) : null}
    </div>
  );
}
