/**
 * The spine — the one visual idea this app is built around.
 *
 * A list of phases tells you the order. It does not tell you that phase three is
 * four years long and phase four is six weeks, which is the single most important
 * thing about a plan that contains a degree. So each segment's height here is its
 * real share of the calendar, and the two kinds of time are drawn in different
 * materials:
 *
 *   hatched ochre — hours you control. Divisible into study sessions, and it gets
 *                   shorter if you find more hours in the week.
 *   solid blue    — a fixed-length commitment. One unbroken block, because a B.Sc
 *                   is 208 weeks whether you study 10 hours a week or 40.
 *
 * On a nursing plan the degree becomes an enormous solid slab that dwarfs
 * everything else, and that is the honest picture. Proportions come from flexbox:
 * flex-grow set to the phase's week count, with a minimum height so a two-week
 * phase stays clickable. The browser redistributes the difference, so short phases
 * never disappear and long ones stay visibly long.
 */
import { plural } from '../lib/format.js';

/**
 * 45° hatching. Fine enough to read as texture, coarse enough to see it is made of
 * parts. The two ambers are the palette's `effort` and a darker shade of it, so the
 * bar means the same thing here as every hours figure elsewhere in the app.
 */
export const HATCH = {
  backgroundImage: 'repeating-linear-gradient(45deg, #B47B1E 0 3px, #F0A93C 3px 7px)',
};

/** The palette's `fixed`. One unbroken block, because a degree is one commitment. */
export const SOLID = { backgroundColor: '#6AA0FF' };

export default function PhaseSpine({ phases = [], currentPhaseIndex = null, onSelect }) {
  if (phases.length === 0) return null;

  const totalWeeks = phases[phases.length - 1]?.endWeek ?? 0;
  const fixedWeeks = phases.filter((p) => p.calendarBound).reduce((sum, p) => sum + p.weeks, 0);

  return (
    <div>
      <p className="eyebrow mb-2">The shape of the calendar</p>

      <div className="flex gap-3">
        {/* --- the bar --------------------------------------------------- */}
        <ol className="flex flex-col w-11 h-[340px] lg:h-[520px] shrink-0" aria-label="Phases by duration">
          {phases.map((phase, i) => {
            const isCurrent = currentPhaseIndex === phase.index;
            const first = i === 0;
            const last = i === phases.length - 1;

            return (
              <li
                key={phase.index}
                style={{ flexGrow: Math.max(phase.weeks, 1), flexBasis: 0, minHeight: 34 }}
                className="relative"
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(phase.index)}
                  title={`${phase.title} — ${plural(phase.weeks, 'week')}`}
                  className={`group block w-full h-full text-left border-x border-t border-card
                              ${first ? 'rounded-t' : ''} ${last ? 'rounded-b border-b' : ''}`}
                  style={phase.calendarBound ? SOLID : HATCH}
                >
                  {/* The phase number sits on the block itself, so the bar is
                      readable without cross-referencing a legend. Dark ink on the
                      block, because both fills are bright against the dark page. */}
                  <span className="figure text-[11px] font-semibold text-paper pl-1.5 pt-0.5 block">
                    {phase.index}
                  </span>
                  <span className="sr-only">
                    {phase.title}, weeks {phase.startWeek} to {phase.endWeek},{' '}
                    {plural(phase.weeks, 'week')},{' '}
                    {phase.calendarBound ? 'a fixed-length commitment' : 'hours you control'}
                  </span>
                </button>

                {isCurrent ? (
                  <span
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full
                               bg-card border-2 border-ink"
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        {/* --- week markers, aligned to the ends of the bar -------------- */}
        <div className="flex flex-col justify-between py-0.5 text-ink-faint">
          <span className="figure text-xs">week 1</span>
          <span className="figure text-xs">week {totalWeeks}</span>
        </div>
      </div>

      {/* --- legend ------------------------------------------------------ */}
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <span className="w-4 h-4 rounded-sm shrink-0 mt-0.5" style={HATCH} aria-hidden="true" />
          <div>
            <dt className="font-display font-semibold text-effort inline">Hours you control.</dt>{' '}
            <dd className="inline text-ink-soft">More time each week shortens these.</dd>
          </div>
        </div>

        {fixedWeeks > 0 ? (
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-sm shrink-0 mt-0.5" style={SOLID} aria-hidden="true" />
            <div>
              <dt className="font-display font-semibold text-fixed inline">Fixed length.</dt>{' '}
              <dd className="inline text-ink-soft">
                {plural(fixedWeeks, 'week')} of this plan — {Math.round((fixedWeeks / totalWeeks) * 100)}% —
                cannot be shortened by studying harder.
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
