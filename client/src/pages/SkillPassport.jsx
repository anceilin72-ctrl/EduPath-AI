import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Filter,
  FolderGit2,
  GraduationCap,
  History,
  Info,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Callout, EmptyState, Loading, SectionHeading } from '../components/ui.jsx';
import { fullDate, plural } from '../lib/format.js';

const CONFIDENCE_STYLES = {
  High: {
    bg: 'bg-done-soft text-done border-done',
    tone: 'done',
    badge: 'High Confidence',
    desc: 'Multi-source verified (Assessment, Certified, or Resume + Project)',
  },
  Medium: {
    bg: 'bg-effort-soft text-effort border-effort',
    tone: 'effort',
    badge: 'Medium Confidence',
    desc: 'Corroborated (Resume + Self-declared, or Project/Course completed)',
  },
  Low: {
    bg: 'bg-panel text-ink-soft border-rule',
    tone: 'neutral',
    badge: 'Low Confidence',
    desc: 'Self-declared only or pending corroborating evidence',
  },
};

const SOURCE_ICONS = {
  SELF_DECLARED: FileCheck,
  RESUME: FileText,
  PROJECT: FolderGit2,
  CERTIFICATE: Award,
  ASSESSMENT: ShieldCheck,
  LEARNING_ACTIVITY: GraduationCap,
};

const SOURCE_LABELS = {
  SELF_DECLARED: 'Self Declared',
  RESUME: 'Resume Extraction',
  PROJECT: 'Project Evidence',
  CERTIFICATE: 'Certificate Evidence',
  ASSESSMENT: 'Verified Assessment',
  LEARNING_ACTIVITY: 'Learning History',
};

