import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import SkillPicker, { splitLevels } from '../components/SkillPicker.jsx';
import CareerBrief from '../components/CareerBrief.jsx';
import Stepper from '../components/Stepper.jsx';
import {
  Callout,
  Field,
  Loading,
  Select,
  TextInput,
} from '../components/ui.jsx';
import {
  DOMAIN_BLURBS,
  DOMAIN_LABELS,
  EDUCATION_LABELS,
  LEVEL_LABELS,
  YEAR_LABELS,
  hours,
  label,
} from '../lib/format.js';

/**
 * First-time setup.
 *
 * WHY A WIZARD AND NOT A FORM
 * ---------------------------
 * The engine needs five unrelated things: what you have studied, what you can
 * already do, how much time you have, and which of thirty jobs you want. As one page
 * that is a wall — the previous version of this app put them on a settings screen
 * and learners never found it, so every plan was generated from the defaults and
 * every plan looked the same. One question per screen is slower to click through and
 * much more likely to be answered.
 *
 * WHAT IS SAVED WHEN
 * ------------------
 * Each step writes to the profile as it is completed rather than everything at the
 * end. Somebody who closes the tab after picking their skills should not have to pick
 * them again, and the profile is the same record every other screen reads — so
 * saving early also means the dashboard and the resume page agree with the wizard
 * immediately instead of after a refresh.
 */

const STEPS = ['You', 'Skills', 'Field', 'Career', 'Plan'];

const DOMAIN_ORDER = ['technology', 'business', 'creative', 'healthcare', 'government', 'education'];

const EDUCATION_OPTIONS = Object.entries(EDUCATION_LABELS).map(([value, text]) => ({
  value,
  label: text,
}));

const YEAR_OPTIONS = Object.entries(YEAR_LABELS).map(([value, text]) => ({ value, label: text }));

// Plain labels here, unlike the per-skill picker: this answer describes the learner,
// it does not change a step, so promising an effect would be a lie.
const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS).map(([value, text]) => ({
  value,
  label: text,
}));

