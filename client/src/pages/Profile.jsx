import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import SkillPicker, { splitLevels } from '../components/SkillPicker.jsx';
import { Callout, Field, Loading, SectionHeading, Select, TextInput } from '../components/ui.jsx';
import {
  EDUCATION_LABELS,
  LEVEL_LABELS,
  STATUS_LABELS,
  YEAR_LABELS,
  fullDate,
} from '../lib/format.js';

/**
 * The profile — the same answers the setup wizard asks for, editable one at a time.
 *
 * The wizard is a one-off walkthrough; this is where an answer gets changed later.
 * They read and write the same fields, and the skill picker is literally the same
 * component, so the two cannot drift apart in what they collect.
 *
 * Saving is explicit. An autosaving skill picker would rewrite the basis of every
 * future plan while the learner was still deciding.
 */

const asOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

export default function Profile() {
  const { user, loading, saveProfile } = useAuth();

  const [form, setForm] = useState(null);
  const [levels, setLevels] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Seeded from the server's copy once it arrives, and again if another page changes
  // the profile — the resume page confirms skills, for instance.
  useEffect(() => {
    if (!user) return;
    const profile = user.profile ?? {};

    setForm({
      educationLevel: profile.educationLevel ?? 'none',
      fieldOfStudy: profile.fieldOfStudy ?? '',
      currentYear: profile.currentYear ?? '',
      currentStatus: profile.currentStatus ?? 'student',
      experienceLevel: profile.experienceLevel ?? 'beginner',
      city: profile.city ?? '',
      hoursPerDay: profile.hoursPerDay ?? 2,
      targetDate: profile.targetDate ? String(profile.targetDate).slice(0, 10) : '',
    });
    setLevels(profile.skillLevels ?? {});
  }, [user]);

  if (loading || !form) return <Loading label="Loading your profile" />;

  const set = (key) => (event) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const setSkills = (next) => {
    setSaved(false);
    setLevels(next);
  };

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await saveProfile({
        educationLevel: form.educationLevel,
        fieldOfStudy: form.fieldOfStudy.trim(),
        currentYear: form.currentYear,
        currentStatus: form.currentStatus,
        experienceLevel: form.experienceLevel,
        city: form.city.trim(),
        // The schema wants a number and a date, not the strings an input gives back.
        hoursPerDay: Number(form.hoursPerDay),
        targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : null,
        ...splitLevels(levels),
      });
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const hoursPerWeek = Math.min(80, Math.round(Number(form.hoursPerDay || 0) * 7));

  return (
    <div className="animate-rise-in max-w-3xl">
      <SectionHeading eyebrow="You" title="Your details">
        Your plans are built from this page.
      </SectionHeading>

      {error ? (
        <div className="mb-5">
          <Callout tone="error" title="Could not save">
            {error.message}
          </Callout>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        {/* ============================================== where you are now */}
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Where you are now</h2>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field
              label="Highest qualification"
              htmlFor="educationLevel"
              error={error?.fieldError?.('educationLevel')}
            >
              <Select
                id="educationLevel"
                value={form.educationLevel}
                onChange={set('educationLevel')}
                options={asOptions(EDUCATION_LABELS)}
              />
            </Field>

            <Field
              label="What you are studying"
              htmlFor="fieldOfStudy"
              error={error?.fieldError?.('fieldOfStudy')}
            >
              <TextInput
                id="fieldOfStudy"
                value={form.fieldOfStudy}
                onChange={set('fieldOfStudy')}
                placeholder="B.E Computer Science"
                maxLength={120}
              />
            </Field>

            <Field label="Current year" htmlFor="currentYear">
              <Select
                id="currentYear"
                value={form.currentYear}
                onChange={set('currentYear')}
                options={asOptions(YEAR_LABELS)}
              />
            </Field>

            <Field
              label="Right now you are"
              htmlFor="currentStatus"
              error={error?.fieldError?.('currentStatus')}
            >
              <Select
                id="currentStatus"
                value={form.currentStatus}
                onChange={set('currentStatus')}
                options={asOptions(STATUS_LABELS)}
              />
            </Field>

            <Field label="Where you are overall" htmlFor="experienceLevel">
              <Select
                id="experienceLevel"
                value={form.experienceLevel}
                onChange={set('experienceLevel')}
                options={asOptions(LEVEL_LABELS)}
              />
            </Field>

            <Field label="City" htmlFor="city" hint="Optional." error={error?.fieldError?.('city')}>
              <TextInput
                id="city"
                value={form.city}
                onChange={set('city')}
                placeholder="Chennai"
                maxLength={80}
              />
            </Field>
          </div>
        </section>

        {/* ============================================== time you have */}
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Your study time</h2>
          <p className="mt-1 text-ink-soft">
            Every date in the app comes from this. Put the hours you really study.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field
              label="Hours a day"
              htmlFor="hoursPerDay"
              hint={`${hoursPerWeek} hours a week.`}
              error={error?.fieldError?.('hoursPerDay')}
            >
              <TextInput
                id="hoursPerDay"
                type="number"
                min="1"
                max="12"
                step="0.5"
                value={form.hoursPerDay}
                onChange={set('hoursPerDay')}
              />
            </Field>

            <Field
              label="Finish by"
              htmlFor="targetDate"
              hint="Optional. We will say if it does not fit."
              error={error?.fieldError?.('targetDate')}
            >
              <TextInput id="targetDate" type="date" value={form.targetDate} onChange={set('targetDate')} />
            </Field>
          </div>

          <Callout tone="info">
            More hours a week shortens study — but not a degree or a placement. Those take the time
            they take.
          </Callout>
        </section>

        {/* ============================================== what you know */}
        <section className="card p-5">
          <h2 className="text-lg font-semibold">What you already know</h2>
          <p className="mt-1 text-ink-soft">
            Or{' '}
            <Link to="/resume" className="link">
              upload your resume
            </Link>{' '}
            and we will read them off it.
          </p>

          <div className="mt-4">
            <SkillPicker levels={levels} onChange={setSkills} />
          </div>
        </section>

        {/* ============================================== save */}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn-accent">
            {saving ? 'Saving…' : 'Save'}
          </button>

          {saved ? (
            <span className="flex items-center gap-1.5 text-done">
              <Check size={16} aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </div>

        <p className="text-sm text-ink-faint">
          Signed in as {user.email}
          {user.createdAt ? ` · joined ${fullDate(user.createdAt)}` : ''}. Open a plan and rebuild it
          to apply these changes.
        </p>
      </form>
    </div>
  );
}
