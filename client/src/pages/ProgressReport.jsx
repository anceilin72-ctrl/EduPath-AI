import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, EmptyState, Eyebrow, Loading, Meter, Stat } from '../components/ui.jsx';

/**
 * ProgressReport — /progress-report
 *
 * Detailed report: Target role, acquired skills, developing skills, remaining gaps,
 * learning hours, assessment performance, persistent struggles, and evidence-based
 * readiness categories (Strong, Developing, Needs Work).
 */

const STATUS_TONES = {
  Strong: 'done',
  Developing: 'effort',
  'Needs Work': 'warn',
};

export default function ProgressReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.reports.progress();
      setReport(res.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading label="Loading progress report" />;
  if (error) return <Callout tone="error">{error}</Callout>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={24} className="text-effort shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">Evidence-Based Progress Report</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Grounded progress evaluation for target role: <strong className="text-ink">{report.targetRole}</strong>.
          </p>
        </div>

        <Link to="/ai-agent" className="btn-quiet text-xs">
          Discuss with AI Agent
        </Link>
      </header>

      {/* Summary Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Skills Acquired" value={report.skillsAcquired.length} tone="done" unit="skills" />
        <Stat label="Hours Logged" value={report.totalLearningHours} tone="effort" unit="hours" />
        <Stat label="Assessment Avg" value={report.assessmentAvgScore !== null ? `${report.assessmentAvgScore}%` : 'N/A'} tone="fixed" />
        <Stat label="Remaining Gaps" value={report.remainingGapsCount} tone="warn" unit="nodes" />
      </section>

      {/* Evidence-Based Readiness Categories */}
      <section className="card p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div>
            <Eyebrow>Evidence-Based Career Readiness</Eyebrow>
            <h2 className="text-lg font-semibold mt-0.5">Domain Breakdown (No Fake Guarantees)</h2>
          </div>
          <ShieldCheck size={20} className="text-done" />
        </div>

        <div className="space-y-4">
          {report.categories?.map((cat) => (
            <div key={cat.categoryName} className="p-4 rounded-md border border-rule bg-panel space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-ink">{cat.categoryName}</span>
                <Badge tone={STATUS_TONES[cat.status] || 'effort'}>{cat.status}</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cat.skills.map((skill) => (
                  <div key={skill.skillId} className="p-2 rounded bg-paper border border-rule text-xs flex items-center justify-between">
                    <span className="truncate">{skill.title}</span>
                    <span className={`text-[10px] font-mono px-1 rounded ${skill.status === 'Strong' ? 'text-done font-semibold' : 'text-ink-faint'}`}>
                      {skill.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Persistent Struggles */}
      {report.persistentStruggles?.length > 0 && (
        <section className="card p-6 space-y-3 border-l-4 border-l-warn">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-warn shrink-0" />
            <h3 className="font-semibold text-base">Persistent Struggles Detected</h3>
          </div>
          <p className="text-xs text-ink-soft">
            The following topics require targeted review due to recent assessment scores below threshold:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {report.persistentStruggles.map((skillId) => (
              <Badge key={skillId} tone="warn">{skillId}</Badge>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Next Steps */}
      <section className="panel p-5 space-y-3">
        <Eyebrow>Recommended Next Steps</Eyebrow>
        <ul className="space-y-2 text-sm text-ink-soft">
          {report.recommendedNextSteps?.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <ArrowRight size={14} className="text-effort shrink-0 mt-1" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
