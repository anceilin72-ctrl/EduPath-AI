import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  GraduationCap,
  History,
  Play,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Callout, EmptyState, Loading, SectionHeading } from '../components/ui.jsx';
import { fullDate, plural } from '../lib/format.js';

const MASTERY_BADGES = {
  Strong: 'bg-done-soft text-done border-done',
  Proficient: 'bg-done-soft text-done border-done',
  Developing: 'bg-effort-soft text-effort border-effort',
  Learning: 'bg-effort-soft text-effort border-effort',
  Introduced: 'bg-panel text-ink-soft border-rule',
  'Needs Review': 'bg-warn-soft text-warn border-warn',
  Unknown: 'bg-panel text-ink-faint border-rule',
};

export default function Assessments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [skills, setSkills] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [passportRes, historyRes] = await Promise.all([
        api.skills.passport(),
        api.assessments.historyAll(),
      ]);
      setSkills(passportRes.passport?.skills || []);
      setHistory(historyRes.attempts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartAssessment(skillId, difficulty = 'intermediate') {
    setGeneratingKey(skillId);
    setError(null);
    try {
      const res = await api.assessments.generate({ skillId, difficulty });
      navigate(`/assessments/${res.assessment._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingKey(null);
    }
  }

  if (loading) return <Loading label="Loading assessments and mastery records" />;
  if (error) return <Callout tone="error">{error}</Callout>;

  const filteredSkills = skills.filter(
    (s) =>
      !searchQuery ||
      s.skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Skill Mastery Assessments</h1>
            <span className="inline-block text-xs font-mono font-medium px-2 py-0.5 rounded border bg-effort-soft text-effort border-effort">
              EduPath 2.0
            </span>
          </div>
          <p className="mt-1 text-ink-soft">
            Verify competence through adaptive technical checkpoints. Verified attempts update your Skill Passport with High confidence.
          </p>
        </div>

        <Link to="/skill-passport" className="btn-ghost flex items-center gap-1.5 self-start sm:self-auto">
          <ShieldCheck size={16} className="text-done" />
          <span>View Passport</span>
        </Link>
      </header>

      {/* Summary Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="eyebrow">Assessments Taken</p>
          <p className="font-mono text-3xl font-bold mt-1">{history.length}</p>
          <p className="text-xs text-ink-faint mt-0.5">Completed attempts</p>
        </div>

        <div className="card p-4 border-l-4 border-l-done">
          <p className="eyebrow text-done">Average Score</p>
          <p className="font-mono text-3xl font-bold text-done mt-1">
            {history.length > 0
              ? Math.round(history.reduce((sum, h) => sum + h.score, 0) / history.length)
              : 0}
            %
          </p>
          <p className="text-xs text-ink-faint mt-0.5">Across all skills</p>
        </div>

        <div className="card p-4 border-l-4 border-l-effort">
          <p className="eyebrow text-effort">Proficient Skills</p>
          <p className="font-mono text-3xl font-bold text-effort mt-1">
            {
              new Set(
                history
                  .filter((h) => ['Proficient', 'Strong'].includes(h.masteryStatus))
                  .map((h) => h.skillId)
              ).size
            }
          </p>
          <p className="text-xs text-ink-faint mt-0.5">Consistent mastery</p>
        </div>

        <div className="card p-4">
          <p className="eyebrow">Ready to Assess</p>
          <p className="font-mono text-3xl font-bold mt-1">{skills.length}</p>
          <p className="text-xs text-ink-faint mt-0.5">Passport skills</p>
        </div>
      </section>

      {/* Available Skills Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold font-display">Assess Your Skills</h2>
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-ink-faint" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skill to assess..."
              className="input pl-9 text-sm py-1.5"
            />
          </div>
        </div>

        {filteredSkills.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No skills found to assess"
            description="Add skills to your passport or adjust your search term."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map((s) => {
              const pastForSkill = history.filter((h) => h.skillId === s.skillId);
              const latest = pastForSkill[0] || null;
              const isGenerating = generatingKey === s.skillId;

              return (
                <div
                  key={s.skillId}
                  className="card p-5 flex flex-col justify-between hover:border-effort/40 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold font-display text-base text-ink line-clamp-1">
                        {s.skillName}
                      </h3>
                      {latest?.masteryStatus && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            MASTERY_BADGES[latest.masteryStatus] || MASTERY_BADGES.Unknown
                          }`}
                        >
                          {latest.masteryStatus}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-ink-faint mt-1 capitalize">
                      Domain: {s.domain} • Est. Level: {s.estimatedLevel}
                    </p>

                    {latest ? (
                      <div className="mt-3 p-2.5 rounded bg-panel border border-rule text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-soft">Latest Score:</span>
                          <strong className="font-mono text-ink">{latest.score}%</strong>
                        </div>
                        {latest.weakTopics?.length > 0 && (
                          <p className="text-[11px] text-warn truncate">
                            Focus: {latest.weakTopics.join(', ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-soft mt-3 italic">
                        Not yet assessed. Verify knowledge to earn high-confidence badge.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-rule flex items-center justify-between">
                    <span className="text-[11px] text-ink-faint">
                      {plural(pastForSkill.length, 'attempt')}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleStartAssessment(s.skillId, s.estimatedLevel || 'intermediate')}
                      disabled={isGenerating}
                      className="btn-accent text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <Play size={13} />
                      <span>{isGenerating ? 'Generating...' : latest ? 'Retake Test' : 'Start Assessment'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Attempt History Table */}
      {history.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History size={18} className="text-effort" />
            <h2 className="text-lg font-semibold font-display">Assessment History & Progression</h2>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-panel border-b border-rule text-ink-soft eyebrow">
                  <tr>
                    <th className="p-3.5">Skill</th>
                    <th className="p-3.5">Score</th>
                    <th className="p-3.5">Mastery Status</th>
                    <th className="p-3.5">Strong Areas</th>
                    <th className="p-3.5">Weak Areas</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule font-mono">
                  {history.map((att) => (
                    <tr key={att._id} className="hover:bg-panel/50 transition-colors">
                      <td className="p-3.5 font-display font-medium text-ink text-sm">
                        {att.skillTitle || att.skillId}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`font-bold ${
                            att.score >= 80
                              ? 'text-done'
                              : att.score >= 60
                              ? 'text-effort'
                              : 'text-warn'
                          }`}
                        >
                          {att.score}%
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            MASTERY_BADGES[att.masteryStatus] || MASTERY_BADGES.Unknown
                          }`}
                        >
                          {att.masteryStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-ink-soft max-w-xs truncate">
                        {att.strongTopics?.length > 0 ? att.strongTopics.join(', ') : 'None identified'}
                      </td>
                      <td className="p-3.5 text-warn max-w-xs truncate">
                        {att.weakTopics?.length > 0 ? att.weakTopics.join(', ') : 'None'}
                      </td>
                      <td className="p-3.5 text-ink-faint">{fullDate(att.createdAt)}</td>
                      <td className="p-3.5 text-right">
                        <Link
                          to={`/assessments/${att.assessmentId}`}
                          className="btn-ghost py-1 px-2 text-xs text-effort hover:underline"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
