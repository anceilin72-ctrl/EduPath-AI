/**
 * assessmentService.js — Question generation, evaluation, weak topic detection,
 * and deterministic mastery calculations for EduPath 2.0 (Phase 3).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import SkillEvidence from '../models/SkillEvidence.js';
import { loadCatalogIndex } from './roadmapService.js';

/**
 * Standard fallback question bank per technology domain/topic
 * ensures assessments work flawlessly when offline or with zero API key quota.
 */
const DEFAULT_QUESTION_BANK = {
  default: [
    {
      questionId: 'q-def-1',
      type: 'multiple-choice',
      question: 'Which of the following best describes the core purpose of modular design?',
      options: [
        'To reduce disk space during deployment',
        'To isolate concerns, improve maintainability, and allow component reuse',
        'To force linear execution of functions',
        'To avoid writing automated tests',
      ],
      correctAnswer: 'To isolate concerns, improve maintainability, and allow component reuse',
      explanation: 'Modular design isolates functionality so components can be modified or tested independently.',
      subtopic: 'Architecture & Modularity',
      difficulty: 'intermediate',
    },
    {
      questionId: 'q-def-2',
      type: 'multiple-choice',
      question: 'What is the primary risk of mutable shared state in concurrent execution?',
      options: [
        'Compilation timeouts',
        'Race conditions and unpredictable side effects',
        'Larger network payloads',
        'Syntax parsing ambiguities',
      ],
      correctAnswer: 'Race conditions and unpredictable side effects',
      explanation: 'Shared mutable state across asynchronous operations introduces non-deterministic race conditions.',
      subtopic: 'Concurrency & State',
      difficulty: 'intermediate',
    },
    {
      questionId: 'q-def-3',
      type: 'scenario',
      question: 'In production, your service latency suddenly spikes during peak traffic. Which telemetry metric should you inspect first?',
      options: [
        'Local code comment density',
        'Database connection pool saturation and query durations',
        'Number of git branches in the repo',
        'Vite bundle chunk count',
      ],
      correctAnswer: 'Database connection pool saturation and query durations',
      explanation: 'I/O operations, specifically unoptimized queries and exhausted connection pools, are the most frequent cause of sudden latency spikes.',
      subtopic: 'Debugging & Performance',
      difficulty: 'intermediate',
    },
    {
      questionId: 'q-def-4',
      type: 'short-answer',
      question: 'What is the time complexity of searching for an element by key in a standard hash table on average?',
      options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
      correctAnswer: 'O(1)',
      explanation: 'Hash tables compute direct index offsets using a hashing function, achieving average O(1) lookups.',
      subtopic: 'Data Structures',
      difficulty: 'beginner',
    },
  ],
  javascript: [
    {
      questionId: 'js-1',
      type: 'multiple-choice',
      question: 'How does the JavaScript Event Loop handle microtasks vs macrotasks?',
      options: [
        'Macrotasks (like setTimeout) execute before Promise microtasks',
        'All microtasks in the microtask queue run before the next macrotask is processed',
        'Microtasks and macrotasks execute concurrently on two separate CPU cores',
        'Microtasks are discarded if macrotasks take longer than 16ms',
      ],
      correctAnswer: 'All microtasks in the microtask queue run before the next macrotask is processed',
      explanation: 'The event loop drains the microtask queue (Promise callbacks, queueMicrotask) immediately after the current call stack clears before taking the next macrotask.',
      subtopic: 'Event Loop & Asynchrony',
      difficulty: 'intermediate',
    },
    {
      questionId: 'js-2',
      type: 'multiple-choice',
      question: 'What is the difference between Object.freeze() and Object.seal()?',
      options: [
        'freeze prevents adding/deleting properties and makes existing properties read-only; seal allows modifying existing properties',
        'seal prevents adding properties; freeze allows adding but prevents deleting',
        'freeze only applies to arrays; seal applies to plain objects',
        'There is no difference in modern ES2022',
      ],
      correctAnswer: 'freeze prevents adding/deleting properties and makes existing properties read-only; seal allows modifying existing properties',
      explanation: 'Object.freeze makes an object completely immutable shallowly, while Object.seal allows value mutations on existing properties.',
      subtopic: 'Objects & Mutability',
      difficulty: 'intermediate',
    },
    {
      questionId: 'js-3',
      type: 'debugging',
      question: 'Why does [1, 2, 10].sort() produce [1, 10, 2] in JavaScript?',
      options: [
        'Memory alignment forces powers of 10 first',
        'Array.prototype.sort converts elements to strings and compares UTF-16 code units by default',
        'The sort method is limited to single-digit numbers',
        'It is a known V8 compiler bug',
      ],
      correctAnswer: 'Array.prototype.sort converts elements to strings and compares UTF-16 code units by default',
      explanation: 'Without a comparator function (a, b) => a - b, sort() casts values to strings, where "10" precedes "2".',
      subtopic: 'Type Coercion & Arrays',
      difficulty: 'intermediate',
    },
    {
      questionId: 'js-4',
      type: 'scenario',
      question: 'A web app suffers memory leaks because event listeners on unmounted DOM nodes retain outer scope closures. What is the standard remediation?',
      options: [
        'Use eval() inside the listener',
        'Remove listeners using removeEventListener in cleanup hooks or use AbortController signal',
        'Declare variables on window instead of local scope',
        'Set setTimeout to 0 on every click',
      ],
      correctAnswer: 'Remove listeners using removeEventListener in cleanup hooks or use AbortController signal',
      explanation: 'Explicitly detaching event listeners or using AbortSignal allows the garbage collector to reclaim enclosed references.',
      subtopic: 'Closures & Memory Management',
      difficulty: 'advanced',
    },
  ],
  react: [
    {
      questionId: 'react-1',
      type: 'multiple-choice',
      question: 'What is the primary benefit of React keys during reconciliation?',
      options: [
        'They give elements random CSS colors',
        'They identify which items in a list have changed, been added, or removed across renders',
        'They prevent child components from using useEffect',
        'They increase server bandwidth',
      ],
      correctAnswer: 'They identify which items in a list have changed, been added, or removed across renders',
      explanation: 'Keys provide stable identities for React Fiber nodes, minimizing destructive DOM recreations.',
      subtopic: 'Reconciliation & Virtual DOM',
      difficulty: 'intermediate',
    },
    {
      questionId: 'react-2',
      type: 'debugging',
      question: 'Why does reading state immediately after calling setState(val) return the old value?',
      options: [
        'State updates are queued and applied during the subsequent render phase',
        'React state is stored in localStorage asynchronously',
        'setState is throttled to 1 call per second',
        'Vite hot-reloading replaces state variables',
      ],
      correctAnswer: 'State updates are queued and applied during the subsequent render phase',
      explanation: 'State setters schedule a re-render; the local variable in the executing function closure remains unchanged.',
      subtopic: 'State Lifecycle & Batching',
      difficulty: 'intermediate',
    },
    {
      questionId: 'react-3',
      type: 'scenario',
      question: 'A large component re-renders on unrelated parent state changes. What hook or higher-order component optimizes this when props are primitives?',
      options: [
        'useLayoutEffect',
        'React.memo (or useMemo for expensive child calculations)',
        'useRef',
        'useContext',
      ],
      correctAnswer: 'React.memo (or useMemo for expensive child calculations)',
      explanation: 'React.memo wraps functional components to shallow-compare props and skip rendering when inputs have not changed.',
      subtopic: 'Component Optimization',
      difficulty: 'intermediate',
    },
  ],
};

