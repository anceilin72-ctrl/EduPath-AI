import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Callout, Loading, SectionHeading, TypeBadge } from '../components/ui.jsx';
import { fullDate, hours, plural } from '../lib/format.js';

/**
 * Resume upload and skill detection.
 *
 * The rule the server enforces — a scan proposes, the learner confirms — is the
 * whole design of this page. Uploading writes nothing to the profile. Strong matches
 * arrive pre-ticked because the scan found the exact title; weaker ones arrive
 * unticked with the line from the resume that triggered them, so the learner can see
 * what the app thought it saw and disagree.
 *
 * Silently trusting a scan is worse than not scanning at all: a wrong match prunes
 * the exact step somebody needs, and shortens their plan without telling them.
 */

const CONFIDENCE = {
  high: { tone: 'done', label: 'Strong' },
  medium: { tone: 'effort', label: 'Likely' },
  low: { tone: 'neutral', label: 'Maybe' },
};

export default function Resume() {
  const { user, refresh } = useAuth();
  const fileRef = useRef(null);

  const [existing, setExisting] = useState(null);
  const [detected, setDetected] = useState([]);
  const [ticked, setTicked] = useState(new Set());
  const [counts, setCounts] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmedNote, setConfirmedNote] = useState(null);

  // What was uploaded previously, if anything. Detections from a past upload come
  // back as plain catalog nodes without the confidence or evidence, so this only
  // shows the file — a fresh scan is what produces a reviewable list.
  useEffect(() => {
    api.resume
      .get()
      .then(({ resume }) => setExisting(resume))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setConfirmedNote(null);

    try {
      const result = await api.resume.upload(file);
      setExisting(result.resume);
      setDetected(result.detected);
      setCounts(result.counts);
      setMessage(result.message);
      // Pre-tick only what the server judged safe.
      setTicked(new Set(result.detected.filter((m) => m.suggestTicked).map((m) => m.nodeKey)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const toggle = (nodeKey) => {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };

  async function confirm() {
    setBusy(true);
    setError(null);

    try {
      const allDetectedKeys = detected.map((d) => d.nodeKey);
      const rejectedKeys = allDetectedKeys.filter((k) => !ticked.has(k));
      const { added } = await api.resume.confirm([...ticked], 'add', { rejectedKeys });
      await refresh();
      setConfirmedNote(
        added.length === 0
          ? 'Skills were verified and recorded in your Skill Passport.'
          : `${plural(added.length, 'skill')} confirmed and added to your Skill Passport with RESUME evidence.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeResume() {
    const ok = window.confirm('Delete the file? Skills you already ticked stay on your profile.');
    if (!ok) return;

    setBusy(true);
    try {
      await api.resume.remove();
      setExisting(null);
      setDetected([]);
      setTicked(new Set());
      setCounts(null);
      setMessage(null);
      setConfirmedNote(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Looking for your resume" />;

  return (
    <div className="animate-rise-in max-w-3xl">
      <SectionHeading eyebrow="Shortcut" title="Your resume">
        We read your skills off it, then you tick the ones that are true.
      </SectionHeading>

      {error ? (
        <div className="mb-5">
          <Callout tone="error">{error}</Callout>
        </div>
      ) : null}

      {/* ================================================== upload */}
      <section className="card p-5">
        {existing ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileText size={20} className="mt-1 shrink-0 text-ink-faint" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display font-medium break-words">{existing.originalName}</p>
                <p className="text-sm text-ink-faint">Uploaded {fullDate(existing.uploadedAt)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={removeResume}
              disabled={busy}
              className="btn-ghost text-ink-faint hover:text-warn"
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete
            </button>
          </div>
        ) : (
          <h2 className="text-xl font-semibold">Upload a file</h2>
        )}

        <div className="mt-4">
          <label className="btn-primary cursor-pointer inline-flex">
            <Upload size={16} aria-hidden="true" />
            {busy ? 'Reading…' : existing ? 'Upload a different file' : 'Choose a file'}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              onChange={upload}
              disabled={busy}
              className="sr-only"
            />
          </label>
        </div>

        <p className="text-sm text-ink-faint mt-3">
          PDF or text, up to 2 MB. A scanned photo will not work — there is no text in it to read.
          The file stays on your own machine, and deleting it here removes it from disk.
        </p>
      </section>

      {/* ================================================== review */}
      {message ? (
        <div className="mt-5">
          <Callout
            tone={detected.length === 0 ? 'warn' : 'info'}
            title={counts ? `${plural(counts.total, 'match')} found` : undefined}
          >
            {message}
            {detected.length === 0 ? (
              <>
                {' '}
                <Link to="/profile" className="underline">
                  Tick your skills by hand
                </Link>{' '}
                instead.
              </>
            ) : null}
          </Callout>
        </div>
      ) : null}

      {detected.length > 0 ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-xl font-semibold">Tick what is true</h2>
              <p className="text-[15px] text-ink-soft mt-1">
                {counts.high > 0
                  ? `${plural(counts.high, 'strong match')} already ticked. Untick anything you would not want to be tested on.`
                  : 'Nothing was certain enough to tick for you.'}
              </p>
            </div>
            <button type="button" onClick={confirm} disabled={busy} className="btn-accent">
              {busy ? 'Saving…' : `Add ${ticked.size}`}
            </button>
          </div>

          {confirmedNote ? (
            <div className="mb-4">
              <Callout tone="success">
                {confirmedNote}{' '}
                <Link to="/compare" className="underline">
                  See which careers you are closest to
                </Link>
                .
              </Callout>
            </div>
          ) : null}

          <ul className="card divide-y divide-rule">
            {detected.map((match) => {
              const meta = CONFIDENCE[match.confidence] ?? CONFIDENCE.low;

              return (
                <li key={match.nodeKey} className="p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ticked.has(match.nodeKey)}
                      onChange={() => toggle(match.nodeKey)}
                      disabled={match.alreadyConfirmed}
                      className="mt-1.5 w-4 h-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-display font-medium">{match.title}</span>
                        <TypeBadge type={match.type ?? 'skill'} />
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {match.alreadyConfirmed ? <Badge tone="done">Already yours</Badge> : null}
                        <span className="figure text-sm text-ink-faint">
                          saves {hours(match.estimatedHours)}
                        </span>
                      </span>

                      {/* The line from the resume that caused the match. This is the
                          only way a learner can tell a real hit from a coincidence. */}
                      {match.evidence ? (
                        <span className="block mt-1.5 pl-3 border-l-2 border-rule font-mono text-[13px] text-ink-soft">
                          …{match.evidence}…
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="text-sm text-ink-faint mt-3">
            {plural(user?.profile?.knownNodeKeys?.length ?? 0, 'skill')} on your profile so far.
          </p>
        </section>
      ) : null}
    </div>
  );
}
