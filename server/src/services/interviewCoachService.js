import { GoogleGenerativeAI } from '@google/generative-ai';
import Roadmap from '../models/Roadmap.js';
import SkillEvidence from '../models/SkillEvidence.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import User from '../models/User.js';

/**
 * 1. Gather Context (Target role, skill gaps, projects, certificates, etc.)
 */
export async function getInterviewContext(userId) {
  if (!userId) return { targetRole: 'Developer', projects: [], certificates: [], skills: [], weakTopics: [] };

  const [user, roadmap, projects, certificates, attempts] = await Promise.all([
    User.findById(userId).lean(),
    Roadmap.findOne({ userId, isArchived: false }).lean(),
    SkillEvidence.find({ userId, sourceType: 'PROJECT' }).lean(),
    SkillEvidence.find({ userId, sourceType: 'CERTIFICATE' }).lean(),
    AssessmentAttempt.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const weakTopics = [...new Set(attempts.flatMap(a => a.weakTopics || []))];
  const roadmapSkills = roadmap ? roadmap.phases.flatMap(p => p.nodes.map(n => n.nodeKey)) : [];
  
  const knownKeys = user?.profile?.knownNodeKeys || [];
  const skills = [...new Set([...roadmapSkills, ...knownKeys])];

  return {
    targetRole: user?.profile?.targetRoleKey || 'Developer',
    projects: projects.map(p => ({
      title: p.metadata?.projectTitle || p.sourceId || 'Project',
      description: p.evidenceText,
    })),
    certificates: certificates.map(c => c.sourceId || 'Certificate'),
    skills,
    weakTopics,
  };
}

/**
 * 2. Classify Interview Mode
 */
export function classifyInterviewMode(message = '') {
  const msg = String(message).toLowerCase();
  if (msg.includes('project')) return 'PROJECT';
  if (msg.includes('mock')) return 'MOCK';
  if (msg.includes('rapid') || msg.includes('rapid-fire') || msg.includes('rapidfire')) return 'RAPID_FIRE';
  if (msg.includes('hr') || msg.includes('behavioral') || msg.includes('behavioural')) return 'HR';
  if (msg.includes('role') || msg.includes('specific')) return 'ROLE_SPECIFIC';
  return 'TECHNICAL'; // default
}

/**
 * Deterministic Question Generators
 */
export function generateProjectQuestions(projects) {
  if (!projects || projects.length === 0) {
    return ["You haven't added any projects yet. Tell me about a coding project you've worked on recently."];
  }
  const proj = projects[0];
  const title = proj.title;
  return [
    `In your project "${title}", what was the most challenging technical hurdle you faced?`,
    `How did you decide on the architecture and technologies for "${title}"?`,
    `If you had to rebuild "${title}" from scratch today, what would you do differently?`
  ];
}

/**
 * Topic banks keyed by skill CATEGORY, not by skill name interpolated blindly
 * into a fixed template. The old version asked things like "how does memory
 * management work in git-version-control" because it dropped whatever the
 * first known skill happened to be into a template written for languages
 * with manual/GC'd memory models. A skill only gets a question from a bank
 * whose topic actually applies to it.
 */
const SKILL_CATEGORY_MATCHERS = [
  {
    category: 'memory-managed-language',
    test: (s) => /^(c|cpp|c\+\+|rust|java|python|javascript|typescript|go|golang|ruby|swift)$/.test(s) ||
      /\b(c\+\+|python|javascript|typescript|java|rust|golang)\b/.test(s),
    questions: (skill) => [
      `Can you explain how memory management works in ${skill}?`,
      `What is the difference between asynchronous and synchronous execution in ${skill}?`,
      `Walk me through what happens when you create and then discard an object in ${skill}.`,
    ],
  },
  {
    category: 'version-control',
    test: (s) => /git|version.?control|svn|mercurial/.test(s),
    questions: (skill) => [
      `Walk me through the difference between merging and rebasing in ${skill}.`,
      `How would you resolve a merge conflict in ${skill}, step by step?`,
      `What's the difference between \`git fetch\` and \`git pull\`?`,
    ],
  },
  {
    category: 'database',
    test: (s) => /sql|database|mongo|postgres|mysql|redis|nosql/.test(s),
    questions: (skill) => [
      `How would you optimize a slow query in ${skill}?`,
      `Explain the difference between an inner join and a left join.`,
      `When would you choose to denormalize a schema in ${skill}?`,
    ],
  },
  {
    category: 'markup-styling',
    test: (s) => /html|css|sass|tailwind/.test(s),
    questions: (skill) => [
      `How does the CSS box model work, and where does it commonly trip people up?`,
      `How would you approach making a layout in ${skill} responsive without a framework?`,
      `What's the difference between semantic and non-semantic HTML, and why does it matter?`,
    ],
  },
  {
    category: 'cloud-devops',
    test: (s) => /docker|kubernetes|k8s|aws|azure|gcp|ci\/?cd|devops|terraform/.test(s),
    questions: (skill) => [
      `What's the difference between a container and a virtual machine, in the context of ${skill}?`,
      `How would you debug a service that works locally but fails in a ${skill} deployment?`,
      `What would you put in a CI/CD pipeline for a typical project using ${skill}?`,
    ],
  },
  {
    category: 'frontend-framework',
    test: (s) => /react|vue|angular|svelte/.test(s),
    questions: (skill) => [
      `Explain the component lifecycle in ${skill} and where side effects belong.`,
      `How does state management typically work in a ${skill} application?`,
      `What's the difference between controlled and uncontrolled components in ${skill}?`,
    ],
  },
];

function questionsForSkill(skill) {
  const normalized = String(skill || '').toLowerCase();
  const match = SKILL_CATEGORY_MATCHERS.find((c) => c.test(normalized));
  if (match) return match.questions(skill);

  // Generic fallback that doesn't presuppose a specific technical model
  // (memory, queries, containers, etc.) the skill may not actually have.
  return [
    `How would you explain ${skill} to a junior developer who's never used it?`,
    `What's a common mistake beginners make when they first start using ${skill}?`,
    `Tell me about a time you had to debug an issue related to ${skill}.`,
  ];
}

export function generateTechnicalQuestions({ targetRole, skills }) {
  const skill = skills?.length > 0 ? skills[0] : 'programming';
  const [q1, q2] = questionsForSkill(skill);
  return [
    q1,
    q2,
    `How would you optimize a slow-performing feature in a typical ${targetRole} application?`,
  ];
}

export function generateRoleQuestions(targetRole) {
  return [
    `As a ${targetRole}, how do you ensure the code you write is maintainable and scalable?`,
    `What metrics would you use to measure the success of a feature you deployed?`,
    `Describe your ideal deployment and CI/CD workflow for a ${targetRole} team.`
  ];
}

export function generateRapidFireQuestions(skills) {
  const skill = skills?.length > 0 ? skills[0] : 'programming';
  const [q1] = questionsForSkill(skill);
  return [
    q1,
    `Explain the concept of state management briefly.`,
    `What does an API gateway do?`
  ];
}

export function generateHRQuestions() {
  return [
    `Tell me about a time you had a disagreement with a team member. How did you resolve it?`,
    `Where do you see your technical skills growing in the next two years?`,
    `How do you handle receiving critical feedback on a pull request?`
  ];
}

/**
 * Detect an "I don't know" / blank / non-answer so the coach never pretends
 * a non-answer demonstrated knowledge (see evaluateAnswerDeterministic).
 */
export function isUnknownResponse(answer = '') {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized) return true;
  const unknownPatterns = [
    "i don't know", "i dont know", "idk", "not sure", "no idea",
    "i'm not sure", "im not sure", "no clue", "not familiar",
    "never used it", "haven't used", "havent used", "skip",
  ];
  return unknownPatterns.some((p) => normalized.includes(p));
}

/**
 * Deterministic Feedback Generator (6-part structure)
 *
 * Never claims a "don't know" answer demonstrated understanding — that would
 * hide the gap from the learner and from the adaptive engine that reads
 * masteryStatus/weakTopics downstream. Instead it teaches the concept and
 * flags the topic as Needs Review.
 */
export function evaluateAnswerDeterministic(question, answer) {
  if (isUnknownResponse(answer)) {
    return {
      isUnknown: true,
      masteryStatus: 'Needs Review',
      strengths: "It's okay not to know this one — recognizing a gap is useful information.",
      gaps: `You weren't able to answer "${question}" yet. That's the topic to prioritize next.`,
      accuracy: 'Not evaluated — no answer was given.',
      clarity: 'Not evaluated — no answer was given.',
      improvement: 'Review the core concept below, then try explaining it out loud in your own words before the next attempt.',
      exampleAnswer: `A solid interview answer here would name the core concept, give one concrete example, and mention a common pitfall — worth drafting once you've reviewed the topic.`,
    };
  }

  return {
    isUnknown: false,
    masteryStatus: 'Developing',
    strengths: "You provided an answer directly related to the question.",
    gaps: "The answer could be more detailed, specifically addressing edge cases.",
    accuracy: "Generally accurate, though lacks deep technical specifics.",
    clarity: "Your communication was clear and easy to follow.",
    improvement: "Try to structure your answer using the STAR method (Situation, Task, Action, Result).",
    exampleAnswer: `To answer "${question}", I would outline the core concept, provide a brief example, and mention a common edge case to show depth of knowledge.`
  };
}

/**
 * 3. Main Orchestrator
 */
export async function conductInterview({ userId, message, mode, history = [] }) {
  const context = await getInterviewContext(userId);
  const actualMode = mode || classifyInterviewMode(message);

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'obviously-not-a-real-key') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const isEvaluating = history.length > 0 && history[history.length - 1].sender === 'coach';
      
      let prompt = `You are the EduPath 2.0 AI Interview Coach.
Your purpose is to test the candidate: "Can I explain/apply this in an interview?"
DO NOT assign proficiency scores (like "Python = 90%"). DO NOT invent project features.
DO NOT combine unrelated concepts into one question (e.g. never ask about "memory
management in git" — memory management applies to languages, not version control).
Only ask about a concept that genuinely belongs to the skill/topic in question.

Target Role: ${context.targetRole}
Mode: ${actualMode}
Projects: ${JSON.stringify(context.projects)}
Weak Topics: ${context.weakTopics.join(', ')}

`;

      if (isEvaluating) {
        const lastQuestion = history[history.length - 1].text;
        prompt += `The last question you asked was: "${lastQuestion}"
The user's answer is: "${message}"

If the answer is effectively "I don't know" / blank / a non-answer, DO NOT invent
strengths or pretend they demonstrated understanding. Instead: say plainly that
this is a gap worth reviewing, then explain the correct concept, give a simple
example, and end with a small follow-up question on the same topic. Mark it as
"Needs Review" rather than scoring it.

Otherwise, evaluate the answer using EXACTLY this markdown structure (bold headers):
**What you did well:** [positive reinforcement]
**Missing concepts:** [specific gaps]
**Technical accuracy:** [correctness check]
**Clarity:** [communication quality]
**Suggested improvement:** [actionable advice]
**Example improved answer:** [concrete better version]

Then, ask the NEXT interview question based on the mode.`;
      } else {
        prompt += `The user said: "${message}"
Ask the first interview question based on the mode (${actualMode}). Make sure it is relevant to their target role or projects (if project mode). Do not provide feedback yet.`;
      }

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return {
        reply: text,
        mode: actualMode,
        source: 'ai-coach'
      };

    } catch (err) {
      console.warn('AI Coach fallback triggered:', err.message);
    }
  }

  // Deterministic Fallback
  let reply = '';
  let lastEvalData = null;

  if (history.length > 0) {
    const lastMsg = history.reverse().find(m => m.sender === 'coach');
    const questionText = lastMsg ? lastMsg.text : 'Previous Question';
    const evalData = evaluateAnswerDeterministic(questionText, message);
    lastEvalData = evalData;
    const wellLabel = evalData.isUnknown ? '**No worries — here\'s the gap:**' : '**What you did well:**';
    reply += `${wellLabel}\n${evalData.strengths}\n\n`;
    reply += `**Missing concepts:**\n${evalData.gaps}\n\n`;
    reply += `**Technical accuracy:**\n${evalData.accuracy}\n\n`;
    reply += `**Clarity:**\n${evalData.clarity}\n\n`;
    reply += `**Suggested improvement:**\n${evalData.improvement}\n\n`;
    reply += `**Example improved answer:**\n${evalData.exampleAnswer}\n\n---\n\n`;
  }

  let nextQ = '';
  switch(actualMode) {
    case 'PROJECT':
      nextQ = generateProjectQuestions(context.projects)[0];
      break;
    case 'HR':
      nextQ = generateHRQuestions()[0];
      break;
    case 'RAPID_FIRE':
      nextQ = generateRapidFireQuestions(context.skills)[0];
      break;
    case 'ROLE_SPECIFIC':
      nextQ = generateRoleQuestions(context.targetRole)[0];
      break;
    case 'MOCK':
    case 'TECHNICAL':
    default:
      nextQ = generateTechnicalQuestions(context)[0];
      break;
  }

  reply += `**Next Question:**\n${nextQ}`;

  return {
    reply,
    mode: actualMode,
    source: 'deterministic-coach',
    needsReview: lastEvalData?.isUnknown ? true : undefined,
    masteryStatus: lastEvalData?.masteryStatus,
  };
}

export function evaluateAnswer({ question, answer, context }) {
    return evaluateAnswerDeterministic(question, answer);
}