/**
 * Generate questions for a skill using AI (Gemini) with deterministic fallback.
 */
export async function generateAssessmentQuestions({
  skillId,
  skillTitle,
  difficulty = 'intermediate',
  learnerLevel = 'beginner',
  targetRoleTitle = 'Developer',
  weakAreas = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== '' && apiKey !== 'obviously-not-a-real-key') {
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `You are the EduPath 2.0 Assessment Engine.
Generate 4 rigorous, technical assessment questions for the skill: "${skillTitle}" (slug: ${skillId}).
Learner level: ${learnerLevel}
Target difficulty: ${difficulty}
Target role: ${targetRoleTitle}
Weak areas to target if applicable: ${weakAreas.join(', ') || 'None specified'}

Include:
- 2 multiple-choice questions
- 1 scenario-based question
- 1 debugging question (code reasoning)

Return a JSON array of objects with the exact schema:
[
  {
    "questionId": "q1",
    "type": "multiple-choice" | "scenario" | "debugging" | "short-answer",
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Exact string matching one of the options",
    "explanation": "Detailed rationale explaining why this answer is correct",
    "subtopic": "Subtopic name (e.g. Memory, Closures, Reconciliation, Routing)",
    "difficulty": "beginner" | "intermediate" | "advanced",
    "codeSnippet": "Optional snippet if applicable"
  }
]`;

      const response = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI generation timeout')), 7000)),
      ]);

      const parsed = JSON.parse(response?.response?.text() || '[]');
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed.map((q, idx) => ({
          questionId: q.questionId || `q-${idx + 1}`,
          type: q.type || 'multiple-choice',
          question: q.question,
          options: q.options || [],
          correctAnswer: q.correctAnswer || (q.options ? q.options[0] : ''),
          explanation: q.explanation || '',
          skillId,
          subtopic: q.subtopic || 'Core Concept',
          difficulty: q.difficulty || difficulty,
          codeSnippet: q.codeSnippet || '',
        }));
      }
    } catch (err) {
      // Graceful fallback to verified question banks
    }
  }

  // Fallback to static bank
  const key = Object.keys(DEFAULT_QUESTION_BANK).find((k) =>
    skillId.toLowerCase().includes(k)
  ) || 'default';

  const baseQuestions = DEFAULT_QUESTION_BANK[key] || DEFAULT_QUESTION_BANK.default;
  return baseQuestions.map((q, idx) => ({
    ...q,
    questionId: `q-${idx + 1}-${Date.now()}`,
    skillId,
  }));
}

