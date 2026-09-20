import { useState } from 'react';
import { Check, ChevronDown, RotateCw } from 'lucide-react';
import { hours, plural } from '../lib/format.js';

/**
 * Already known versus still to learn.
 *
 * WHY THIS IS READ OFF THE PLAN AND NOT ASKED FOR AGAIN
 * ----------------------------------------------------
 * The obvious build is a screen before the plan that calls the gap endpoint. That
 * makes the same comparison twice from two requests, and the two can disagree — the
 * learner rates a skill between the two screens and the percentages differ by the
 * time they reach the plan.
 *
 * A generated plan already contains both halves. `skipped` is what was dropped and
 * why; the steps that survived are what is left. So this reads the saved plan, and
 * the number here is the number on the plan by construction rather than by luck.
 *
 * THREE STATES, NOT TWO
 * ---------------------
 * Revision sits between them. A step rated "just started" was not dropped and is not
 * new either — it stays at half its hours. Filing it under "need to learn" without
 * saying so would make the plan look like it ignored the rating.
 */
export default function SkillGapPanel({ roadmap }) {
  const [open, setOpen] = useState(false);

  const known = roadmap.skipped ?? [];
  const steps = (roadmap.phases ?? []).flatMap((phase) => phase.nodes ?? []);
  const revision = steps.filter((node) => node.isRevision);
  const fresh = steps.filter((node) => !node.isRevision);

  const savedHours = known.reduce((sum, entry) => sum + (entry.hoursSaved ?? 0), 0);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-5 py-4 text-left hover:bg-panel transition-colors"
      >
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-lg font-semibold">What you already know</span>
          <span className="flex items-center gap-2 text-sm text-ink-faint">
            <span className="figure text-done">{known.length} skipped</span>
            <span>·</span>
            <span className="figure">{fresh.length + revision.length} to learn</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </span>
        <span className="block mt-1 text-sm text-ink-soft">
          {known.length > 0
            ? `Your answers took ${hours(savedHours)} off this plan.`
            : 'Nothing was skipped — rate your skills and this plan gets shorter.'}
        </span>
      </button>

      {open ? (
        <div className="grid gap-0 sm:grid-cols-2 border-t border-rule divide-y sm:divide-y-0 sm:divide-x divide-rule">
          {/* ------------------------------------------------ already known */}
          <div className="p-5">
            <p className="eyebrow">Already known</p>

            {known.length === 0 ? (
              <p className="mt-2 text-sm text-ink-faint">Nothing yet.</p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {known.map((entry) => (
                  <li key={entry.nodeKey} className="flex items-start gap-2 text-[15px]">
                    <Check size={15} aria-hidden="true" className="mt-1 shrink-0 text-done" />
                    <span>
                      {entry.title}
                      {/* "Assumed" earns its own word: this one was never claimed, it
                          was implied by something else the learner said they knew. */}
                      {entry.inferred ? (
                        <span className="block text-xs text-ink-faint">
                          Assumed from your other skills
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ------------------------------------------------- need to learn */}
          <div className="p-5">
            <p className="eyebrow">Need to learn</p>

            {revision.length > 0 ? (
              <p className="mt-2 flex items-start gap-2 text-sm text-effort">
                <RotateCw size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  {plural(revision.length, 'step')} kept as revision, at half the usual hours.
                </span>
              </p>
            ) : null}

            <ul className="mt-2.5 space-y-1.5">
              {[...revision, ...fresh].slice(0, 14).map((node) => (
                <li key={node.nodeKey} className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span>
                    {node.title}
                    {node.isRevision ? (
                      <span className="text-xs text-effort ml-1.5">revision</span>
                    ) : null}
                  </span>
                  <span className="figure text-sm text-ink-faint shrink-0">
                    {hours(node.estimatedHours)}
                  </span>
                </li>
              ))}
            </ul>

            {steps.length > 14 ? (
              <p className="mt-2.5 text-sm text-ink-faint">
                and {steps.length - 14} more, listed in the phases below.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