export default function Setup() {
  const { user, saveProfile } = useAuth();
  const navigate = useNavigate();

  const saved = user?.profile ?? {};

  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [answers, setAnswers] = useState({
    educationLevel: saved.educationLevel ?? 'none',
    fieldOfStudy: saved.fieldOfStudy ?? '',
    currentYear: saved.currentYear ?? '',
    experienceLevel: saved.experienceLevel ?? 'beginner',
    hoursPerDay: saved.hoursPerDay ?? 2,
    goal: saved.targetRoleKey ?? '',
  });

  const [levels, setLevels] = useState(saved.skillLevels ?? {});
  const [domain, setDomain] = useState(null);
  const [roleKey, setRoleKey] = useState(saved.targetRoleKey ?? null);

  const [roles, setRoles] = useState(null);

  // The full catalog: 30 rows, wanted by both the goal dropdown on step 1 and the
  // cards on step 4, so it is fetched once here rather than twice further down.
  useEffect(() => {
    let cancelled = false;

    api.roles
      .list({ limit: 100 })
      .then(({ roles: found }) => {
        if (!cancelled) setRoles(found);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const goalRole = useMemo(
    () => (roles ?? []).find((role) => role.key === answers.goal) ?? null,
    [roles, answers.goal]
  );

  // A goal named on step 1 preselects the field and the career, so the two middle
  // steps become a glance and a click rather than a decision already made twice.
  useEffect(() => {
    if (goalRole) {
      setDomain(goalRole.domain);
      setRoleKey(goalRole.key);
    }
  }, [goalRole]);

  const set = (field) => (event) => {
    const raw = event.target.value;
    setAnswers((current) => ({
      ...current,
      [field]: field === 'hoursPerDay' ? Number(raw) : raw,
    }));
  };

  /** Save a slice of the profile, surfacing any complaint the server makes. */
  async function persist(changes) {
    setBusy(true);
    setError(null);
    try {
      await saveProfile(changes);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile() {
    const ok = await persist({
      educationLevel: answers.educationLevel,
      fieldOfStudy: answers.fieldOfStudy,
      currentYear: answers.currentYear,
      experienceLevel: answers.experienceLevel,
      hoursPerDay: answers.hoursPerDay,
      ...(answers.goal ? { targetRoleKey: answers.goal } : {}),
      onboarded: true,
    });
    if (ok) setStep(1);
  }

  async function submitSkills() {
    const ok = await persist(splitLevels(levels));
    if (ok) setStep(2);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      if (roleKey !== saved.targetRoleKey) await saveProfile({ targetRoleKey: roleKey });
      const { roadmap } = await api.roadmaps.create({ roleKey });
      navigate(`/plans/${roadmap._id ?? roadmap.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Mirrors the conversion the server does when it stores the profile (including
  // its 80-hour ceiling), so the "learning time" on the last step is the figure the
  // plan is actually built with.
  const hoursPerWeek = Math.min(80, Math.round(answers.hoursPerDay * 7));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Set up your plan</h1>
        <p className="mt-1 text-ink-soft">Five quick steps. You can change any of it later.</p>
      </header>

      <Stepper steps={STEPS} current={step} onGoTo={setStep} />

      {error ? <Callout tone="error">{error}</Callout> : null}

      {/* ------------------------------------------------------ 1. about you */}
      {step === 0 ? (
        <section className="card p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What are you studying?" htmlFor="fieldOfStudy" hint="Or what you studied last.">
              <TextInput
                id="fieldOfStudy"
                placeholder="B.E Computer Science"
                value={answers.fieldOfStudy}
                onChange={set('fieldOfStudy')}
              />
            </Field>

            <Field label="Highest qualification" htmlFor="educationLevel">
              <Select
                id="educationLevel"
                options={EDUCATION_OPTIONS}
                value={answers.educationLevel}
                onChange={set('educationLevel')}
              />
            </Field>

            <Field label="Current year" htmlFor="currentYear">
              <Select
                id="currentYear"
                options={YEAR_OPTIONS}
                value={answers.currentYear}
                onChange={set('currentYear')}
              />
            </Field>

            <Field
              label="Where are you overall?"
              htmlFor="experienceLevel"
              hint="A rough answer is fine."
            >
              <Select
                id="experienceLevel"
                options={LEVEL_OPTIONS}
                value={answers.experienceLevel}
                onChange={set('experienceLevel')}
              />
            </Field>

            <Field
              label="How much time can you study?"
              htmlFor="hoursPerDay"
              hint={`${hoursPerWeek} hours a week. This sets your dates.`}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  id="hoursPerDay"
                  type="number"
                  min={1}
                  max={12}
                  step={0.5}
                  value={answers.hoursPerDay}
                  onChange={set('hoursPerDay')}
                />
                <span className="text-sm text-ink-faint whitespace-nowrap">hours / day</span>
              </div>
            </Field>

            <Field label="Career goal" htmlFor="goal" hint="Not sure? Leave it — you will browse next.">
              <Select
                id="goal"
                value={answers.goal}
                onChange={set('goal')}
                options={[
                  { value: '', label: 'Not sure yet' },
                  ...(roles ?? []).map((role) => ({ value: role.key, label: role.title })),
                ]}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={submitProfile} disabled={busy}>
              Continue
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------- 2. what you know */}
      {step === 1 ? (
        <section className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-semibold">What can you already do?</h2>
            <p className="mt-1 text-ink-soft">
              Rate anything you have touched. Skills you are comfortable with are dropped from
              your plan; ones you have just started stay, at half the hours.
            </p>
          </div>

          <SkillPicker levels={levels} onChange={setLevels} />

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={() => setStep(0)}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
            <button type="button" className="btn-primary" onClick={submitSkills} disabled={busy}>
              {Object.keys(levels).length === 0 ? 'Skip for now' : 'Continue'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 3. field */}
      {step === 2 ? (
        <section className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-semibold">Which field interests you?</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {DOMAIN_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setDomain(key);
                  setStep(3);
                }}
                className={`tile ${domain === key ? 'border-effort bg-panel' : ''}`}
              >
                <span className="font-display text-lg font-semibold">
                  {label(DOMAIN_LABELS, key)}
                </span>
                <span className="block mt-1 text-sm text-ink-soft">{DOMAIN_BLURBS[key]}</span>
              </button>
            ))}
          </div>

          <button type="button" className="btn-ghost" onClick={() => setStep(1)}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        </section>
      ) : null}

      {/* --------------------------------------------------------- 4. career */}
      {step === 3 ? (
        <CareerStep
          domain={domain}
          roles={roles}
          selected={roleKey}
          onSelect={(key) => {
            setRoleKey(key);
            setStep(4);
          }}
          onBack={() => setStep(2)}
        />
      ) : null}

      {/* ----------------------------------------------------------- 5. plan */}
      {step === 4 && roleKey ? (
        <section className="space-y-4">
          <CareerBrief roleKey={roleKey} hoursPerWeek={hoursPerWeek}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="btn-ghost" onClick={() => setStep(3)}>
                <ArrowLeft size={16} aria-hidden="true" />
                Pick another
              </button>
              <button type="button" className="btn-accent" onClick={generate} disabled={busy}>
                <Sparkles size={16} aria-hidden="true" />
                {busy ? 'Building your plan…' : 'Generate My Roadmap'}
              </button>
            </div>
          </CareerBrief>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Step 4 — the careers in the chosen field, nearest first.
 *
 * Ranked by how much of each one the learner has already covered, which is only
 * possible because they rated their skills two steps ago. It is also the step that
 * makes those ratings feel worth having done.
 */
function CareerStep({ domain, roles, selected, onSelect, onBack }) {
  const [fit, setFit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFit(null);

    api.analysis
      .roleFit({ domain, limit: 30 })
      .then(({ ranking }) => {
        if (!cancelled) setFit(ranking);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  const describe = useMemo(
    () => new Map((roles ?? []).map((role) => [role.key, role.description])),
    [roles]
  );

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-semibold">Pick a role in {label(DOMAIN_LABELS, domain)}</h2>
        <p className="mt-1 text-ink-soft">Closest to what you already know, first.</p>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}
      {!fit && !error ? <Loading label="Matching careers to your skills" /> : null}

      <div className="grid gap-3">
        {(fit ?? []).map((role) => (
          <button
            key={role.roleKey}
            type="button"
            onClick={() => onSelect(role.roleKey)}
            className={`tile ${selected === role.roleKey ? 'border-effort bg-panel' : ''}`}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-display text-lg font-semibold">{role.roleTitle}</span>
              <span className="figure text-sm text-ink-faint">
                <span className="text-done">{role.percentReady}%</span> done ·{' '}
                {hours(role.hoursRemaining)} left
              </span>
            </span>

            <span className="block mt-1 text-sm text-ink-soft">{describe.get(role.roleKey)}</span>

            {/* The server sends a paragraph explaining the education shortfall. One
                line is enough on a card you are choosing from — the full note is on
                the career page, where there is room to read it. */}
            {role.educationNote ? (
              <span className="block mt-1.5 text-sm text-effort">
                Needs {label(EDUCATION_LABELS, role.minimumEducation).toLowerCase()} first.
              </span>
            ) : null}

            {role.biggestGaps.length > 0 ? (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {role.biggestGaps.map((gap) => (
                  <span key={gap} className="chip">
                    {gap}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <button type="button" className="btn-ghost" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>
    </section>
  );
}
