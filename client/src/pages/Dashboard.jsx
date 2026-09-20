import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Bot, BrainCircuit, Briefcase, Calendar, Code2, Compass, FileBarChart, FileText, Flame, GraduationCap, ShieldCheck, Target } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Callout, EmptyState, Loading, Meter, Stat, ResourceList } from '../components/ui.jsx';
import { duration, hours, plural, relativeDate } from '../lib/format.js';

/**
 * The home screen of a returning learner.
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * One question: what do I do next? Everything here either answers that or tells you
 * whether you are keeping up. The plan itself is one click away and is not repeated
 * here — a dashboard that shows the whole roadmap is just the roadmap page with a
 * greeting on top.
 *
 * ONE REQUEST
 * -----------
 * `GET /api/dashboard` returns the plan, the progress, the streak and the goal in a
 * single snapshot, so the numbers on this page cannot disagree with each other. See
 * the note in server/src/routes/dashboard.routes.js.
 */

/** Greeting by the clock, because "Hello" twice a day gets old. */
function greeting(hour = new Date().getHours()) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMins(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TodayFocus() {
  const [todayData, setTodayData] = useState(null);

  useEffect(() => {
    api.agent.today().then(setTodayData).catch(() => {});
  }, []);

  if (!todayData || todayData.tasks.length === 0) return null;

  return (
    <section className="card p-6 space-y-4 border-l-4 border-l-effort">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="eyebrow text-effort">What should I do today?</h2>
          <h3 className="text-xl font-bold font-display mt-1">Today's Focus</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-soft">Available Time</p>
          <p className="text-sm font-semibold font-mono">{formatMins(todayData.availableMinutes)}</p>
        </div>
      </div>
      <ul className="space-y-3">
        {todayData.tasks.map((t) => (
          <li
            key={t.taskId}
            className={`p-3.5 rounded border space-y-2 ${
              t.completion === 'completed'
                ? 'bg-done-soft border-done text-done'
                : 'bg-panel border-rule text-ink'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{t.title}</span>
              <span className="text-xs font-mono">{formatMins(t.estimatedMinutes)}</span>
            </div>
            <div className="pt-1.5 border-t border-rule/50">
              <p className="eyebrow text-[10px] mb-1">Resources</p>
              <ResourceList
                resources={
                  t.resources?.length > 0
                    ? t.resources
                    : t.resource && (t.resource.title || t.resource.url)
                      ? [t.resource]
                      : []
                }
                emptyText="No resource added yet"
                compact
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="pt-2">
        <Link to="/weekly-planner" className="text-effort text-sm font-medium hover:underline flex items-center gap-1">
          Adjust availability & filter today <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api.dashboard
      .get()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Callout tone="error">{error}</Callout>;
  if (!data) return <Loading label="Loading your dashboard" />;

  const firstName = (data.user?.name ?? user?.name ?? '').split(' ')[0];

  return (
    <div className="space-y-6">
      {/* Personalized Greeting Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-rule/60">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">
            {greeting()}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {data.hasRoadmap
              ? "Track your adaptive learning progress, weekly plan, and skill passport."
              : 'Let us generate a personalized career roadmap for you.'}
          </p>
        </div>

        {data.hasRoadmap && (
          <Link to={`/plans/${data.roadmap.id}`} className="btn-primary text-xs flex items-center gap-2 self-start sm:self-auto">
            <Target size={15} />
            View Active Roadmap
          </Link>
        )}
      </header>

      {/* Next Best Action Banner */}
      {data.nextBestAction && (
        <section className="card p-5 bg-gradient-to-r from-effort-soft via-paper to-card border-effort/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-effort font-semibold">Next Best Action</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded border bg-paper border-rule text-ink-faint">
                ~{data.nextBestAction.estimatedMinutes} mins
              </span>
            </div>
            <h2 className="text-lg font-bold font-display text-ink">{data.nextBestAction.title}</h2>
            <p className="text-xs text-ink-soft max-w-xl">{data.nextBestAction.reason}</p>
          </div>
          <Link
            to={data.nextBestAction.url}
            className="btn-accent text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <span>{data.nextBestAction.cta}</span>
            <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Main Roadmap Status / Progress */}
      {data.hasRoadmap ? <Current data={data} /> : <NoPlanYet goal={data.goal} />}

      {/* Streak Banner */}
      <Streak streak={data.streak} />

      {/* Today's Focus */}
      <TodayFocus />

      {/* Quick Access Feature Grid */}
      <div className="space-y-3">
        <h2 className="eyebrow text-ink-faint">EduPath Intelligence Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/weekly-planner" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">Weekly Planner</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                7-day personalized adaptive schedule.
              </span>
            </div>
            <Calendar size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/skill-passport" className="tile flex items-center justify-between gap-3 p-4 hover:border-done/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-done transition-colors">Skill Passport</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Verified credentials & evidence records.
              </span>
            </div>
            <ShieldCheck size={20} aria-hidden="true" className="shrink-0 text-done" />
          </Link>

          <Link to="/skill-gaps" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">Skill Gap Agent</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Target role gaps, priorities & actions.
              </span>
            </div>
            <BrainCircuit size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/ai-agent" className="tile flex items-center justify-between gap-3 p-4 hover:border-done/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-done transition-colors">AI Learning Agent</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Grounded career & learning guidance.
              </span>
            </div>
            <Bot size={20} aria-hidden="true" className="shrink-0 text-done" />
          </Link>

          <Link to="/ai-tutor" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">AI Concept Tutor</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                9-step lessons, analogies & practice.
              </span>
            </div>
            <GraduationCap size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/interview-coach" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">AI Interview Coach</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Practice with project & technical questions.
              </span>
            </div>
            <Briefcase size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/assessments" className="tile flex items-center justify-between gap-3 p-4 hover:border-fixed/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-fixed transition-colors">Skill Assessments</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Test knowledge & earn passport proof.
              </span>
            </div>
            <GraduationCap size={20} aria-hidden="true" className="shrink-0 text-fixed" />
          </Link>

          <Link to="/simulator" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">What-If Simulator</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Simulate role switches & requirement changes.
              </span>
            </div>
            <Compass size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/progress-report" className="tile flex items-center justify-between gap-3 p-4 hover:border-done/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-done transition-colors">Progress Report</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Category readiness & executive summary.
              </span>
            </div>
            <FileBarChart size={20} aria-hidden="true" className="shrink-0 text-done" />
          </Link>

          <Link to="/project-analyzer" className="tile flex items-center justify-between gap-3 p-4 hover:border-effort/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-effort transition-colors">Project Analyzer</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                AI extraction of skills from projects.
              </span>
            </div>
            <Code2 size={20} aria-hidden="true" className="shrink-0 text-effort" />
          </Link>

          <Link to="/certificate-analyzer" className="tile flex items-center justify-between gap-3 p-4 hover:border-fixed/40 group transition-all">
            <div>
              <span className="font-display font-semibold text-ink group-hover:text-fixed transition-colors">Certificate Analyzer</span>
              <span className="block mt-0.5 text-xs text-ink-soft">
                Map certificate topics to Skill Passport.
              </span>
            </div>
            <Award size={20} aria-hidden="true" className="shrink-0 text-fixed" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Everything about the plan in progress. */
function Current({ data }) {
  const { goal, roadmap, progress, studyTime } = data;
  const planUrl = `/plans/${roadmap.id}`;
  const next = progress.nextUp?.[0] ?? null;

  return (
    <>
      <section className="card p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your goal</p>
            <h2 className="mt-1 text-xl font-semibold">{goal.roleTitle}</h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              Plan made {relativeDate(roadmap.generatedAt)}
            </p>
          </div>
          <Link to={planUrl} className="btn-quiet">
            Open plan
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <Meter
          value={progress.percentByHours}
          label="Career readiness"
          caption={`${hours(progress.hoursCompleted)} of ${hours(progress.totalHours)} done`}
        />

        <div className="grid gap-5 sm:grid-cols-4 pt-1">
          <Stat label="Completed" value={progress.completedNodes} tone="done" unit="steps" />
          <Stat label="Remaining" value={progress.remainingNodes} unit="steps" />
          {/* The plan's full length, not an estimate of what is left. Time remaining
              cannot be divided out of the hours honestly, because a plan containing a
              degree has steps whose length does not shrink as you work through them. */}
          <Stat
            label="Plan length"
            value={duration(roadmap.totals.weeks, roadmap.totals.months)}
            tone="effort"
          />
          <Stat
            label="Study time"
            value={studyTime.hoursPerDay ?? '—'}
            unit={studyTime.hoursPerDay ? 'h / day' : undefined}
          />
        </div>
      </section>

      {progress.isComplete ? (
        <Callout tone="success" title="You finished it.">
          Every step on this plan is done. Pick a new career to aim at whenever you are ready.
        </Callout>
      ) : next ? (
        <section className="card p-6">
          <p className="eyebrow">Continue learning</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{next.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {/* phaseIndex is already 1-based (phasePacker sets index = i + 1). */}
                Phase {next.phaseIndex} · about {hours(next.estimatedHours)}
                {next.status === 'in-progress' ? ' · already started' : ''}
              </p>
            </div>
            <Link to={planUrl} className="btn-accent">
              <Target size={16} aria-hidden="true" />
              {next.status === 'in-progress' ? 'Carry on' : 'Start this'}
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * No plan yet.
 *
 * Signed in with nothing to show is the one state where a dashboard is useless, so
 * this is the only thing on the page: the button that fixes it.
 */
function NoPlanYet({ goal }) {
  return (
    <EmptyState
      title="You have no plan yet"
      action={
        <Link to="/setup" className="btn-accent">
          Build my roadmap
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      }
    >
      {goal
        ? `Five questions and we will lay out the path to ${goal.roleTitle}.`
        : 'Answer five questions and we will lay out the steps, in order, with dates.'}
    </EmptyState>
  );
}

/**
 * The study streak.
 *
 * Counted from real completion dates, so a new account honestly reads zero. The
 * longest run is shown beside it: without it a lapsed streak is only a reproach,
 * and with it there is something to beat.
 */
function Streak({ streak }) {
  const alive = streak.days > 0;

  return (
    <section className="panel p-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={alive ? 'text-effort' : 'text-ink-faint'}>
          <Flame size={22} />
        </span>
        <div>
          <p className="eyebrow">Study streak</p>
          <p className="figure text-2xl font-semibold mt-0.5">
            {plural(streak.days, 'day')}
            {alive ? ' 🔥' : ''}
          </p>
        </div>
      </div>

      <p className="text-sm text-ink-faint max-w-xs">
        {alive
          ? streak.activeToday
            ? 'Finished something today. Keep it going.'
            : 'Finish a step today to keep it alive.'
          : streak.longest > 0
            ? `Your best run was ${plural(streak.longest, 'day')}. Tick off a step to start again.`
            : 'Tick off your first step and this starts counting.'}
      </p>
    </section>
  );
}
