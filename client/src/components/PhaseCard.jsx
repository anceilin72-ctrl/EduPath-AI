import { CalendarClock, CircleCheckBig, Sparkles } from 'lucide-react';
import StepRow from './StepRow.jsx';
import { Badge } from './ui.jsx';
import { hours, plural } from '../lib/format.js';

/**
 * One phase of a plan, with its steps.
 *
 * A fixed-length phase is framed differently from an effort phase all the way
 * down: blue accents, a calendar icon, and a heading that talks about a duration
 * rather than a workload. Two phases can both say "52 weeks" and mean completely
 * different things, and the card should not let that read the same way.
 */
export default function PhaseCard({
  phase,
  note,
  tally,
  progress = {},
  onChange,
  readOnly = false,
  isCurrent = false,
  adaptiveSteps = [],
}) {
  const complete = tally?.isComplete ?? false;
  const nodeKeysInPhase = new Set(phase.nodes.map((n) => n.nodeKey));

  /**
   * Which of this step's prerequisites are still outstanding. Prerequisites that
   * are not in the plan at all are ignored: the engine pruned them because the
   * learner already knows them, so treating them as blockers would put a lock on
   * a step they can genuinely start today.
   */
  const outstandingFor = (node) =>
    (node.prerequisites ?? [])
      .filter((key) => {
        if (!nodeKeysInPhase.has(key)) return false;
        const status = progress[key]?.status ?? 'not-started';
        return status !== 'completed' && status !== 'skipped';
      })
      .map((key) => phase.nodes.find((n) => n.nodeKey === key)?.title ?? key);

  return (
    <section
      id={`phase-${phase.index}`}
      // scroll-mt keeps the heading clear of the sticky column when the spine
      // jumps here.
      className={`card scroll-mt-6 overflow-hidden ${isCurrent ? 'ring-1 ring-ink' : ''}`}
      aria-labelledby={`phase-${phase.index}-title`}
    >
      <header
        className={`px-4 py-3.5 border-b border-rule ${phase.calendarBound ? 'bg-fixed-soft' : 'bg-paper'}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2.5 min-w-0">
            {/* Spelt out rather than "01". The number alone reads as a catalog
                code; "Phase 3" is the thing the learner is actually looking for. */}
            <span
              className={`font-display text-sm font-semibold whitespace-nowrap
                          ${phase.calendarBound ? 'text-fixed' : 'text-effort'}`}
            >
              Phase <span className="figure">{phase.index}</span>
            </span>
            <h3 id={`phase-${phase.index}-title`} className="text-lg font-semibold">
              {phase.title.replace(/^phase\s+\d+:\s*/i, '')}
            </h3>
            {complete ? (
              <Badge tone="done">
                <CircleCheckBig size={11} aria-hidden="true" />
                Done
              </Badge>
            ) : null}
          </div>

          <p className="figure text-sm text-ink-soft">
            weeks {phase.startWeek}–{phase.endWeek}
            <span className="text-ink-faint"> · </span>
            {phase.calendarBound ? plural(phase.weeks, 'week') : hours(phase.hours)}
          </p>
        </div>

        {phase.calendarBound ? (
          <p className="flex items-start gap-1.5 text-sm text-fixed mt-1.5">
            <CalendarClock size={14} className="mt-1 shrink-0" aria-hidden="true" />
            <span>Fixed length — {plural(phase.weeks, 'week')} whatever your weekly hours.</span>
          </p>
        ) : null}

        {tally ? (
          <p className="text-sm text-ink-faint mt-1.5">
            <span className="figure">
              {tally.completed}/{tally.total}
            </span>{' '}
            steps done
          </p>
        ) : null}
      </header>

      {note ? (
        <p className="px-4 py-3 text-ink-soft border-b border-rule max-w-prose">{note}</p>
      ) : null}

      <ul>
        {phase.nodes.map((node) => {
          const inserted = adaptiveSteps.filter((s) => s.insertAfterKey === node.nodeKey);
          return (
            <div key={node.nodeKey}>
              <StepRow
                node={node}
                progress={progress[node.nodeKey]}
                blockedBy={outstandingFor(node)}
                onChange={onChange}
                readOnly={readOnly}
              />
              {inserted.map((step) => (
                <li
                  key={step.nodeKey}
                  className="px-4 py-3 border-b border-rule bg-done-soft flex items-start gap-3 text-sm pl-8"
                >
                  <Sparkles size={16} className="text-done shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{step.title}</span>
                      <span className="px-1.5 py-0.5 text-xs font-mono font-semibold rounded bg-done-soft text-done border border-done">
                        NEW
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft mt-0.5">{step.reason}</p>
                  </div>
                </li>
              ))}
            </div>
          );
        })}
      </ul>
    </section>
  );
}
