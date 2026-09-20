import { ArrowDown } from 'lucide-react';

/**
 * The phases, one under the other, joined by arrows.
 *
 * WHY A CHAIN AND NOT A LIST
 * --------------------------
 * The order of a roadmap is the roadmap. Phase 3 comes after phase 2 because its
 * steps need phase 2 finished first — that is a topological sort, not a preference.
 * Cards stacked with ordinary spacing read as a list of options, which is exactly the
 * wrong idea; an arrow between them says "then".
 *
 * The connector is decorative and hidden from screen readers: to a reader following
 * the markup the sections are already in order, and "down arrow" between every pair
 * would be noise. The phase headings carry the sequence in words.
 */
export default function PhaseChain({ children }) {
  const phases = Array.isArray(children) ? children.filter(Boolean) : [children];

  return (
    <div>
      {phases.map((phase, i) => (
        <div key={phase.key ?? i}>
          {phase}
          {i < phases.length - 1 ? (
            <div aria-hidden="true" className="flex flex-col items-center py-2.5">
              <span className="w-px h-3 bg-rule" />
              <ArrowDown size={16} className="text-ink-faint" />
              <span className="w-px h-3 bg-rule" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