/** Inline Modal Dialog for Skill Passport */
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
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SkillPassport() {
  const { user, refresh } = useAuth();
  const [passport, setPassport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View state: 'INVENTORY' vs 'TIMELINE'
  const [activeView, setActiveView] = useState('INVENTORY');

  // Filters & Search
  const [query, setQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [statusTab, setStatusTab] = useState('ALL');

  // Selected skill modal for deep evidence breakdown
  const [selectedSkill, setSelectedSkill] = useState(null);

  // Modals
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);

  useEffect(() => {
    loadPassport();
  }, []);

  async function loadPassport() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.skills.passport();
      setPassport(res.passport);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading label="Loading your Skill Passport" />;
  if (error) return <Callout tone="error">{error}</Callout>;

  const skills = passport?.skills || [];
  const stats = passport?.stats || {
    totalSkills: 0,
    highConfidenceCount: 0,
    mediumConfidenceCount: 0,
    lowConfidenceCount: 0,
    totalEvidenceCount: 0,
  };

  // Derive counts & status categories (Mutually Exclusive: Strong + Developing + Needs Work = Total Catalog Skills)
  // Strong: High confidence OR advanced level
  // Developing: Medium confidence OR intermediate level (and not Strong)
  // Needs Work: Low confidence OR beginner level OR unevidenced (and not Strong or Developing)
  const strongSkills = skills.filter((s) => s.confidence === 'High' || s.estimatedLevel === 'advanced');
  const strongSet = new Set(strongSkills.map((s) => s.skillId));

  const developingSkills = skills.filter(
    (s) => !strongSet.has(s.skillId) && (s.confidence === 'Medium' || s.estimatedLevel === 'intermediate')
  );
  const devSet = new Set(developingSkills.map((s) => s.skillId));

  const needsWorkSkills = skills.filter((s) => !strongSet.has(s.skillId) && !devSet.has(s.skillId));

  const strongCount = strongSkills.length;
  const developingCount = developingSkills.length;
  const needsWorkCount = needsWorkSkills.length;
  const totalEvidence = stats.totalEvidenceCount || 0;

  // Decoupled Metrics Calculation
  const skillsWithEvidenceCount = skills.filter((s) => s.evidenceCount > 0).length;
  const evidenceCoveragePercent = skills.length > 0
    ? Math.round((skillsWithEvidenceCount / skills.length) * 100)
    : 0;

  const skillProficiencyPercent = skills.length > 0
    ? Math.min(100, Math.round(((strongCount * 1.0 + developingCount * 0.5) / skills.length) * 100))
    : 0;

  const assessmentSkillsCount = skills.filter((s) => s.evidenceSources.includes('ASSESSMENT')).length;

  // Group all evidence chronologically for Timeline view
  const timelineEntries = skills
    .flatMap((skill) =>
      (skill.evidence || []).map((ev) => ({
        ...ev,
        skillId: skill.skillId,
        skillName: skill.skillName,
        domain: skill.domain,
        confidence: skill.confidence,
      }))
    )
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Group timeline entries by date label
  const groupedTimeline = timelineEntries.reduce((acc, entry) => {
    const dateLabel = fullDate(entry.createdAt) || 'Recent Activity';
    if (!acc[dateLabel]) acc[dateLabel] = [];
    acc[dateLabel].push(entry);
    return acc;
  }, {});

  // Filter skills according to tab, domain, and query
  const filteredSkills = skills.filter((s) => {
    if (statusTab === 'STRONG' && !strongSet.has(s.skillId)) return false;
    if (statusTab === 'DEVELOPING' && !devSet.has(s.skillId)) return false;
    if (statusTab === 'NEEDS_WORK' && (strongSet.has(s.skillId) || devSet.has(s.skillId))) return false;

    if (confidenceFilter !== 'ALL' && s.confidence !== confidenceFilter) return false;
    if (domainFilter !== 'ALL' && s.domain !== domainFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const matchName = s.skillName.toLowerCase().includes(q);
      const matchDesc = s.nodeDetails?.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  const targetRoleTitle = passport?.targetRoleKey
    ? passport.targetRoleKey.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : user?.profile?.targetRoleKey
    ? user.profile.targetRoleKey.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : 'AI / Software Engineer';

  return (
    <div className="space-y-6">
      {/* Top Banner: Title & Actions */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold font-display text-ink">Skill Passport</h1>
            <span className="inline-flex items-center gap-1 text-xs font-mono font-medium px-2 py-0.5 rounded-full border bg-effort-soft text-effort border-effort/40">
              <ShieldCheck size={13} /> EduPath Verified
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft max-w-2xl">
            Central repository of your verified technical capabilities, projects, certificates, and assessment records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddProject(true)}
            className="btn-ghost text-sm flex items-center gap-2 border border-rule hover:bg-panel"
          >
            <FolderGit2 size={16} aria-hidden="true" className="text-effort" />
            Add Project
          </button>
          <button
            type="button"
            onClick={() => setShowAddEvidence(true)}
            className="btn-primary text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus size={16} aria-hidden="true" />
            Add Evidence
          </button>
        </div>
      </header>

      {/* Decoupled Progress & Metrics Header Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 bg-card border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-faint">Target Career Goal</p>
            <Target size={16} className="text-effort" />
          </div>
          <div className="mt-2">
            <h2 className="text-base font-bold text-ink truncate">{targetRoleTitle}</h2>
            <p className="text-xs text-ink-soft mt-0.5">{skills.length} catalog skills mapped</p>
          </div>
        </div>

        <div className="card p-4 bg-card border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-faint">Skill Proficiency</p>
            <TrendingUp size={16} className="text-done" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-mono font-bold text-ink">{skillProficiencyPercent}%</span>
              <span className="text-[11px] text-ink-faint">{strongCount} strong / {developingCount} dev</span>
            </div>
            <div className="w-full bg-panel h-1.5 rounded-full mt-1.5 overflow-hidden border border-rule">
              <div className="bg-done h-full rounded-full" style={{ width: `${skillProficiencyPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="card p-4 bg-card border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-faint">Evidence Coverage</p>
            <ShieldCheck size={16} className="text-effort" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-mono font-bold text-ink">{evidenceCoveragePercent}%</span>
              <span className="text-[11px] text-ink-faint">{skillsWithEvidenceCount} of {skills.length} skills</span>
            </div>
            <div className="w-full bg-panel h-1.5 rounded-full mt-1.5 overflow-hidden border border-rule">
              <div className="bg-effort h-full rounded-full" style={{ width: `${evidenceCoveragePercent}%` }} />
            </div>
          </div>
        </div>

        <div className="card p-4 bg-card border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-faint">Evidence Sources</p>
            <History size={16} className="text-fixed" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-mono font-bold text-ink">{totalEvidence}</p>
              <p className="text-[11px] text-ink-faint">{assessmentSkillsCount} assessment verified</p>
            </div>
            <div className="flex -space-x-1.5">
              <span className="w-7 h-7 rounded-full bg-panel border border-rule flex items-center justify-center text-effort text-xs" title="Project Evidence">
                <FolderGit2 size={13} />
              </span>
              <span className="w-7 h-7 rounded-full bg-panel border border-rule flex items-center justify-center text-done text-xs" title="Assessment Verified">
                <ShieldCheck size={13} />
              </span>
              <span className="w-7 h-7 rounded-full bg-panel border border-rule flex items-center justify-center text-fixed text-xs" title="Certificate Verified">
                <Award size={13} />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Category Summary Stat Cards (Mutually Exclusive: Strong, Developing, Needs Work, Total) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusTab(statusTab === 'STRONG' ? 'ALL' : 'STRONG')}
          className={`card p-4 border-l-4 border-l-done cursor-pointer transition-all ${
            statusTab === 'STRONG' ? 'ring-2 ring-done shadow-md' : 'hover:border-rule'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow text-done">Strong Skills</p>
            <CheckCircle2 size={16} className="text-done" />
          </div>
          <p className="text-3xl font-mono font-bold text-ink mt-1.5">{strongCount}</p>
          <p className="text-xs text-ink-faint mt-1">High confidence & verified</p>
        </div>

        <div
          onClick={() => setStatusTab(statusTab === 'DEVELOPING' ? 'ALL' : 'DEVELOPING')}
          className={`card p-4 border-l-4 border-l-effort cursor-pointer transition-all ${
            statusTab === 'DEVELOPING' ? 'ring-2 ring-effort shadow-md' : 'hover:border-rule'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow text-effort">Developing Skills</p>
            <Sparkles size={16} className="text-effort" />
          </div>
          <p className="text-3xl font-mono font-bold text-ink mt-1.5">{developingCount}</p>
          <p className="text-xs text-ink-faint mt-1">Intermediate or active proof</p>
        </div>

        <div
          onClick={() => setStatusTab(statusTab === 'NEEDS_WORK' ? 'ALL' : 'NEEDS_WORK')}
          className={`card p-4 border-l-4 border-l-warn cursor-pointer transition-all ${
            statusTab === 'NEEDS_WORK' ? 'ring-2 ring-warn shadow-md' : 'hover:border-rule'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow text-warn">Needs Work</p>
            <Info size={16} className="text-warn" />
          </div>
          <p className="text-3xl font-mono font-bold text-ink mt-1.5">{needsWorkCount}</p>
          <p className="text-xs text-ink-faint mt-1">Foundational or self-declared</p>
        </div>

        <div
          onClick={() => setStatusTab('ALL')}
          className={`card p-4 border-l-4 border-l-ink-faint cursor-pointer transition-all ${
            statusTab === 'ALL' ? 'ring-2 ring-ink-faint shadow-md' : 'hover:border-rule'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-soft">Total Catalog Skills</p>
            <Layers size={16} className="text-ink-soft" />
          </div>
          <p className="text-3xl font-mono font-bold text-ink mt-1.5">{skills.length}</p>
          <p className="text-xs text-ink-faint mt-1">
            Strong ({strongCount}) + Dev ({developingCount}) + Needs Work ({needsWorkCount})
          </p>
        </div>
      </section>

      {/* Main View Mode Selector (Skills Inventory vs Evidence Timeline) */}
      <div className="flex items-center justify-between border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('INVENTORY')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeView === 'INVENTORY'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-card border border-rule text-ink-soft hover:bg-panel hover:text-ink'
            }`}
          >
            <Layers size={15} />
            Skills Inventory ({skills.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('TIMELINE')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeView === 'TIMELINE'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-card border border-rule text-ink-soft hover:bg-panel hover:text-ink'
            }`}
          >
            <History size={15} />
            Evidence Timeline ({timelineEntries.length})
          </button>
        </div>
      </div>

      {/* VIEW 1: SKILLS INVENTORY */}
      {activeView === 'INVENTORY' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Filter Pills & Search */}
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'ALL', label: `All (${skills.length})` },
                    { id: 'STRONG', label: `Strong (${strongCount})` },
                    { id: 'DEVELOPING', label: `Developing (${developingCount})` },
                    { id: 'NEEDS_WORK', label: `Needs Work (${needsWorkCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusTab(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        statusTab === tab.id
                          ? 'bg-navy text-white shadow-sm'
                          : 'bg-panel text-ink-soft hover:bg-rule/50 hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative shrink-0 w-full sm:w-48">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-ink-faint" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search skill title..."
                    className="input pl-8 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Skill Table Card */}
            {filteredSkills.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No matching skills found"
                description="Try selecting a different filter tab or clearing your search term."
                action={
                  <button type="button" onClick={() => { setStatusTab('ALL'); setQuery(''); }} className="btn-quiet text-xs">
                    Clear Filters
                  </button>
                }
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-panel/70 border-b border-rule text-ink-faint font-mono text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-4">Skill Title</th>
                        <th className="py-3 px-3">Proficiency Level</th>
                        <th className="py-3 px-3 text-center">Confidence</th>
                        <th className="py-3 px-3 text-center">Evidence Sources</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {filteredSkills.map((skill) => {
                        const confStyle = CONFIDENCE_STYLES[skill.confidence] || CONFIDENCE_STYLES.Low;
                        const levelPercent =
                          skill.estimatedLevel === 'advanced'
                            ? 90
                            : skill.estimatedLevel === 'intermediate'
                            ? 60
                            : 35;
                        const levelTone =
                          skill.estimatedLevel === 'advanced'
                            ? 'bg-done'
                            : skill.estimatedLevel === 'intermediate'
                            ? 'bg-effort'
                            : 'bg-ink-faint';

                        return (
                          <tr
                            key={skill.skillId}
                            onClick={() => setSelectedSkill(skill)}
                            className="hover:bg-panel/40 cursor-pointer transition-colors group"
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-ink text-sm group-hover:text-effort transition-colors">
                                {skill.skillName}
                              </div>
                              <div className="text-[11px] text-ink-faint capitalize mt-0.5">
                                {skill.domain} • {skill.type || 'skill'}
                              </div>
                            </td>

                            <td className="py-3 px-3 min-w-[130px]">
                              <div className="flex items-center justify-between text-[11px] font-medium text-ink capitalize mb-1">
                                <span>{skill.estimatedLevel}</span>
                                <span className="text-ink-faint font-mono">{levelPercent}%</span>
                              </div>
                              <div className="w-full bg-panel h-1.5 rounded-full overflow-hidden border border-rule/50">
                                <div className={`h-full rounded-full ${levelTone}`} style={{ width: `${levelPercent}%` }} />
                              </div>
                            </td>

                            <td className="py-3 px-3 text-center">
                              <span className={`inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${confStyle.bg}`}>
                                {skill.confidence}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-1">
                                {skill.evidenceSources.length === 0 ? (
                                  <span className="text-ink-faint text-[10px] font-mono">Not Assessed</span>
                                ) : (
                                  skill.evidenceSources.slice(0, 4).map((src) => {
                                    const Icon = SOURCE_ICONS[src] || FileCheck;
                                    return (
                                      <span
                                        key={src}
                                        title={SOURCE_LABELS[src]}
                                        className="w-5.5 h-5.5 p-1 rounded bg-panel border border-rule flex items-center justify-center text-ink-soft hover:text-ink"
                                      >
                                        <Icon size={12} />
                                      </span>
                                    );
                                  })
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSkill(skill);
                                }}
                                className="btn-ghost p-1 text-ink-faint group-hover:text-effort hover:bg-effort-soft rounded"
                                title="Inspect transparency details"
                              >
                                <ChevronRight size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Overview Panel */}
          <div className="space-y-4">
            <div className="card p-5 bg-card border border-rule space-y-4">
              <h3 className="font-display font-semibold text-base text-ink flex items-center gap-2">
                <ShieldCheck size={18} className="text-done" />
                Passport Evidence Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded bg-panel border border-rule">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <FolderGit2 size={14} className="text-effort" /> Project Evidence
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {skills.filter((s) => s.evidenceSources.includes('PROJECT')).length} skills
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded bg-panel border border-rule">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <ShieldCheck size={14} className="text-done" /> Assessments Passed
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {skills.filter((s) => s.evidenceSources.includes('ASSESSMENT')).length} skills
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded bg-panel border border-rule">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <Award size={14} className="text-fixed" /> Certificates Uploaded
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {skills.filter((s) => s.evidenceSources.includes('CERTIFICATE')).length} skills
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded bg-panel border border-rule">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <FileText size={14} className="text-ink-faint" /> Resume Extracted
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {skills.filter((s) => s.evidenceSources.includes('RESUME')).length} skills
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-5 bg-gradient-to-br from-panel to-card border border-effort/20 space-y-3">
              <h4 className="font-display font-semibold text-sm text-ink flex items-center gap-2">
                <Info size={16} className="text-effort" />
                How Confidence is Calculated
              </h4>
              <div className="text-xs text-ink-soft space-y-2 leading-relaxed">
                <p>
                  <strong className="text-done">High Confidence:</strong> Verified by assessment, OR corroborated across certificate + project/resume.
                </p>
                <p>
                  <strong className="text-effort">Medium Confidence:</strong> Extracted from resume + self-declared, or backed by single project/certificate.
                </p>
                <p>
                  <strong className="text-ink-faint">Low Confidence:</strong> Single self-declaration or pending unconfirmed evidence.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: EVIDENCE TIMELINE */}
      {activeView === 'TIMELINE' && (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-rule">
            <div>
              <h2 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
                <History size={18} className="text-effort" />
                Chronological Evidence Timeline
              </h2>
              <p className="text-xs text-ink-soft mt-1">
                Real-time chronological log of evidence collected from Projects, Certificates, Assessments, and Self-Declarations.
              </p>
            </div>
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-panel border border-rule text-ink-soft">
              {timelineEntries.length} total evidence entries
            </span>
          </div>

          {timelineEntries.length === 0 ? (
            <EmptyState
              icon={History}
              title="No Evidence Records Yet"
              description="Upload a project or certificate to start building your chronological evidence timeline."
              action={
                <button type="button" onClick={() => setShowAddProject(true)} className="btn-primary text-xs">
                  Add Your First Project
                </button>
              }
            />
          ) : (
            <div className="space-y-8 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-rule">
              {Object.entries(groupedTimeline).map(([dateLabel, items]) => (
                <div key={dateLabel} className="space-y-4">
                  {/* Date Heading */}
                  <div className="flex items-center gap-2 relative z-10">
                    <div className="w-7 h-7 rounded-full bg-navy text-white flex items-center justify-center text-xs shadow">
                      <Calendar size={13} />
                    </div>
                    <span className="text-xs font-mono font-semibold text-ink bg-panel px-2.5 py-1 rounded border border-rule">
                      {dateLabel}
                    </span>
                  </div>

                  {/* Items list under this date */}
                  <div className="pl-9 space-y-3">
                    {items.map((item, idx) => {
                      const Icon = SOURCE_ICONS[item.sourceType] || FileCheck;
                      const sourceLabel = SOURCE_LABELS[item.sourceType] || item.sourceType;
                      const isConfirmed =
                        item.verificationStatus === 'USER_CONFIRMED' || item.verificationStatus === 'VERIFIED';

                      return (
                        <div
                          key={item._id || idx}
                          className="card p-4 bg-card border border-rule hover:border-effort/40 transition-colors space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded bg-effort-soft border border-effort/30 flex items-center justify-center text-effort">
                                <Icon size={13} />
                              </span>
                              <span className="font-semibold text-ink">{sourceLabel}</span>
                              {item.metadata?.title && (
                                <span className="font-mono text-ink-soft">({item.metadata.title})</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-ink-faint text-[11px] font-mono">
                                Skill: <strong className="text-ink">{item.skillName}</strong>
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                  isConfirmed ? 'bg-done-soft text-done border-done/30' : 'bg-effort-soft text-effort border-effort/30'
                                }`}
                              >
                                {isConfirmed ? 'Verified' : 'Pending'}
                              </span>
                            </div>
                          </div>

                          <blockquote className="text-xs text-ink-soft bg-panel p-2.5 rounded border border-rule/70 font-mono italic">
                            "{item.evidenceText}"
                          </blockquote>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skill Evidence Detail Modal (WHY IS THIS SKILL HERE?) */}
      {selectedSkill && (
        <EvidenceDetailModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onRefresh={() => {
            loadPassport();
            refresh();
          }}
        />
      )}

      {/* Add Project Modal */}
      {showAddProject && (
        <AddProjectModal
          onClose={() => setShowAddProject(false)}
          onSuccess={() => {
            setShowAddProject(false);
            loadPassport();
            refresh();
          }}
        />
      )}

      {/* Add Direct Evidence Modal */}
      {showAddEvidence && (
        <AddEvidenceModal
          onClose={() => setShowAddEvidence(false)}
          onSuccess={() => {
            setShowAddEvidence(false);
            loadPassport();
            refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Detailed modal breaking down evidence sources, snippets, and verification states for a skill.
 * Features an explicit "WHY IS THIS SKILL HERE?" transparency section.
 */
function EvidenceDetailModal({ skill, onClose, onRefresh }) {
  const [evidenceList, setEvidenceList] = useState(skill.evidence || []);
  const [deletingId, setDeletingId] = useState(null);

  const confStyle = CONFIDENCE_STYLES[skill.confidence] || CONFIDENCE_STYLES.Low;

  async function handleDelete(evidenceId) {
    if (!confirm('Remove this evidence item?')) return;
    setDeletingId(evidenceId);
    try {
      await api.skills.deleteEvidence(skill.skillId, evidenceId);
      setEvidenceList((prev) => prev.filter((e) => e._id !== evidenceId));
      onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirm(evidenceId) {
    try {
      await api.skills.updateEvidence(skill.skillId, evidenceId, {
        verificationStatus: 'USER_CONFIRMED',
      });
      setEvidenceList((prev) =>
        prev.map((e) => (e._id === evidenceId ? { ...e, verificationStatus: 'USER_CONFIRMED' } : e))
      );
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <Dialog open={Boolean(skill)} onClose={onClose} title={`Skill Transparency: ${skill.skillName}`}>
      <div className="space-y-5">
        {/* WHY IS THIS SKILL HERE? Explicit Transparency Section */}
        <div className="card p-4 bg-panel border border-rule space-y-2">
          <h3 className="font-display font-semibold text-xs text-effort uppercase tracking-wider flex items-center gap-1.5">
            <Info size={14} className="text-effort" />
            WHY IS THIS SKILL IN YOUR PASSPORT?
          </h3>
          <p className="text-xs text-ink-soft leading-relaxed">
            {evidenceList.length > 0 ? (
              <>
                <strong>{skill.skillName}</strong> has been included because you have{' '}
                <strong className="text-ink">{evidenceList.length} documented evidence item(s)</strong> from sources such as{' '}
                <span className="font-mono text-effort">{skill.evidenceSources.join(', ') || 'Self Declaration'}</span>.
              </>
            ) : (
              <>
                <strong>{skill.skillName}</strong> is part of your target career catalog. No verified evidence has been attached yet.
              </>
            )}
          </p>
        </div>

        {/* Confidence Banner */}
        <div className={`p-3.5 rounded-lg border ${confStyle.bg} flex items-start gap-3`}>
          <ShieldCheck size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{confStyle.badge}</p>
            <p className="text-xs mt-0.5 opacity-90">{confStyle.desc}</p>
          </div>
        </div>

        {/* Proof Gap Assessment Checklist */}
        <div className="card p-4 bg-panel border border-rule space-y-2.5">
          <p className="eyebrow text-effort font-semibold">Proof Gap & Next Action</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span>{skill.evidenceSources?.includes('PROJECT') ? '✓' : '❌'}</span>
              <span className={skill.evidenceSources?.includes('PROJECT') ? 'text-done font-medium' : 'text-ink-faint'}>
                Project evidence
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{skill.evidenceSources?.includes('CERTIFICATE') ? '✓' : '❌'}</span>
              <span className={skill.evidenceSources?.includes('CERTIFICATE') ? 'text-done font-medium' : 'text-ink-faint'}>
                Certificate evidence
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{skill.evidenceSources?.includes('ASSESSMENT') ? '✓' : '❌'}</span>
              <span className={skill.evidenceSources?.includes('ASSESSMENT') ? 'text-done font-medium' : 'text-ink-faint'}>
                Assessment
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{skill.evidenceSources?.includes('LEARNING_ACTIVITY') ? '✓' : '❌'}</span>
              <span className={skill.evidenceSources?.includes('LEARNING_ACTIVITY') ? 'text-done font-medium' : 'text-ink-faint'}>
                Recent practice
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-rule text-xs space-y-1">
            <p className="text-ink-soft">
              <span className="font-semibold text-ink">Proof Gap:</span>{' '}
              {!skill.evidenceSources?.includes('ASSESSMENT')
                ? 'Current proficiency has not been assessed.'
                : !skill.evidenceSources?.includes('PROJECT')
                ? 'Practical application not yet demonstrated in project work.'
                : 'Multi-source proof confirmed.'}
            </p>
            <div className="flex items-center justify-between pt-1">
              <p className="text-ink-soft">
                <span className="font-semibold text-ink">Action:</span>{' '}
                {!skill.evidenceSources?.includes('ASSESSMENT')
                  ? `Take ${skill.skillName} assessment.`
                  : `Continue learning and portfolio development.`}
              </p>
              {!skill.evidenceSources?.includes('ASSESSMENT') && (
                <Link
                  to={`/assessments/${skill.skillId}`}
                  className="btn-accent py-1 px-2.5 text-[11px]"
                >
                  Start Assessment
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Skill Details */}
        <div className="text-sm space-y-1.5 bg-panel p-3.5 rounded-md border border-rule">
          <p>
            <strong className="text-ink">Estimated Level:</strong>{' '}
            <span className="capitalize font-semibold text-effort">{skill.estimatedLevel}</span>
          </p>
          {skill.nodeDetails?.estimatedHours && (
            <p>
              <strong className="text-ink">Catalog Estimated Hours:</strong>{' '}
              {skill.nodeDetails.estimatedHours} hrs
            </p>
          )}
          {skill.nodeDetails?.prerequisites?.length > 0 && (
            <p>
              <strong className="text-ink">Prerequisites:</strong>{' '}
              {skill.nodeDetails.prerequisites.join(', ')}
            </p>
          )}
          {skill.lastAssessed && (
            <p className="text-xs text-ink-faint pt-1">
              Last updated / verified: {fullDate(skill.lastAssessed)}
            </p>
          )}
        </div>

        {/* Evidence Records List with Snippets & Dates */}
        <div>
          <h4 className="eyebrow mb-2.5">Evidence Records ({evidenceList.length})</h4>

          {evidenceList.length === 0 ? (
            <p className="text-sm text-ink-faint p-4 text-center bg-panel rounded border border-rule">
              No individual evidence records attached yet.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {evidenceList.map((item) => {
                const Icon = SOURCE_ICONS[item.sourceType] || FileCheck;
                const isConfirmed =
                  item.verificationStatus === 'USER_CONFIRMED' || item.verificationStatus === 'VERIFIED';

                return (
                  <div
                    key={item._id}
                    className="p-3 bg-panel rounded-md border border-rule flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-ink">
                        <Icon size={14} className="text-effort" />
                        {SOURCE_LABELS[item.sourceType] || item.sourceType}
                        {item.metadata?.title && (
                          <span className="text-ink-faint text-[11px]">({item.metadata.title})</span>
                        )}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                          isConfirmed ? 'bg-done-soft text-done' : 'bg-effort-soft text-effort'
                        }`}
                      >
                        {item.verificationStatus}
                      </span>
                    </div>

                    <p className="text-xs text-ink-soft bg-paper p-2 rounded border border-rule font-mono break-words">
                      "{item.evidenceText}"
                    </p>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-ink-faint text-[11px]">
                        Recorded: {fullDate(item.createdAt)}
                      </span>

                      <div className="flex items-center gap-2">
                        {!isConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleConfirm(item._id)}
                            className="btn-ghost text-xs text-done py-1 px-2 hover:bg-done-soft"
                          >
                            <Check size={12} className="inline mr-1" /> Confirm
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(item._id)}
                          disabled={deletingId === item._id}
                          className="btn-ghost text-xs text-ink-faint hover:text-warn py-1 px-1.5"
                          title="Delete evidence"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-quiet">
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Modal to submit project details for skill evidence extraction.
 */
function AddProjectModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [techInput, setTechInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please provide both project name and description.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const technologies = techInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await api.skills.addProject({
        title: title.trim(),
        description: description.trim(),
        technologies,
        autoConfirm: true,
      });

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Add Project Evidence">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout tone="error">{error}</Callout>}

        <div>
          <label htmlFor="project-title" className="label">
            Project Title *
          </label>
          <input
            id="project-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AI Career Roadmap Generator or E-Commerce Microservice"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="project-desc" className="label">
            Description & Key Features *
          </label>
          <textarea
            id="project-desc"
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you built, architecture, libraries used, and deployment details..."
            className="input"
          />
        </div>

        <div>
          <label htmlFor="project-tech" className="label">
            Technologies Used (comma separated)
          </label>
          <input
            id="project-tech"
            type="text"
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            placeholder="e.g. React, Node.js, MongoDB, Docker, Python"
            className="input"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-rule">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Extracting & Saving...' : 'Analyze & Link Skills'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Modal to submit manual evidence (certificate, course link, self-declaration) for a skill.
 */
function AddEvidenceModal({ onClose, onSuccess }) {
  const [skillKey, setSkillKey] = useState('');
  const [sourceType, setSourceType] = useState('SELF_DECLARED');
  const [sourceId, setSourceId] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [skillLevel, setSkillLevel] = useState('intermediate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.nodes
      .search('')
      .then((res) => setNodes(res.nodes || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!skillKey) {
      setError('Please select a skill.');
      return;
    }
    if (!evidenceText.trim()) {
      setError('Please provide evidence details or a descriptive note.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.skills.addEvidence(skillKey, {
        sourceType,
        sourceId: sourceId.trim(),
        evidenceText: evidenceText.trim(),
        skillLevel,
        verificationStatus: 'USER_CONFIRMED',
        confirmInProfile: true,
      });

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const matchingNodes = nodes.filter(
    (n) =>
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open onClose={onClose} title="Add Skill Evidence">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout tone="error">{error}</Callout>}

        <div>
          <label htmlFor="evidence-skill-select" className="label">
            Target Skill *
          </label>
          <div className="space-y-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to filter skill catalog..."
              className="input text-sm py-1.5"
            />
            <select
              id="evidence-skill-select"
              required
              value={skillKey}
              onChange={(e) => setSkillKey(e.target.value)}
              className="input text-sm"
              size={4}
            >
              {matchingNodes.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.title} ({n.domain})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="evidence-source-type" className="label">
              Evidence Type
            </label>
            <select
              id="evidence-source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="input text-sm"
            >
              <option value="SELF_DECLARED">Self Declaration</option>
              <option value="PROJECT">Project Evidence</option>
              <option value="CERTIFICATE">Certificate</option>
              <option value="LEARNING_ACTIVITY">Learning History</option>
              <option value="ASSESSMENT">Assessment</option>
            </select>
          </div>

          <div>
            <label htmlFor="evidence-skill-level" className="label">
              Claimed Level
            </label>
            <select
              id="evidence-skill-level"
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value)}
              className="input text-sm"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="evidence-ref-id" className="label">
            Reference / URL / Issuer (optional)
          </label>
          <input
            id="evidence-ref-id"
            type="text"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. AWS Certified Developer URL or Coursera course title"
            className="input text-sm"
          />
        </div>

        <div>
          <label htmlFor="evidence-desc" className="label">
            Evidence Note / Proof Description *
          </label>
          <textarea
            id="evidence-desc"
            required
            rows={3}
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            placeholder="Detail how you applied or studied this skill..."
            className="input text-sm"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-rule">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving...' : 'Add to Passport'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
