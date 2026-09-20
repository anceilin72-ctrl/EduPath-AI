import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';

/**
 * The small shared pieces. Grouped in one file because each is a few lines and
 * they are always imported together; the components with real logic live in their
 * own files.
 */

// ---------------------------------------------------------------- text bits

export function Eyebrow({ children, className = '' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function SectionHeading({ eyebrow, title, children, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow ? <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow> : null}
        <h2 className="text-2xl font-semibold">{title}</h2>
        {children ? <p className="mt-1.5 text-ink-soft max-w-prose">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * A single measured fact: the number large in mono, the label small above it.
 * Used for every headline figure so hours, weeks and percentages all read as
 * the same kind of thing.
 */
export function Stat({ label, value, unit, tone = 'ink', hint }) {
  const tones = {
    ink: 'text-ink',
    effort: 'text-effort',
    fixed: 'text-fixed',
    done: 'text-done',
  };

  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className={`figure text-2xl font-semibold mt-1 ${tones[tone]}`}>
        {value}
        {unit ? <span className="text-base font-normal text-ink-faint ml-1">{unit}</span> : null}
      </p>
      {hint ? <p className="text-sm text-ink-faint mt-0.5">{hint}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------- badges

const BADGE_TONES = {
  neutral: 'bg-paper text-ink-soft border-rule',
  effort: 'bg-effort-soft text-effort border-effort',
  fixed: 'bg-fixed-soft text-fixed border-fixed',
  done: 'bg-done-soft text-done border-done',
  warn: 'bg-warn-soft text-warn border-warn',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 font-display
                  text-[11px] font-semibold uppercase tracking-wide ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A step's type, coloured by whether it costs you effort or calendar time.
 * A qualification and an experience placement are blue because you cannot finish
 * them faster by trying harder; skills, exams and certifications are ochre.
 */
export function TypeBadge({ type = 'skill' }) {
  const fixedTypes = new Set(['qualification', 'experience']);
  return (
    <Badge tone={fixedTypes.has(type) ? 'fixed' : 'effort'}>
      {{ skill: 'Skill', exam: 'Exam', certification: 'Certificate', qualification: 'Qualification', experience: 'Experience' }[type] ?? type}
    </Badge>
  );
}

// ------------------------------------------------------------------ feedback

const CALLOUT_STYLES = {
  info: { box: 'bg-fixed-soft border-fixed text-ink', Icon: Info, iconClass: 'text-fixed' },
  warn: { box: 'bg-effort-soft border-effort text-ink', Icon: AlertTriangle, iconClass: 'text-effort' },
  error: { box: 'bg-warn-soft border-warn text-ink', Icon: AlertTriangle, iconClass: 'text-warn' },
  success: { box: 'bg-done-soft border-done text-ink', Icon: Check, iconClass: 'text-done' },
};

export function Callout({ tone = 'info', title, children }) {
  const { box, Icon, iconClass } = CALLOUT_STYLES[tone] ?? CALLOUT_STYLES.info;

  return (
    <div className={`border-l-4 rounded-r-md px-4 py-3 ${box}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="flex gap-2.5">
        <Icon size={18} className={`mt-1 shrink-0 ${iconClass}`} aria-hidden="true" />
        <div className="min-w-0">
          {title ? <p className="font-display font-semibold">{title}</p> : null}
          <div className="text-[15px] leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Shown while a page's first request is in flight. */
export function Loading({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-faint py-12 justify-center" role="status">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      <span className="font-display text-sm">{label}…</span>
    </div>
  );
}

/**
 * An empty screen is an invitation to act, so this always takes an action rather
 * than just stating that there is nothing here.
 */
export function EmptyState({ title, children, action }) {
  return (
    <div className="card p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children ? <p className="text-ink-soft mt-1.5 max-w-prose mx-auto">{children}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// --------------------------------------------------------------------- meter

/**
 * A horizontal progress meter.
 *
 * The dashboard shows two of these side by side — steps done and hours done —
 * because they answer different questions, and on a plan containing a degree they
 * disagree sharply.
 */
export function Meter({ value, tone = 'done', label, caption }) {
  const pct = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const fills = { done: 'bg-done', effort: 'bg-effort', fixed: 'bg-fixed' };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <Eyebrow>{label}</Eyebrow>
        <span className="figure text-sm font-semibold">{pct}%</span>
      </div>
      <div
        className="h-2 bg-paper border border-rule rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${fills[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {caption ? <p className="text-sm text-ink-faint mt-1">{caption}</p> : null}
    </div>
  );
}

// --------------------------------------------------------------------- forms

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-sm text-ink-faint mt-1">{hint}</p> : null}
      {error ? (
        <p className="text-sm text-warn mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ id, error, ...props }) {
  return (
    <input
      id={id}
      className={`input ${error ? 'border-warn' : ''}`}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
}

export function Select({ id, error, options, ...props }) {
  return (
    <select id={id} className={`input ${error ? 'border-warn' : ''}`} {...props}>
      {options.map(({ value, label: text }) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
}

const RESOURCE_ICONS = {
  'Official Documentation': '📘',
  'Documentation': '📘',
  'Tutorial': '🎥',
  'Video': '🎥',
  'Article': '📄',
  'Practice': '💻',
  'Assessment': '🧪',
  'Course': '🎓',
};

export function getResourceIcon(type = '') {
  return RESOURCE_ICONS[type] || '📄';
}

export function ResourceList({ resources = [], emptyText = 'No resource added yet', compact = false }) {
  if (!resources || resources.length === 0) {
    return <p className="text-xs text-ink-faint italic">{emptyText}</p>;
  }

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {resources.map((res, idx) => {
        const icon = getResourceIcon(res.type);
        return (
          <li key={idx} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span aria-hidden="true">{icon}</span>
              {res.url ? (
                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-fixed hover:underline truncate"
                  title={res.title}
                >
                  {res.title}
                </a>
              ) : (
                <span className="font-medium text-ink truncate" title={res.title}>
                  {res.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {res.type ? (
                <span className="text-[10px] font-mono px-1 rounded bg-paper border border-rule text-ink-faint">
                  {res.type}
                </span>
              ) : null}
              {res.estimatedMinutes ? (
                <span className="text-[10px] font-mono text-ink-faint">
                  {res.estimatedMinutes}m
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default Badge;
