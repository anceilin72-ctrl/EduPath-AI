import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  SkipForward,
  Target,
} from 'lucide-react';
import { Badge, TypeBadge, ResourceList } from './ui.jsx';
import { DIFFICULTY_LABELS, hours, label, plural } from '../lib/format.js';

/**
 * One step in a plan.
 *
 * The tick is deliberately the largest thing in the row: marking work done is the
 * action a learner performs dozens of times, and everything else — starting,
 * skipping, logging hours, reading the detail — is secondary to it.
 *
 * A step whose prerequisites are unfinished is not disabled, only marked. The
 * order is advice from the graph, not a permission system, and a learner who
 * already knows the material should not have to argue with the interface.
 */
export default function StepRow({ node, progress, blockedBy = [], onChange, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loggedDraft, setLoggedDraft] = useState(null);

  const status = progress?.status ?? 'not-started';
  const isDone = status === 'completed';
  const isSkipped = status === 'skipped';
  const isActive = status === 'in-progress';
  const settled = isDone || isSkipped;

  const hasDetail =
    node.description || node.checkpoints?.length > 0 || node.resources?.length > 0 || node.projectIdeas?.length > 0;

  async function commit(changes) {
    if (readOnly || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onChange?.(node.nodeKey, changes);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tickStyles = isDone
    ? 'bg-done border-done text-paper'
    : isSkipped
      ? 'bg-paper border-rule text-ink-faint'
      : isActive
        ? 'bg-effort-soft border-effort text-effort'
        : 'bg-card border-rule text-transparent hover:border-ink-faint';

  return (
    <li className={`border-t border-rule first:border-t-0 ${settled ? 'bg-paper/60' : ''}`}>
      <div className="flex gap-3 px-4 py-3.5">
        {/* --- the tick ------------------------------------------------- */}
        {readOnly ? (
          <span className="w-7 h-7 shrink-0 mt-0.5 rounded-full border border-rule bg-card" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => commit({ status: isDone ? 'not-started' : 'completed' })}
            disabled={busy}
            aria-pressed={isDone}
            aria-label={isDone ? `Mark ${node.title} as not done` : `Mark ${node.title} as done`}
            className={`w-7 h-7 shrink-0 mt-0.5 rounded-full border-2 grid place-items-center
                        transition-colors disabled:opacity-60 ${tickStyles}`}
          >
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </button>
        )}

        {/* --- the step ------------------------------------------------- */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h4
              className={`font-display text-base font-semibold ${settled ? 'text-ink-faint line-through decoration-1' : ''}`}
            >
              {node.title}
            </h4>
            <TypeBadge type={node.type ?? 'skill'} />
            {node.difficulty ? (
              <span className="text-sm text-ink-faint">{label(DIFFICULTY_LABELS, node.difficulty)}</span>
            ) : null}
            <span className="figure text-sm text-ink-faint">{hours(node.estimatedHours)}</span>
            {node.isRevision ? <Badge tone="done">Revision</Badge> : null}
          </div>

          {/* A revision step is here at half its usual hours, which looks like a
              mistake unless the reason is on the row. */}
          {node.isRevision ? (
            <p className="text-sm text-done mt-1.5">
              You called yourself a beginner at this, so it is half the usual time.
            </p>
          ) : null}

          {blockedBy.length > 0 && !settled ? (
            <p className="flex items-start gap-1.5 text-sm text-ink-faint mt-1.5">
              <Lock size={13} className="mt-1 shrink-0" aria-hidden="true" />
              <span>Comes after {blockedBy.join(', ')}.</span>
            </p>
          ) : null}

          {/* --- secondary actions ------------------------------------- */}
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
              {!isDone && !isActive ? (
                <button
                  type="button"
                  onClick={() => commit({ status: 'in-progress' })}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 font-display text-sm font-medium text-effort hover:underline"
                >
                  <Target size={14} aria-hidden="true" />
                  Start this
                </button>
              ) : null}

              {isActive ? (
                <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
                  <span className="font-display">Hours done</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={loggedDraft ?? progress?.hoursLogged ?? 0}
                    onChange={(event) => setLoggedDraft(event.target.value)}
                    onBlur={() => {
                      // Committed on blur, not on every keystroke: a request per
                      // digit would fight the user as they type "120".
                      if (loggedDraft === null) return;
                      const value = Number(loggedDraft);
                      setLoggedDraft(null);
                      if (Number.isFinite(value) && value !== (progress?.hoursLogged ?? 0)) {
                        commit({ hoursLogged: Math.max(0, value) });
                      }
                    }}
                    className="input w-20 py-1 figure text-sm"
                    aria-label={`Hours logged on ${node.title}`}
                  />
                  <span className="figure text-sm text-ink-faint">/ {node.estimatedHours ?? 0}</span>
                </label>
              ) : null}

              {!settled ? (
                <button
                  type="button"
                  onClick={() => commit({ status: 'skipped' })}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 font-display text-sm text-ink-faint hover:text-ink hover:underline"
                >
                  <SkipForward size={14} aria-hidden="true" />
                  Skip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => commit({ status: 'not-started' })}
                  disabled={busy}
                  className="font-display text-sm text-ink-faint hover:text-ink hover:underline"
                >
                  {isSkipped ? 'Put back' : 'Reopen'}
                </button>
              )}

              {hasDetail ? (
                <button
                  type="button"
                  onClick={() => setOpen((value) => !value)}
                  aria-expanded={open}
                  className="inline-flex items-center gap-1 font-display text-sm text-ink-soft hover:text-ink ml-auto"
                >
                  {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                  {open ? 'Less' : 'What this involves'}
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-warn mt-2" role="alert">
              {error}
            </p>
          ) : null}

          {/* --- detail ------------------------------------------------- */}
          {open && hasDetail ? (
            <div className="mt-3 pt-3 border-t border-rule space-y-3">
              {node.description ? <p className="text-ink-soft max-w-prose">{node.description}</p> : null}

              {node.checkpoints?.length > 0 ? (
                <div>
                  <p className="eyebrow mb-1.5">You know it when</p>
                  <ul className="space-y-1">
                    {node.checkpoints.map((checkpoint) => (
                      <li key={checkpoint} className="flex gap-2 text-ink-soft">
                        <Check size={15} className="mt-1.5 shrink-0 text-done" aria-hidden="true" />
                        <span>{checkpoint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {node.projectIdeas?.length > 0 ? (
                <div>
                  <p className="eyebrow mb-1.5">{plural(node.projectIdeas.length, 'project idea')}</p>
                  <ul className="space-y-1 text-ink-soft">
                    {node.projectIdeas.map((idea) => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="eyebrow mb-1.5">Where to learn it</p>
                <ResourceList resources={node.resources} emptyText="No resource added yet" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