/**
 * Evaluate submitted answers against assessment questions.
 */
export function evaluateAssessmentSubmission(questions = [], userAnswers = []) {
  const answerMap = new Map();
  for (const ans of userAnswers) {
    answerMap.set(ans.questionId, String(ans.answer || '').trim());
  }

  let correctCount = 0;
  const detailedAnswers = [];
  const subtopicPerformance = new Map(); // subtopic -> { correct, total }

  for (const q of questions) {
    const userAns = answerMap.get(q.questionId) || '';
    const isCorrect = userAns.toLowerCase() === q.correctAnswer.toLowerCase();

    if (isCorrect) correctCount++;

    detailedAnswers.push({
      questionId: q.questionId,
      userAnswer: userAns,
      isCorrect,
      subtopic: q.subtopic,
    });

    const perf = subtopicPerformance.get(q.subtopic) || { correct: 0, total: 0 };
    perf.total += 1;
    if (isCorrect) perf.correct += 1;
    subtopicPerformance.set(q.subtopic, perf);
  }

  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  const strongTopics = [];
  const weakTopics = [];

  for (const [subtopic, perf] of subtopicPerformance.entries()) {
    const ratio = perf.correct / perf.total;
    if (ratio >= 0.75) {
      strongTopics.push(subtopic);
    } else {
      weakTopics.push(subtopic);
    }
  }

  return {
    score,
    detailedAnswers,
    strongTopics,
    weakTopics,
  };
}

/**
 * Deterministic Mastery Calculation.
 *
 * Statuses:
 * - Unknown: No attempts
 * - Introduced: 1 attempt with score < 60%
 * - Learning: Score 60-74% or 1st attempt at 75%+
 * - Developing: Multiple attempts with average >= 70% or 1 high score + project evidence
 * - Proficient: Consistent scores >= 80% across 2+ attempts
 * - Strong: Consistent scores >= 90% across multiple attempts + corroborated project evidence
 * - Needs Review: Score dropped below 60% on re-attempt after previously passing
 */
