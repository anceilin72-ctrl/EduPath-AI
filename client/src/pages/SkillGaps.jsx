import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FileCheck,
  Filter,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Callout, EmptyState, Loading, SectionHeading } from '../components/ui.jsx';
import { hours, plural } from '../lib/format.js';

const STATUS_CONFIG = {
  STRONG: {
    label: 'Demonstrated (Strong)',
    color: 'text-done',
    border: 'border-done/30',
    bg: 'bg-done-soft',
    badge: 'bg-done-soft text-done border-done',
    desc: 'Meets or exceeds required level with confirmed evidence',
  },
  DEVELOPING: {
    label: 'Developing',
    color: 'text-effort',
    border: 'border-effort/30',
    bg: 'bg-effort-soft',
    badge: 'bg-effort-soft text-effort border-effort',
    desc: 'Partial evidence or 1 level below target requirement',
  },
  WEAK: {
    label: 'Weak / Needs Depth',
    color: 'text-warn',
    border: 'border-warn/30',
    bg: 'bg-warn-soft',
    badge: 'bg-warn-soft text-warn border-warn',
    desc: 'Foundational only; requires deeper concept consolidation',
  },
  GAP: {
    label: 'Skill Gap (Missing)',
    color: 'text-ink-soft',
    border: 'border-rule',
    bg: 'bg-panel',
    badge: 'bg-panel text-ink-soft border-rule',
    desc: 'Completely missing from current profile and evidence records',
  },
  UNVERIFIED: {
    label: 'Requires Verification',
    color: 'text-ink',
    border: 'border-rule',
    bg: 'bg-panel',
    badge: 'bg-panel text-ink border-rule',
    desc: 'Extracted from resume or self-declared, pending evidence confirmation',
  },
};

const PRIORITY_BADGES = {
  CRITICAL: 'bg-warn-soft text-warn border-warn font-semibold',
  HIGH: 'bg-effort-soft text-effort border-effort font-medium',
  MEDIUM: 'bg-panel text-ink-soft border-rule',
  LOW: 'bg-panel text-ink-faint border-rule',
};

