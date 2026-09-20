import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, EmptyState, Eyebrow, Loading } from '../components/ui.jsx';

/**
 * AdaptiveRoadmap — /plans/:id/adapt
 *
 * Shows all pending agent decisions for a roadmap.
 * Learner can Accept (injects adaptive steps) or Reject (dismisses).
 * Also shows the history of applied changes.
 */

const DECISION_LABELS = {
  ADD_STEP: 'New Step Added',
  REMOVE_STEP: 'Step Removed',
  REORDER_STEP: 'Step Reordered',
  RESCHEDULE: 'Rescheduled',
  RECOMMEND_RESOURCE: 'Resource Suggested',
  CREATE_REASSESSMENT: 'Reassessment Scheduled',
  ACCELERATE: 'Accelerate',
  SKIP_SUGGESTION: 'Skip Suggested',
};

const DECISION_TONES = {
  ADD_STEP: 'effort',
  RECOMMEND_RESOURCE: 'effort',
  ACCELERATE: 'done',
  SKIP_SUGGESTION: 'done',
  CREATE_REASSESSMENT: 'fixed',
  RESCHEDULE: 'warn',
  REMOVE_STEP: 'warn',
  REORDER_STEP: 'warn',
};

const STEP_TYPE_LABELS = {
  concept: 'Concept Review',
  practice: 'Practice Task',
  reassessment: 'Reassessment',
  'adaptive-resource': 'Resource',
};

const TONE_CLASSES = {
  effort: { bg: 'bg-effort-soft', text: 'text-effort' },
  done: { bg: 'bg-done-soft', text: 'text-done' },
  fixed: { bg: 'bg-fixed-soft', text: 'text-fixed' },
  warn: { bg: 'bg-warn-soft', text: 'text-warn' },
};