export function computeMasteryStatus({
  latestScore,
  previousAttempts = [],
  hasProjectEvidence = false,
}) {
  const allScores = [...previousAttempts.map((a) => a.score), latestScore];
  const attemptCount = allScores.length;

  if (attemptCount === 1) {
    if (latestScore < 60) return 'Introduced';
    if (latestScore < 80) return 'Learning';
    return hasProjectEvidence ? 'Developing' : 'Learning';
  }

  const prevBest = Math.max(...previousAttempts.map((a) => a.score));

  // If learner previously excelled but latest score plummeted
  if (prevBest >= 80 && latestScore < 60) {
    return 'Needs Review';
  }

  const recentAvg = (latestScore + previousAttempts[0]?.score) / 2;

  if (latestScore >= 90 && recentAvg >= 85 && hasProjectEvidence) {
    return 'Strong';
  }

  if (latestScore >= 80 && recentAvg >= 75) {
    return 'Proficient';
  }

  if (latestScore >= 70 || recentAvg >= 65) {
    return 'Developing';
  }

  return 'Learning';
}

/**
 * Detect repeated mistakes across multiple attempts for a skill.
 */
export function findRepeatedMistakes(currentWeak = [], pastAttempts = []) {
  const pastWeakSet = new Set(pastAttempts.flatMap((a) => a.weakTopics || []));
  return currentWeak.filter((topic) => pastWeakSet.has(topic));
}

/**
 * Process a completed assessment attempt, persist record, compute mastery,
 * and seamlessly sync high-confidence ASSESSMENT evidence to the Skill Passport.
 */
export async function submitAssessment({
  assessmentId,
  user,
  answers,
}) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw new Error('Assessment not found');

  const pastAttempts = await AssessmentAttempt.find({
    userId: user._id,
    skillId: assessment.skillId,
  }).sort({ createdAt: -1 });

  const evaluation = evaluateAssessmentSubmission(assessment.questions, answers);

  const repeatedMistakes = findRepeatedMistakes(evaluation.weakTopics, pastAttempts);

  const hasProject = await SkillEvidence.exists({
    userId: user._id,
    skillId: assessment.skillId,
    sourceType: 'PROJECT',
  });

  const masteryStatus = computeMasteryStatus({
    latestScore: evaluation.score,
    previousAttempts: pastAttempts,
    hasProjectEvidence: Boolean(hasProject),
  });

  const attempt = await AssessmentAttempt.create({
    assessmentId: assessment._id,
    userId: user._id,
    skillId: assessment.skillId,
    answers: evaluation.detailedAnswers,
    score: evaluation.score,
    weakTopics: evaluation.weakTopics,
    strongTopics: evaluation.strongTopics,
    repeatedMistakes,
    masteryStatus,
  });

  // Automatically record or update verified ASSESSMENT evidence in Skill Passport
  const evidenceText = `Scored ${evaluation.score}% on ${assessment.difficulty} assessment. Strong: ${evaluation.strongTopics.join(', ') || 'None'}. Weak: ${evaluation.weakTopics.join(', ') || 'None'}. Mastery: ${masteryStatus}`;

  await SkillEvidence.create({
    userId: user._id,
    skillId: assessment.skillId,
    sourceType: 'ASSESSMENT',
    sourceId: String(attempt._id),
    evidenceText,
    skillLevel: evaluation.score >= 85 ? 'advanced' : evaluation.score >= 65 ? 'intermediate' : 'beginner',
    confidence: 'High',
    verificationStatus: evaluation.score >= 65 ? 'VERIFIED' : 'USER_CONFIRMED',
    metadata: {
      score: evaluation.score,
      masteryStatus,
      weakTopics: evaluation.weakTopics,
      strongTopics: evaluation.strongTopics,
      assessmentId: String(assessment._id),
    },
  });

  // If score is proficient (>= 65%), confirm in user.profile.knownNodeKeys
  if (evaluation.score >= 65) {
    const existing = user.profile?.knownNodeKeys || [];
    if (!existing.includes(assessment.skillId)) {
      user.profile.knownNodeKeys = [...existing, assessment.skillId];
    }
    if (evaluation.score >= 85) {
      if (user.profile.skillLevels instanceof Map) {
        user.profile.skillLevels.set(assessment.skillId, 'advanced');
      } else {
        user.profile.skillLevels[assessment.skillId] = 'advanced';
      }
    }
    await user.save();
  }

  return {
    attemptId: attempt._id,
    score: evaluation.score,
    masteryStatus,
    strongTopics: evaluation.strongTopics,
    weakTopics: evaluation.weakTopics,
    repeatedMistakes,
    detailedAnswers: evaluation.detailedAnswers,
    questionsWithExplanations: assessment.questions,
  };
}