/** Simple inline Dialog component */
function Dialog({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card bg-card border border-rule w-full max-w-lg p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-rule">
          <h2 className="font-display font-semibold text-lg text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1 text-ink-faint hover:text-ink"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SkillGaps() {
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetFromUrl = searchParams.get('role');

  const [gapData, setGapData] = useState(null);
  const [allRoles, setAllRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected skill drill-down modal
  const [selectedSkill, setSelectedSkill] = useState(null);

  useEffect(() => {
    // Load catalog roles for switcher
    api.roles
      .list()
      .then((res) => setAllRoles(res.roles || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadGaps(targetFromUrl);
  }, [targetFromUrl]);

  async function loadGaps(roleKey = null) {
    setLoading(true);
    setError(null);
    try {
      const activeRole = roleKey || user?.profile?.targetRoleKey || 'frontend-developer';
      const res = await api.skills.gaps({ roleKey: activeRole });
      setGapData(res.gapAnalysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(newRoleKey) {
    if (!newRoleKey) return;
    setRecalculating(true);
    setError(null);
    try {
      const res = await api.skills.recalculateGaps({
        roleKey: newRoleKey,
        updateProfileTarget: true,
      });
      setGapData(res.gapAnalysis);
      setSearchParams({ role: newRoleKey });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  }

  if (loading) return <Loading label="Evaluating Skill Gap Agent" />;
  if (error) return <Callout tone="error">{error}</Callout>;

  const { targetRole, readinessPercent, stats, explanation, skills } = gapData || {};

  // Grouped skills
  const strongSkills = (skills || []).filter((s) => s.status === 'STRONG');
  const developingSkills = (skills || []).filter((s) => s.status === 'DEVELOPING');
  const gapSkills = (skills || []).filter((s) => s.status === 'GAP' || s.status === 'WEAK');
  const unverifiedSkills = (skills || []).filter((s) => s.status === 'UNVERIFIED');

  const filteredSkills = (skills || []).filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && s.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = s.skillName.toLowerCase().includes(q);
      const matchAction = s.recommendedAction.toLowerCase().includes(q);
      if (!matchName && !matchAction) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header & Target Role Switcher */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Skill Gap Agent</h1>
            <span className="inline-block text-xs font-mono font-medium px-2 py-0.5 rounded border bg-effort-soft text-effort border-effort">
              EduPath 2.0
            </span>
          </div>
          <p className="mt-1 text-ink-soft">
            Deterministic prerequisite graph analysis & AI gap diagnosis against your career target.
          </p>
        </div>

        {/* Role Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="target-role-select" className="label mb-0 shrink-0">
            Target Role:
          </label>
          <select
            id="target-role-select"
            value={targetRole?.key || ''}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={recalculating}
            className="input text-sm font-semibold py-2"
          >
            {allRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title} ({r.domain})
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Target Role Overview & AI Synthesis */}
      <section className="card p-6 bg-gradient-to-br from-panel to-card border-effort/20">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-effort">Target Role Alignment</span>
              <span className="text-xs text-ink-faint">•</span>
              <span className="text-xs text-ink-faint capitalize">{targetRole?.domain}</span>
            </div>
            <h2 className="text-2xl font-semibold font-display text-ink">{targetRole?.title}</h2>
            <p className="text-sm text-ink-soft leading-relaxed">{targetRole?.description}</p>
          </div>

          <div className="flex items-center gap-5 p-4 rounded-lg bg-panel border border-rule shrink-0 w-full sm:w-auto justify-center sm:justify-start">
            <div className="text-center">
              <p className="eyebrow">Readiness</p>
              <p className="font-mono text-4xl font-bold text-done mt-1">{readinessPercent}%</p>
              <p className="text-[11px] text-ink-faint mt-0.5">Weighted capability</p>
            </div>
            <div className="h-10 w-px bg-rule" />
            <div className="space-y-1 text-xs text-ink-soft">
              <p>
                <strong className="text-done font-mono">{stats?.strongCount}</strong> Demonstrated
              </p>
              <p>
                <strong className="text-effort font-mono">{stats?.developingCount}</strong> Developing
              </p>
              <p>
                <strong className="text-warn font-mono">{stats?.criticalCount}</strong> Critical Gaps
              </p>
            </div>
          </div>
        </div>

        {/* AI Explanation Banner */}
        {explanation?.text && (
          <div className="mt-5 pt-4 border-t border-rule/60 flex items-start gap-3 bg-panel/50 p-4 rounded-md">
            <BrainCircuit size={20} className="shrink-0 text-effort mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <span>Agent Strategic Diagnostic</span>
                <span className="text-[10px] font-mono uppercase text-ink-faint">
                  ({explanation.source})
                </span>
              </div>
              <p className="text-ink-soft leading-relaxed">{explanation.text}</p>
            </div>
          </div>
        )}
      </section>

      {/* Next Best Action Card */}
      {gapData?.nextBestAction && (
        <section className="card p-6 bg-gradient-to-r from-effort-soft via-paper to-card border-effort/40 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="eyebrow text-effort font-semibold">Next Best Action</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded border bg-paper border-rule text-ink-faint">
                  ~{gapData.nextBestAction.estimatedMinutes} mins
                </span>
              </div>
              <h3 className="text-xl font-bold font-display text-ink">{gapData.nextBestAction.title}</h3>
              <p className="text-sm text-ink-soft">{gapData.nextBestAction.reason}</p>
            </div>
            <Link
              to={gapData.nextBestAction.url}
              className="btn-accent self-start md:self-auto shrink-0 flex items-center gap-2"
            >
              <span>{gapData.nextBestAction.cta}</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      )}

      {/* Category Overview Pillars */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Strong Pillar */}
        <div className="card p-4 border-t-4 border-t-done">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-done">Demonstrated / Strong</p>
            <span className="font-mono font-bold text-lg text-done">{strongSkills.length}</span>
          </div>
          <p className="text-xs text-ink-faint mt-1 mb-3">Evidenced at required level</p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {strongSkills.length === 0 ? (
              <p className="text-xs text-ink-faint">No strong skills yet.</p>
            ) : (
              strongSkills.map((s) => (
                <button
                  key={s.skillId}
                  type="button"
                  onClick={() => setSelectedSkill(s)}
                  className="w-full text-left text-xs p-1.5 rounded bg-panel hover:bg-rule/40 transition-colors flex items-center justify-between"
                >
                  <span className="truncate font-medium text-ink">{s.skillName}</span>
                  <CheckCircle2 size={13} className="text-done shrink-0 ml-1" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Developing Pillar */}
        <div className="card p-4 border-t-4 border-t-effort">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-effort">Developing</p>
            <span className="font-mono font-bold text-lg text-effort">
              {developingSkills.length}
            </span>
          </div>
          <p className="text-xs text-ink-faint mt-1 mb-3">Within 1 level or partial proof</p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {developingSkills.length === 0 ? (
              <p className="text-xs text-ink-faint">None in this tier.</p>
            ) : (
              developingSkills.map((s) => (
                <button
                  key={s.skillId}
                  type="button"
                  onClick={() => setSelectedSkill(s)}
                  className="w-full text-left text-xs p-1.5 rounded bg-panel hover:bg-rule/40 transition-colors flex items-center justify-between"
                >
                  <span className="truncate font-medium text-ink">{s.skillName}</span>
                  <span className="text-[10px] font-mono text-effort shrink-0 ml-1">
                    {s.currentLevel}→{s.requiredLevel}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Gaps Pillar */}
        <div className="card p-4 border-t-4 border-t-warn">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-warn">Missing Gaps</p>
            <span className="font-mono font-bold text-lg text-warn">{gapSkills.length}</span>
          </div>
          <p className="text-xs text-ink-faint mt-1 mb-3">Missing or weak foundations</p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {gapSkills.length === 0 ? (
              <p className="text-xs text-ink-faint">No missing gaps!</p>
            ) : (
              gapSkills.map((s) => (
                <button
                  key={s.skillId}
                  type="button"
                  onClick={() => setSelectedSkill(s)}
                  className="w-full text-left text-xs p-1.5 rounded bg-panel hover:bg-rule/40 transition-colors flex items-center justify-between"
                >
                  <span className="truncate font-medium text-ink">{s.skillName}</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded border ${PRIORITY_BADGES[s.priority]}`}
                  >
                    {s.priority}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-ink-faint" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skill gaps by title or action..."
            className="input pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by Status"
            className="input text-sm py-2"
          >
            <option value="ALL">All Statuses</option>
            <option value="GAP">Missing Gaps</option>
            <option value="WEAK">Weak Foundation</option>
            <option value="DEVELOPING">Developing</option>
            <option value="STRONG">Strong</option>
            <option value="UNVERIFIED">Requires Verification</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by Priority"
            className="input text-sm py-2"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>
        </div>
      </section>

      {/* Detailed Skill Gap Table / Cards */}
      <div className="space-y-3">
        <h2 className="eyebrow">Evaluated Skills ({filteredSkills.length})</h2>

        {filteredSkills.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No matching skill records"
            description="Adjust your search query or filters."
          />
        ) : (
          <div className="space-y-2.5">
            {filteredSkills.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.GAP;
              const hasPrereqBlockers = item.unmetPrerequisites.length > 0;

              return (
                <div
                  key={item.skillId}
                  onClick={() => setSelectedSkill(item)}
                  className="card p-4 hover:border-effort/40 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold text-base text-ink">
                        {item.skillName}
                      </span>
                      <span
                        className={`text-xs font-mono font-medium px-2 py-0.5 rounded border ${statusCfg.badge}`}
                      >
                        {item.status}
                      </span>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded border ${PRIORITY_BADGES[item.priority]}`}
                      >
                        {item.priority}
                      </span>
                      <span className="text-xs text-ink-faint font-mono">
                        est. {hours(item.estimatedHours)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                      <span>
                        Current Level:{' '}
                        <strong className="text-ink capitalize">{item.currentLevel}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Target Level:{' '}
                        <strong className="text-ink capitalize">{item.requiredLevel}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Evidence: {plural(item.evidenceCount, 'source')}{' '}
                        {item.confidence && `(${item.confidence} conf)`}
                      </span>
                    </div>

                    <p className="text-xs text-ink-soft pt-1 font-mono">{item.recommendedAction}</p>

                    {item.proofGap && (
                      <p className="text-xs text-ink-soft font-sans">
                        <span className="font-semibold text-ink">Proof Gap:</span> {item.proofGap}
                      </p>
                    )}

                    {hasPrereqBlockers && (
                      <p className="text-[11px] text-warn flex items-center gap-1 font-mono pt-0.5">
                        <AlertTriangle size={12} className="shrink-0" />
                        Prerequisite gaps: {item.unmetPrerequisites.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2 text-xs font-medium text-effort">
                    <span>Inspect Gap</span>
                    <ChevronRight size={15} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deep-Dive Modal */}
      {selectedSkill && (
        <SkillGapDetailModal
          skillGap={selectedSkill}
          targetRole={targetRole}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </div>
  );
}

/**
 * Detailed modal breaking down prerequisite chains, downstream blockers,
 * and evidence records for an individual skill gap.
 */
function SkillGapDetailModal({ skillGap, targetRole, onClose }) {
  const statusCfg = STATUS_CONFIG[skillGap.status] || STATUS_CONFIG.GAP;

  return (
    <Dialog open onClose={onClose} title={`Gap Analysis: ${skillGap.skillName}`}>
      <div className="space-y-5 text-sm">
        {/* Status Header */}
        <div className={`p-4 rounded-lg border ${statusCfg.bg} ${statusCfg.border} space-y-1.5`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-base">{statusCfg.label}</span>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded border ${PRIORITY_BADGES[skillGap.priority]}`}
            >
              Priority: {skillGap.priority}
            </span>
          </div>
          <p className="text-xs opacity-90">{statusCfg.desc}</p>
        </div>

        {/* Core Metadata */}
        <div className="p-3.5 bg-panel rounded border border-rule space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="eyebrow">Current Standing</p>
              <p className="font-semibold capitalize text-ink mt-0.5">
                {skillGap.currentLevel} ({skillGap.confidence} confidence)
              </p>
            </div>
            <div>
              <p className="eyebrow">Role Requirement</p>
              <p className="font-semibold capitalize text-ink mt-0.5">
                {skillGap.requiredLevel} ({skillGap.importance} importance)
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-rule text-xs">
            <p className="eyebrow">Role Dependency Impact</p>
            <p className="text-ink-soft mt-0.5">
              Blocks <strong className="text-ink">{skillGap.downstreamCount}</strong> downstream
              topic(s) on the path to {targetRole?.title}.
            </p>
          </div>
        </div>

        {/* Prerequisites Section */}
        <div>
          <h3 className="eyebrow mb-2">Prerequisite Integrity</h3>
          {skillGap.unmetPrerequisites.length === 0 ? (
            <p className="text-xs text-done flex items-center gap-1.5 p-2 bg-done-soft rounded border border-done">
              <CheckCircle2 size={14} /> All foundational prerequisites are met. Ready for study.
            </p>
          ) : (
            <div className="p-3 bg-warn-soft rounded border border-warn text-xs space-y-1 text-warn">
              <p className="font-semibold flex items-center gap-1">
                <AlertTriangle size={13} /> Missing Prerequisites Detected:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] pt-1 opacity-90">
                {skillGap.unmetPrerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Proof Gap & Evidence Checklist */}
        <div className="p-3.5 bg-panel rounded border border-rule space-y-2.5">
          <p className="eyebrow text-effort font-semibold">Proof Gap Analysis</p>
          {skillGap.proofGap && (
            <p className="text-xs text-ink-soft leading-relaxed font-medium">
              {skillGap.proofGap}
            </p>
          )}

          {skillGap.evidenceChecklist && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rule text-xs">
              <div className="flex items-center gap-2">
                <span>{skillGap.evidenceChecklist.project ? '✓' : '❌'}</span>
                <span className={skillGap.evidenceChecklist.project ? 'text-done font-medium' : 'text-ink-faint'}>
                  Project evidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{skillGap.evidenceChecklist.certificate ? '✓' : '❌'}</span>
                <span className={skillGap.evidenceChecklist.certificate ? 'text-done font-medium' : 'text-ink-faint'}>
                  Certificate evidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{skillGap.evidenceChecklist.assessment ? '✓' : '❌'}</span>
                <span className={skillGap.evidenceChecklist.assessment ? 'text-done font-medium' : 'text-ink-faint'}>
                  Assessment
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{skillGap.evidenceChecklist.learning ? '✓' : '❌'}</span>
                <span className={skillGap.evidenceChecklist.learning ? 'text-done font-medium' : 'text-ink-faint'}>
                  Recent practice
                </span>
              </div>
            </div>
          )}

          {skillGap.suggestedProofAction && (
            <div className="pt-2 border-t border-rule flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-ink-faint text-[11px]">Recommended action: </span>
                <span className="font-semibold text-ink">{skillGap.suggestedProofAction}</span>
              </div>
              {skillGap.proofActionType === 'assessment' && (
                <Link
                  to={`/assessments/${skillGap.skillId}`}
                  className="btn-accent py-1 px-3 text-xs shrink-0"
                >
                  Start Assessment
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recommended Action */}
        <div className="p-3 bg-paper rounded border border-rule space-y-1">
          <p className="eyebrow text-effort">Roadmap Recommendation</p>
          <p className="text-xs text-ink font-mono">{skillGap.recommendedAction}</p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            to={`/skill-passport`}
            className="btn-ghost text-xs flex items-center gap-1 text-effort hover:underline"
          >
            <FileCheck size={14} /> View Evidence in Passport
          </Link>
          <button type="button" onClick={onClose} className="btn-quiet text-xs">
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