function DecisionCard({ decision, roadmapId, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const toneKey = DECISION_TONES[decision.decisionType] ?? 'effort';
  const tone = TONE_CLASSES[toneKey] ?? TONE_CLASSES.effort;

  async function handle(action) {
    setWorking(true);
    setError(null);
    try {
      if (action === 'accept') {
        await api.roadmaps.acceptDecision(roadmapId, decision._id);
      } else {
        await api.roadmaps.rejectDecision(roadmapId, decision._id);
      }
      onResolved(decision._id, action);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <article className="card overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3.5 border-b border-rule ${tone.bg} flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit size={15} className={`shrink-0 ${tone.text}`} aria-hidden="true" />
          <span className={`font-display text-sm font-semibold ${tone.text}`}>
            {DECISION_LABELS[decision.decisionType] ?? decision.decisionType}
          </span>
          <Badge>{decision.skillTitle || decision.skillId}</Badge>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-ghost shrink-0"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? 'Less' : 'View Why'}
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-soft leading-relaxed">{decision.reason}</p>

        {/* Evidence */}
        {expanded && (
          <div className="space-y-3">
            {decision.evidence?.scores?.length > 0 && (
              <div>
                <Eyebrow>Assessment scores</Eyebrow>
                <p className="text-sm mt-1">
                  {decision.evidence.scores.map((s, i) => (
                    <span key={i} className={`inline-block mr-2 font-mono text-xs px-2 py-0.5 rounded border ${s < 60 ? 'bg-warn-soft border-warn text-warn' : 'bg-done-soft border-done text-done'}`}>
                      Attempt {i + 1}: {s}%
                    </span>
                  ))}
                </p>
              </div>
            )}
            {decision.evidence?.weakTopics?.length > 0 && (
              <div>
                <Eyebrow>Weak areas identified</Eyebrow>
                <p className="text-sm mt-1 text-ink-soft">
                  {decision.evidence.weakTopics.join(', ')}
                </p>
              </div>
            )}
            {decision.evidence?.struggleType && (
              <div>
                <Eyebrow>Struggle pattern</Eyebrow>
                <p className="text-sm mt-1 text-ink-soft capitalize">
                  {decision.evidence.struggleType.replace(/-/g, ' ')}
                </p>
              </div>
            )}

            {/* Proposed steps */}
            {decision.proposedSteps?.length > 0 && (
              <div>
                <Eyebrow>Steps that will be added</Eyebrow>
                <ul className="mt-2 space-y-2">
                  {decision.proposedSteps.map((step) => (
                    <li
                      key={step.nodeKey}
                      className="flex items-start gap-2 p-3 rounded-md border border-rule bg-panel text-sm"
                    >
                      <span className="shrink-0 mt-0.5">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded border bg-paper border-rule text-ink-faint">
                          {STEP_TYPE_LABELS[step.type] ?? step.type}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{step.title}</p>
                        {step.estimatedHours > 0 && (
                          <p className="text-xs text-ink-faint flex items-center gap-1 mt-0.5">
                            <Clock size={11} aria-hidden="true" />
                            ~{step.estimatedHours}h
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <Callout tone="error">{error}</Callout>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => handle('accept')}
            disabled={working}
            className="btn-primary"
          >
            <Check size={14} aria-hidden="true" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => handle('reject')}
            disabled={working}
            className="btn-ghost"
          >
            <X size={14} aria-hidden="true" />
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

function AppliedStep({ step }) {
  return (
    <li className="flex items-start gap-3 p-3 rounded-md border border-done bg-done-soft text-sm">
      <Sparkles size={14} className="shrink-0 mt-0.5 text-done" aria-hidden="true" />
      <div>
        <p className="font-medium text-ink">{step.title}</p>
        <p className="text-xs text-ink-soft mt-0.5">{step.reason}</p>
        <p className="text-xs text-ink-faint mt-0.5">
          {STEP_TYPE_LABELS[step.type] ?? step.type}
          {step.estimatedHours > 0 ? ` · ~${step.estimatedHours}h` : ''}
        </p>
      </div>
    </li>
  );
}

export default function AdaptiveRoadmap() {
  const { id } = useParams();

  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [decisionsRes, historyRes] = await Promise.all([
        api.roadmaps.agentDecisions(id, { status: 'PENDING' }),
        api.roadmaps.adaptationHistory(id),
      ]);
      setPending(decisionsRes.decisions ?? []);
      setHistory(historyRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function handleResolved(decisionId, action) {
    setPending((prev) => prev.filter((d) => d._id !== decisionId));
    if (action === 'accept') {
      // Reload history to show newly applied steps
      load();
    }
  }

  if (loading) return <Loading label="Loading adaptive recommendations" />;
  if (error) return <Callout tone="error">{error}</Callout>;

  const appliedSteps = history?.adaptiveSteps?.filter((s) => s.status !== 'skipped') ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <Link to={`/plans/${id}`} className="btn-ghost px-0 mb-4 inline-flex">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to plan
        </Link>
        <div className="flex items-center gap-3">
          <BrainCircuit size={22} className="text-effort shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">Adaptive Roadmap</h1>
            <p className="text-sm text-ink-soft mt-0.5">
              AI recommendations based on your assessments and progress. You decide what to apply.
            </p>
          </div>
        </div>
      </header>

      {/* Pending decisions */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Eyebrow>Pending recommendations</Eyebrow>
          {pending.length > 0 && (
            <span className="text-xs font-mono bg-effort-soft text-effort border border-effort px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <EmptyState
            title="No pending recommendations"
            action={
              <Link to={`/assessments`} className="btn-quiet">
                <Zap size={14} aria-hidden="true" />
                Take an assessment to generate recommendations
              </Link>
            }
          >
            Complete assessments to let the adaptive agent analyse your performance and suggest
            targeted improvements.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {pending.map((decision) => (
              <DecisionCard
                key={decision._id}
                decision={decision}
                roadmapId={id}
                onResolved={handleResolved}
              />
            ))}
          </div>
        )}
      </section>

      {/* Applied adaptive steps */}
      {appliedSteps.length > 0 && (
        <section className="space-y-4">
          <Eyebrow>Applied adaptations</Eyebrow>
          <ul className="space-y-2">
            {appliedSteps.map((step) => (
              <AppliedStep key={step.nodeKey} step={step} />
            ))}
          </ul>
        </section>
      )}

      {/* Audit log */}
      {history?.adaptationHistory?.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>Adaptation history</Eyebrow>
          <ol className="space-y-2">
            {history.adaptationHistory.map((entry, i) => (
              <li key={i} className="text-sm text-ink-soft flex gap-2 items-start">
                <span className="font-mono text-xs text-ink-faint shrink-0 mt-0.5">
                  {new Date(entry.at).toLocaleDateString()}
                </span>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
