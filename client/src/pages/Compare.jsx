import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Badge,
  Callout,
  EmptyState,
  Loading,
  Meter,
  SectionHeading,
  Stat,
  TypeBadge,
} from '../components/ui.jsx';
import {
  DEMAND_LABELS,
  DOMAIN_LABELS,
  hours,
  label,
  plural,
  salaryRange,
} from '../lib/format.js';

/**
 * Which career am I closest to?
 *
 * This inverts the app's usual question. Rather than "here is the plan for the job
 * you named", it scores every role in the catalog against what the learner already
 * knows and ranks them — which, for somebody who has not decided yet, is the more
 * useful question, and it is the same graph doing the work.
 *
 * Readiness is measured in hours, not steps ticked. Somebody who has nine of a
 * role's ten requirements but is missing a three-year degree is not ninety per cent
 * ready, and this page must not tell them they are.
 */
export default function Compare() {
  const { user } = useAuth();

  const [ranking, setRanking] = useState([]);
  const [basedOn, setBasedOn] = useState(null);
  const [message, setMessage] = useState(null);
  const [domain, setDomain] = useState('');
  const [domains, setDomains] = useState([]);
  const [useResumeSkills, setUseResumeSkills] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The role opened for a detailed breakdown, and its gap.
  const [openKey, setOpenKey] = useState(null);
  const [gap, setGap] = useState(null);
  const [gapNotes, setGapNotes] = useState([]);
  const [gapLoading, setGapLoading] = useState(false);

  const confirmedCount = user?.profile?.knownNodeKeys?.length ?? 0;
  const detectedCount = user?.resume?.detectedNodeKeys?.length ?? 0;

  useEffect(() => {
    api.roles
      .domains()
      .then(({ domains: found }) => setDomains(found))
      .catch(() => {
        /* The filter is a convenience; the ranking works without it. */
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    return api.analysis
      .roleFit({
        limit: 12,
        domain,
        // The server compares against the literal 'true', so send a string.
        includeResumeSkills: useResumeSkills ? 'true' : undefined,
      })
      .then((payload) => {
        setRanking(payload.ranking);
        setBasedOn(payload.basedOn);
        setMessage(payload.message);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [domain, useResumeSkills]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch the open breakdown when the basis changes, so it never disagrees
  // with the ranking above it.
  useEffect(() => {
    if (!openKey) return undefined;

    let cancelled = false;
    setGapLoading(true);

    api.analysis
      .gap({
        roleKey: openKey,
        extraSkills: useResumeSkills ? (user?.resume?.detectedNodeKeys ?? []) : [],
      })
      .then((payload) => {
        if (cancelled) return;
        setGap(payload.gap);
        setGapNotes(payload.notes);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setGapLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openKey, useResumeSkills, user]);

  const toggleOpen = (roleKey) => {
    setGap(null);
    setGapNotes([]);
    setOpenKey((current) => (current === roleKey ? null : roleKey));
  };

  return (
    <div className="animate-rise-in">
      <SectionHeading eyebrow="Compare" title="Which career am I closest to?">
        Every career scored against what you already know — by hours of work left, not boxes ticked.
      </SectionHeading>

      {confirmedCount === 0 && detectedCount === 0 ? (
        <EmptyState
          title="Tell us what you know first"
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Link to="/profile" className="btn-accent">
                Tick my skills
              </Link>
              <Link to="/resume" className="btn-quiet">
                Upload my resume
              </Link>
            </div>
          }
        >
          There is nothing to score you against yet.
        </EmptyState>
      ) : (
        <>
          {/* --- basis controls ------------------------------------------- */}
          <div className="card p-4 mb-5">
            <p className="eyebrow mb-2">Based on</p>
            <p className="text-[15px] text-ink-soft">
              {plural(confirmedCount, 'skill')} you ticked
              {useResumeSkills && detectedCount > 0
                ? `, plus ${plural(detectedCount, 'unticked match')} from your resume`
                : ''}
              .
            </p>

            {detectedCount > 0 ? (
              <label className="flex items-start gap-2.5 mt-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={useResumeSkills}
                  onChange={(event) => setUseResumeSkills(event.target.checked)}
                  className="mt-1"
                />
                <span className="text-ink-soft">
                  Also count the {plural(detectedCount, 'skill')} from my resume that I have not
                  ticked. Good for a what-if, but then the ranking is a guess.
                </span>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Filter by field">
              <button
                type="button"
                onClick={() => setDomain('')}
                className={domain === '' ? 'btn-primary' : 'btn-quiet'}
              >
                All fields
              </button>
              {domains.map(({ domain: name }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setDomain(name)}
                  className={domain === name ? 'btn-primary' : 'btn-quiet'}
                >
                  {label(DOMAIN_LABELS, name)}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="mb-5">
              <Callout tone="error">{error}</Callout>
            </div>
          ) : null}

          {message && confirmedCount === 0 && !useResumeSkills ? (
            <div className="mb-5">
              <Callout tone="warn">{message}</Callout>
            </div>
          ) : null}

          {loading ? (
            <Loading label="Scoring every career" />
          ) : (
            <ol className="space-y-4">
              {ranking.map((entry, position) => {
                const isOpen = openKey === entry.roleKey;

                return (
                  <li key={entry.roleKey}>
                    <div className={`card p-5 ${isOpen ? 'ring-1 ring-ink' : ''}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span className="figure text-lg font-semibold text-ink-faint">
                            {String(position + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Link
                                to={`/careers/${entry.roleKey}`}
                                className="text-xl font-semibold hover:underline"
                              >
                                {entry.roleTitle}
                              </Link>
                              <Badge>{label(DOMAIN_LABELS, entry.roleDomain)}</Badge>
                            </div>
                            <p className="text-sm text-ink-faint mt-0.5">
                              {label(DEMAND_LABELS, entry.demandLevel)}
                              {salaryRange(entry.salaryINR) ? (
                                <>
                                  {' · '}
                                  <span className="figure">{salaryRange(entry.salaryINR)}</span>
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        <div className="w-full sm:w-56">
                          <Meter
                            label="Ready"
                            value={entry.percentReady}
                            caption={`${hours(entry.hoursRemaining)} left`}
                          />
                        </div>
                      </div>

                      {entry.biggestGaps.length > 0 ? (
                        <p className="text-[15px] text-ink-soft mt-3">
                          Missing: {entry.biggestGaps.join(', ')}.
                        </p>
                      ) : (
                        <p className="text-[15px] text-done mt-3">You already meet every step.</p>
                      )}

                      {entry.educationNote ? (
                        <p className="flex items-start gap-1.5 text-[15px] text-effort mt-2">
                          <GraduationCap size={15} className="mt-1 shrink-0" aria-hidden="true" />
                          {entry.educationNote.message}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => toggleOpen(entry.roleKey)}
                          className="btn-quiet"
                          aria-expanded={isOpen}
                        >
                          {isOpen ? 'Hide' : 'What am I missing?'}
                        </button>
                        <Link to={`/careers/${entry.roleKey}`} className="btn-ghost">
                          Build this plan
                          <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      </div>

                      {/* --- the breakdown ------------------------------- */}
                      {isOpen ? (
                        <div className="mt-4 pt-4 border-t border-rule animate-rise-in">
                          {gapLoading || !gap ? (
                            <Loading label="Working out the gap" />
                          ) : (
                            <>
                              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <Stat label="Steps in total" value={gap.requiredCount} />
                                <Stat label="You have" value={gap.metCount} tone="done" />
                                <Stat label="To learn" value={gap.missingCount} />
                                <Stat
                                  label="Hours left"
                                  value={hours(gap.hoursRemaining)}
                                  tone="effort"
                                />
                              </dl>

                              {gapNotes.map((note) => (
                                <div key={note.message} className="mt-4">
                                  <Callout tone="warn">{note.message}</Callout>
                                </div>
                              ))}

                              <div className="grid sm:grid-cols-2 gap-6 mt-5">
                                <div>
                                  <p className="eyebrow mb-2">To learn — longest first</p>
                                  {gap.missing.length === 0 ? (
                                    <p className="text-[15px] text-done">Nothing.</p>
                                  ) : (
                                    <ul className="divide-y divide-rule">
                                      {gap.missing.map((step) => (
                                        <li key={step.nodeKey} className="py-2">
                                          <div className="flex flex-wrap items-baseline gap-2">
                                            <span className="font-display font-medium">
                                              {step.title}
                                            </span>
                                            <TypeBadge type={step.type ?? 'skill'} />
                                            <span className="figure text-sm text-ink-faint">
                                              {step.fixedDurationWeeks
                                                ? plural(step.fixedDurationWeeks, 'week')
                                                : hours(step.estimatedHours)}
                                            </span>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                <div>
                                  <p className="eyebrow mb-2">
                                    Already known — {hours(gap.hoursCovered)} saved
                                  </p>
                                  {gap.have.length === 0 ? (
                                    <p className="text-[15px] text-ink-faint">None yet.</p>
                                  ) : (
                                    <ul className="divide-y divide-rule">
                                      {gap.have.map((step) => (
                                        <li key={step.nodeKey} className="py-2">
                                          <div className="flex flex-wrap items-baseline gap-2">
                                            <span className="font-display font-medium">
                                              {step.title}
                                            </span>
                                            {/* Say so when the credit came from an
                                                inference rather than a claim, so a
                                                wrong assumption can be corrected. */}
                                            {step.inferredFrom ? (
                                              <Badge tone="neutral">
                                                assumed from {step.inferredFrom}
                                              </Badge>
                                            ) : null}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {basedOn ? (
            <p className="text-sm text-ink-faint mt-6">
              {basedOn.rolesConsidered} careers scored against {plural(basedOn.skillCount, 'skill')}.
              A career is never hidden from you for needing a degree you have not started.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
