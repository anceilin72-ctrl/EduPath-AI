import { Check } from 'lucide-react';

/**
 * The wizard's progress indicator.
 *
 * Five steps is enough that somebody halfway through wants to know how much is
 * left, and enough that they will abandon it if they cannot tell. Completed steps
 * are clickable so an answer can be changed without starting again; steps ahead are
 * not, because the later questions depend on the earlier answers.
 *
 * The bar is labelled for screen readers as a list with the current item marked,
 * rather than as a progressbar — it is navigation, not a measurement.
 */
export default function Stepper({ steps, current, onGoTo }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;

          const dot = done
            ? 'bg-done text-paper border-done'
            : active
              ? 'bg-effort text-paper border-effort'
              : 'bg-panel text-ink-faint border-rule';

          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={done ? () => onGoTo(i) : undefined}
                disabled={!done}
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${done ? 'hover:bg-panel' : ''} disabled:cursor-default`}
              >
                <span
                  className={`figure grid h-5 w-5 place-items-center rounded-full border text-[11px] font-semibold ${dot}`}
                >
                  {done ? <Check size={12} aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={`font-display text-xs font-semibold ${active ? 'text-ink' : 'text-ink-faint'}`}
                >
                  {label}
                </span>
              </button>

              {i < steps.length - 1 ? (
                <span aria-hidden="true" className={`h-px w-4 ${done ? 'bg-done' : 'bg-rule'}`} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
