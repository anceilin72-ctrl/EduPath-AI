import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  HelpCircle,
  PlayCircle,
  RefreshCw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, EmptyState, Eyebrow, Loading } from '../components/ui.jsx';

const MISSED_REASONS = ['No time', 'Too difficult', 'Already know', 'Not interested', 'Other'];

const PRESET_HOURS = [0.5, 1, 2, 3, 5, 8];

function formatMins(mins) {
  const num = Number(mins);
  if (!Number.isFinite(num) || num <= 0) return '0m';
  if (num < 60) return `${Math.round(num)}m`;
  const h = Math.floor(num / 60);
  const m = Math.round(num % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getResourceBadge(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('doc') || t.includes('official')) {
    return { icon: '📘', label: 'Official Documentation' };
  }
  if (t.includes('tutorial') || t.includes('guide') || t.includes('course')) {
    return { icon: '🎓', label: 'Tutorial' };
  }
  if (t.includes('video') || t.includes('youtube')) {
    return { icon: '🎥', label: 'Video' };
  }
  if (t.includes('practice') || t.includes('exercise') || t.includes('project')) {
    return { icon: '💻', label: 'Practice' };
  }
  if (t.includes('assessment') || t.includes('quiz') || t.includes('test')) {
    return { icon: '🧪', label: 'Assessment' };
  }
  return { icon: '📄', label: 'Article' };
}

function ResourceBadges({ resources, resource }) {
  const list = resources && resources.length > 0
    ? resources
    : resource && (resource.title || resource.url)
    ? [resource]
    : [];

  if (list.length === 0) {
    return <span className="text-xs text-ink-faint italic">No resource added yet</span>;
  }

  return (
    <div className="space-y-1.5 pt-2 border-t border-rule/50">
      <span className="eyebrow text-[10px]">Learning Resources</span>
      <div className="flex flex-wrap gap-2">
        {list.map((r, idx) => {
          const badge = getResourceBadge(r.type);
          return (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper border border-rule text-xs"
            >
              <span>{badge.icon}</span>
              <span className="font-medium text-ink">{r.title || badge.label}</span>
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-effort hover:underline flex items-center gap-0.5 ml-1 text-[11px]"
                >
                  <span>Open</span>
                  <ExternalLink size={10} />
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MissedModal({ task, onClose, onSubmit }) {
  const [reason, setReason] = useState('No time');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(task.taskId, reason, notes);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm">
      <div className="card max-w-md w-full p-6 space-y-5 shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-rule pb-3">
          <div>
            <h3 className="font-semibold text-lg">Missed Task Feedback</h3>
            <p className="text-xs text-ink-soft mt-0.5">{task.title}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-medium mb-1.5 text-xs text-ink-soft">
              Why were you unable to complete this task?
            </label>
            <div className="space-y-1.5">
              {MISSED_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2.5 text-xs cursor-pointer p-2 rounded hover:bg-panel border border-rule">
                  <input
                    type="radio"
                    name="missedReason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-ink-soft">
              Additional Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Need more time on recursion..."
              className="w-full p-2.5 rounded border border-rule bg-paper text-xs resize-none h-16"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-accent text-xs">
              Submit & Adapt Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WeeklyPlanner() {
  const [plan, setPlan] = useState(null);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const [timeConstraint, setTimeConstraint] = useState('');
  const [filterInfo, setFilterInfo] = useState(null);
  const [selectedTaskForMissed, setSelectedTaskForMissed] = useState(null);
  const [activeTab, setActiveTab] = useState('schedule');
  const [timeError, setTimeError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setReportError(null);
    try {
      const [planRes, reportRes] = await Promise.all([
        api.agent.weeklyPlan(),
        api.agent.weeklyReport().catch((err) => {
          // Surface the real reason instead of silently pretending the
          // report is still "generating" forever.
          setReportError(err.message || 'Could not load your weekly report.');
          return { report: null };
        }),
      ]);
      setPlan(planRes.plan);
      setReport(reportRes.report);
      setFilterInfo(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRecalculate() {
    setWorking(true);
    try {
      const res = await api.agent.generatePlan();
      setPlan(res.plan);
      setTimeConstraint('');
      setFilterInfo(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function applyHoursFilter(hoursVal) {
    if (hoursVal === null || hoursVal === undefined || hoursVal === '') {
      load();
      return;
    }
    const hoursNum = parseFloat(hoursVal);

    // Validation
    if (isNaN(hoursNum)) {
      setTimeError('Please enter a valid number.');
      return;
    }
    if (hoursNum <= 0) {
      setTimeError('Available hours must be greater than 0.');
      return;
    }
    if (hoursNum > 24) {
      setTimeError('Available hours cannot exceed 24 hours per day.');
      return;
    }

    setWorking(true);
    setError(null);
    setTimeError(null);
    try {
      const todayData = await api.agent.today({ hours: hoursNum });

      const plannedMins = todayData.totalPlannedMinutes ||
        todayData.tasks.reduce((sum, t) => sum + (Number(t.estimatedMinutes) || 0), 0);

      const totalPendingMins = todayData.totalAvailablePendingMinutes || plannedMins;

      setFilterInfo({
        requestedHours: hoursNum,
        requestedMinutes: Math.round(hoursNum * 60),
        plannedMinutes: plannedMins,
        totalAvailablePendingMinutes: totalPendingMins,
        taskCount: todayData.tasks.length,
        dayName: todayData.dayName,
      });

      // Reload the entire plan to get the updated state from the backend
      // This ensures the filtered tasks are properly reflected in the UI
      const updatedPlan = await api.agent.weeklyPlan();
      setPlan(updatedPlan.plan);
    } catch (err) {
      setError(err.message);
      setFilterInfo(null);
    } finally {
      setWorking(false);
    }
  }

  async function handleApplyTimeConstraint(e) {
    e.preventDefault();
    if (!timeConstraint) return;
    setTimeError(null);
    await applyHoursFilter(timeConstraint);
  }

  async function handleReportMissed(taskId, reason, notes) {
    try {
      const res = await api.agent.reportMissedTask(taskId, { reason, notes });
      setPlan(res.plan);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCompleteTask(taskId, actualMinutes) {
    try {
      const res = await api.agent.completeTask(taskId, { actualMinutes });
      setPlan(res.plan);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Loading label="Loading weekly planner" />;

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar size={24} className="text-effort shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">Weekly Learning Planner</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            7-day personalized schedule based on your roadmap, skill gaps, and availability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={activeTab === 'schedule' ? 'btn-accent' : 'btn-quiet'}
          >
            Weekly Schedule
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={activeTab === 'report' ? 'btn-accent' : 'btn-quiet'}
          >
            Weekly Report
          </button>
          <button type="button" onClick={handleRecalculate} disabled={working} className="btn-ghost">
            <RefreshCw size={14} className={working ? 'animate-spin' : ''} aria-hidden="true" />
            Re-calculate
          </button>
        </div>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      {/* Filter Today Time Budget Control */}
      {activeTab === 'schedule' && (
        <section className="card p-5 bg-gradient-to-r from-panel via-card to-panel border-rule space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-effort-soft border border-effort flex items-center justify-center text-effort shrink-0">
                <Clock3 size={20} aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-sm font-semibold text-ink">Filter Today's Focus</p>
                <p className="text-xs text-ink-soft">Enter your available hours today to recalculate your task budget.</p>
              </div>
            </div>

            <form onSubmit={handleApplyTimeConstraint} className="flex items-center gap-2">
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={timeConstraint}
                onChange={(e) => {
                  setTimeConstraint(e.target.value);
                  setTimeError(null);
                }}
                placeholder="e.g. 1"
                className={`input w-24 text-xs py-2 ${timeError ? 'border-warn ring-1 ring-warn' : ''}`}
              />
              <span className="text-xs text-ink-soft font-mono">hours</span>
              <button
                type="submit"
                disabled={working || !timeConstraint}
                className="btn-accent text-xs py-2 px-3"
              >
                Filter Today
              </button>
            </form>
          </div>

          {/* Validation Error */}
          {timeError && (
            <div className="pt-2">
              <Callout tone="error">
                <div className="flex items-center gap-1">
                  <span>⚠</span>
                  <span>{timeError}</span>
                </div>
              </Callout>
            </div>
          )}

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rule/60 text-xs">
            <span className="text-ink-faint font-medium">Quick Budgets:</span>
            {PRESET_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setTimeConstraint(String(h));
                  applyHoursFilter(h);
                }}
                className={`py-1 px-2.5 rounded border text-xs font-mono transition-colors ${
                  timeConstraint === String(h)
                    ? 'bg-effort text-white border-effort font-semibold'
                    : 'bg-paper border-rule text-ink hover:bg-panel'
                }`}
              >
                {h}h
              </button>
            ))}
            {filterInfo && (
              <button
                type="button"
                onClick={() => {
                  setTimeConstraint('');
                  load();
                }}
                className="text-effort hover:underline ml-auto font-medium text-xs"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* Dynamic Filter Status Banner */}
          {filterInfo && (
            <div className="pt-2">
              {filterInfo.taskCount === 0 ? (
                <Callout tone="info">No pending tasks available for today.</Callout>
              ) : filterInfo.requestedMinutes > filterInfo.totalAvailablePendingMinutes ? (
                <div className="bg-effort-soft border border-effort/40 rounded-md p-3 text-xs text-ink space-y-1">
                  <div className="flex items-center justify-between font-semibold text-effort">
                    <span>All Available Priority Tasks Selected</span>
                    <span>{filterInfo.taskCount} tasks</span>
                  </div>
                  <p className="text-ink-soft">
                    Requested: <strong>{filterInfo.requestedHours}h</strong> ({formatMins(filterInfo.requestedMinutes)}) | 
                    Selected: <strong>{formatMins(filterInfo.plannedMinutes)}</strong> (All pending content fits in requested budget).
                  </p>
                </div>
              ) : (
                <div className="bg-done-soft border border-done/40 rounded-md p-3 text-xs text-ink space-y-1">
                  <div className="flex items-center justify-between font-semibold text-done">
                    <span>Time Budget Applied for {filterInfo.dayName}</span>
                    <span>{filterInfo.taskCount} tasks</span>
                  </div>
                  <p className="text-ink-soft">
                    <strong>{formatMins(filterInfo.plannedMinutes)}</strong> planned of <strong>{filterInfo.requestedHours}h</strong> ({formatMins(filterInfo.requestedMinutes)}) available budget.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Schedule View — Clean Stacked / Responsive Grid */}
      {activeTab === 'schedule' && plan && (
        <div className="space-y-5">
          {plan.days.map((day) => {
            const isToday = day.dayName === todayName;
            const dayPlannedMins = day.tasks.reduce((sum, t) => sum + (Number(t.estimatedMinutes) || 0), 0);
            const dayAvailMins = Number(day.availableMinutes) || 0;

            return (
              <section
                key={day.dayName}
                className={`card p-5 space-y-4 border transition-all ${
                  isToday
                    ? 'ring-2 ring-effort bg-effort-soft border-effort/50 shadow-sm'
                    : 'bg-card border-rule'
                }`}
              >
                {/* Day Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
                      <span>{day.dayName}</span>
                      {isToday && (
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-effort text-white">
                          TODAY
                        </span>
                      )}
                    </h2>
                    <span className="text-xs text-ink-soft font-mono">
                      {day.date ? new Date(day.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <div className="px-2.5 py-1 rounded bg-panel border border-rule text-ink">
                      <span>Planned: </span>
                      <strong className="text-effort">{formatMins(dayPlannedMins)}</strong>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-paper border border-rule text-ink-soft">
                      <span>Budget: </span>
                      <strong>{dayAvailMins > 0 ? formatMins(dayAvailMins) : 'Off'}</strong>
                    </div>
                  </div>
                </div>

                {/* Day Tasks List */}
                {day.tasks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-faint italic bg-panel/50 rounded-lg border border-dashed border-rule">
                    Rest & Review — No tasks scheduled for {day.dayName}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {day.tasks.map((task) => {
                      const estMins = Number(task.estimatedMinutes) || 30;
                      const isCompleted = task.completion === 'completed';
                      const isMissed = task.completion === 'missed';

                      return (
                        <div
                          key={task.taskId}
                          className={`p-4 rounded-lg border text-sm space-y-3 transition-colors ${
                            isCompleted
                              ? 'bg-done-soft border-done/40 text-ink'
                              : isMissed
                              ? 'bg-warn-soft border-warn/40 text-ink'
                              : 'bg-panel border-rule text-ink hover:border-effort/30'
                          }`}
                        >
                          {/* Task Top Bar */}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base text-ink">{task.title}</h3>
                                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-paper border border-rule text-ink-soft shrink-0">
                                  ~{formatMins(estMins)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                                <span className="capitalize font-mono px-2 py-0.5 rounded bg-card border border-rule">
                                  {task.type || 'skill'}
                                </span>
                                {task.priority && (
                                  <span
                                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                      task.priority === 'CRITICAL'
                                        ? 'bg-warn-soft text-warn border border-warn/40'
                                        : task.priority === 'HIGH'
                                        ? 'bg-effort-soft text-effort border border-effort/40'
                                        : 'bg-paper text-ink-faint border border-rule'
                                    }`}
                                  >
                                    {task.priority}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div>
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-done text-white">
                                  <CheckCircle2 size={13} />
                                  Completed ({formatMins(task.actualMinutes || task.plannedMinutes || estMins)})
                                </span>
                              )}
                              {isMissed && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-warn text-white">
                                  <XCircle size={13} />
                                  Missed ({task.missedReason || 'Not completed'})
                                </span>
                              )}
                              {!isCompleted && !isMissed && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-paper border border-rule text-ink-soft">
                                  <Clock size={13} />
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Resources Badges */}
                          <ResourceBadges resources={task.resources} resource={task.resource} />

                          {/* Action Row */}
                          {task.completion === 'pending' && (
                            <div className="pt-2 border-t border-rule/50 flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleCompleteTask(task.taskId, estMins)}
                                className="btn-accent text-xs py-1.5 px-3 flex items-center gap-1.5"
                              >
                                <CheckCircle2 size={14} />
                                <span>Mark Complete</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedTaskForMissed(task)}
                                className="btn-quiet text-xs py-1.5 px-3 flex items-center gap-1.5 text-warn hover:bg-warn-soft"
                              >
                                <XCircle size={14} />
                                <span>Report Missed</span>
                              </button>
                            </div>
                          )}

                          {isMissed && task.missedNotes && (
                            <p className="text-xs text-ink-soft italic pt-1">
                              Note: {task.missedNotes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Report View */}
      {activeTab === 'report' && (
        <section className="card p-6 space-y-5 max-w-2xl mx-auto">
          <div className="flex items-center justify-between border-b border-rule pb-4">
            <div>
              <p className="eyebrow">End of Week Performance</p>
              <h2 className="text-xl font-semibold mt-1">Weekly Performance Report</h2>
            </div>
            <Sparkles size={20} className="text-done" aria-hidden="true" />
          </div>

          {reportError ? (
            <EmptyState
              title="Couldn't load your report"
              action={<button className="btn-quiet" onClick={load}>Try again</button>}
            >
              {reportError}
            </EmptyState>
          ) : report && report.hasActivity ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft leading-relaxed">{report.summary}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="panel p-3 text-center">
                  <p className="text-xs text-ink-faint">Completed</p>
                  <p className="figure text-xl font-semibold text-done mt-1">{report.tasksCompleted}</p>
                </div>
                <div className="panel p-3 text-center">
                  <p className="text-xs text-ink-faint">Missed</p>
                  <p className="figure text-xl font-semibold text-warn mt-1">{report.tasksMissed}</p>
                </div>
                <div className="panel p-3 text-center">
                  <p className="text-xs text-ink-faint">Avg Score</p>
                  <p className="figure text-xl font-semibold text-effort mt-1">
                    {report.avgAssessmentScore !== null ? `${report.avgAssessmentScore}%` : 'N/A'}
                  </p>
                </div>
                <div className="panel p-3 text-center">
                  <p className="text-xs text-ink-faint">Weak Areas</p>
                  <p className="figure text-xl font-semibold text-fixed mt-1">{report.weakAreas?.length || 0}</p>
                </div>
              </div>

              {report.skillsImproved?.length > 0 && (
                <div>
                  <Eyebrow>Skills Improved This Week</Eyebrow>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {report.skillsImproved.map((s, idx) => (
                      <Badge key={idx} tone="done">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Not enough activity yet">
              Complete more tasks to generate a meaningful report.
            </EmptyState>
          )}
        </section>
      )}

      {/* Missed Task Modal */}
      {selectedTaskForMissed && (
        <MissedModal
          task={selectedTaskForMissed}
          onClose={() => setSelectedTaskForMissed(null)}
          onSubmit={handleReportMissed}
        />
      )}
    </div>
  );
}
