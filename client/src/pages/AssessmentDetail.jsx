import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Code,
  HelpCircle,
  RotateCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, EmptyState, Loading } from '../components/ui.jsx';
import { fullDate } from '../lib/format.js';

export default function AssessmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // User answers map: questionId -> answer
  const [selectedAnswers, setSelectedAnswers] = useState({});
  // Submission result
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadAssessment();
  }, [id]);

  async function loadAssessment() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.assessments.get(id);
      setAssessment(res.assessment);

      // If already submitted, pre-populate result view
      if (res.assessment.latestAttempt) {
        setResult(res.assessment.latestAttempt);
        const ansMap = {};
        for (const ans of res.assessment.latestAttempt.answers || []) {
          ansMap[ans.questionId] = ans.userAnswer;
        }
        setSelectedAnswers(ansMap);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectOption(questionId, option) {
    if (result) return; // Prevent edits after submission
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (result) return;

    const questions = assessment?.questions || [];
    const unanswered = questions.filter((q) => !selectedAnswers[q.questionId]);
    if (unanswered.length > 0) {
      if (!confirm(`You have ${unanswered.length} unanswered questions. Submit anyway?`)) {
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const answerPayload = questions.map((q) => ({
        questionId: q.questionId,
        answer: selectedAnswers[q.questionId] || '',
      }));

      const res = await api.assessments.submit(assessment._id, { answers: answerPayload });
      setResult(res.result);
      // Reload assessment to get full explanations and answers
      await loadAssessment();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading label="Loading assessment session" />;
  if (error) return <Callout tone="error">{error}</Callout>;
  if (!assessment) return null;

  const questions = assessment.questions || [];
  const isSubmitted = Boolean(result);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button & Header */}
      <div>
        <Link
          to="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors mb-3"
        >
          <ArrowLeft size={14} /> Back to Assessments
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold font-display text-ink">
                {assessment.skillTitle} Assessment
              </h1>
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded border bg-panel text-ink-soft border-rule">
                {assessment.difficulty}
              </span>
            </div>
            <p className="text-xs text-ink-faint mt-1">
              {questions.length} questions assessing technical concepts, edge cases, and problem-solving.
            </p>
          </div>

          {isSubmitted && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-panel border border-rule">
              <div>
                <p className="eyebrow">Score</p>
                <p
                  className={`font-mono text-2xl font-bold ${
                    result.score >= 80 ? 'text-done' : result.score >= 60 ? 'text-effort' : 'text-warn'
                  }`}
                >
                  {result.score}%
                </p>
              </div>
              <div className="h-8 w-px bg-rule" />
              <div>
                <p className="eyebrow">Mastery</p>
                <p className="font-display text-sm font-semibold text-ink mt-0.5">
                  {result.masteryStatus}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post-Submission Result Banner */}
      {isSubmitted && (
        <section className="card p-5 bg-gradient-to-br from-panel to-card border-effort/30 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={24} className="text-done shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-semibold text-base text-ink">
                {result.score >= 65 ? 'Assessment Passed & Verified' : 'Assessment Completed — Review Required'}
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed">
                {result.score >= 65
                  ? `Your score of ${result.score}% has been added as high-confidence verification to your Skill Passport.`
                  : `Score: ${result.score}%. Check the explanations below and strengthen the identified weak topics before retrying.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-rule text-xs">
            <div className="p-2.5 rounded bg-panel border border-rule">
              <p className="eyebrow text-done">Demonstrated Strengths</p>
              <p className="font-medium text-ink mt-1">
                {result.strongTopics?.length > 0 ? result.strongTopics.join(', ') : 'None demonstrated yet'}
              </p>
            </div>

            <div className="p-2.5 rounded bg-panel border border-rule">
              <p className="eyebrow text-warn">Target Weak Areas</p>
              <p className="font-medium text-warn mt-1">
                {result.weakTopics?.length > 0 ? result.weakTopics.join(', ') : 'None detected!'}
              </p>
            </div>
          </div>

          {result.repeatedMistakes?.length > 0 && (
            <p className="text-[11px] text-warn flex items-center gap-1 font-mono pt-1">
              <AlertTriangle size={13} /> Repeated mistakes noted across attempts: {result.repeatedMistakes.join(', ')}
            </p>
          )}
        </section>
      )}

      {/* Question Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {questions.map((q, qIndex) => {
          const selected = selectedAnswers[q.questionId] || '';
          const isCorrect = isSubmitted && selected.toLowerCase() === q.correctAnswer?.toLowerCase();
          const isWrong = isSubmitted && selected && !isCorrect;

          return (
            <div
              key={q.questionId}
              className={`card p-5 space-y-4 transition-colors ${
                isSubmitted
                  ? isCorrect
                    ? 'border-done bg-done-soft'
                    : 'border-warn bg-warn-soft'
                  : ''
              }`}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-faint">
                      Question {qIndex + 1} of {questions.length}
                    </span>
                    <span className="text-xs text-ink-faint">•</span>
                    <span className="text-xs font-medium text-effort">{q.subtopic}</span>
                  </div>
                  <h3 className="font-display font-semibold text-base text-ink">{q.question}</h3>
                </div>

                {isSubmitted && (
                  <span className="shrink-0">
                    {isCorrect ? (
                      <span className="flex items-center gap-1 text-xs font-mono text-done bg-done-soft px-2 py-0.5 rounded border border-done">
                        <Check size={13} /> Correct
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-mono text-warn bg-warn-soft px-2 py-0.5 rounded border border-warn">
                        <X size={13} /> Incorrect
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Code Snippet if applicable */}
              {q.codeSnippet && (
                <pre className="p-3 bg-paper rounded border border-rule text-xs font-mono text-ink-soft overflow-x-auto">
                  <code>{q.codeSnippet}</code>
                </pre>
              )}

              {/* Options (Multiple choice / Scenario) */}
              {q.options?.length > 0 ? (
                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selected === opt;
                    const isTargetCorrect = isSubmitted && opt === q.correctAnswer;

                    let optBorder = 'border-rule hover:border-effort/40';
                    let optBg = 'bg-panel';

                    if (isSubmitted) {
                      if (isTargetCorrect) {
                        optBorder = 'border-done text-done';
                        optBg = 'bg-done-soft';
                      } else if (isSelected && !isCorrect) {
                        optBorder = 'border-warn text-warn';
                        optBg = 'bg-warn-soft';
                      }
                    } else if (isSelected) {
                      optBorder = 'border-effort ring-1 ring-effort';
                      optBg = 'bg-effort-soft';
                    }

                    return (
                      <label
                        key={optIdx}
                        className={`flex items-center gap-3 p-3 rounded-md border text-xs cursor-pointer transition-all ${optBorder} ${optBg}`}
                      >
                        <input
                          type="radio"
                          name={q.questionId}
                          value={opt}
                          checked={isSelected}
                          onChange={() => handleSelectOption(q.questionId, opt)}
                          disabled={isSubmitted}
                          className="w-4 h-4 text-effort shrink-0"
                        />
                        <span className="flex-1 font-medium">{opt}</span>
                        {isSubmitted && isTargetCorrect && (
                          <CheckCircle2 size={15} className="text-done shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                /* Short-answer input */
                <div>
                  <input
                    type="text"
                    value={selected}
                    onChange={(e) => handleSelectOption(q.questionId, e.target.value)}
                    disabled={isSubmitted}
                    placeholder="Type your concise answer..."
                    className="input text-xs"
                  />
                </div>
              )}

              {/* Explanation after submission */}
              {isSubmitted && q.explanation && (
                <div className="mt-3 p-3 rounded bg-panel border border-rule text-xs space-y-1">
                  <p className="eyebrow text-effort">Concept Rationale</p>
                  <p className="text-ink-soft leading-relaxed">{q.explanation}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-rule">
          <Link to="/assessments" className="btn-ghost text-xs">
            Back to Catalog
          </Link>

          {!isSubmitted ? (
            <button
              type="submit"
              disabled={submitting}
              className="btn-accent flex items-center gap-2 py-2 px-5 text-sm"
            >
              <Send size={15} />
              <span>{submitting ? 'Grading...' : 'Submit Assessment'}</span>
            </button>
          ) : (
            <Link to="/skill-passport" className="btn-primary flex items-center gap-2 py-2 px-5 text-sm">
              <ShieldCheck size={16} />
              <span>Inspect Skill Passport</span>
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
