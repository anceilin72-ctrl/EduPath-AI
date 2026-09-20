import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGroundedContext } from './groundedAgentTools.js';
import AgentActivity from '../models/AgentActivity.js';
import CareerNode from '../models/CareerNode.js';

/**
 * Intent Classifier
 */
export function classifyIntent(message) {
  const msg = String(message || '').toLowerCase().trim();

  // 1. TIME_CONSTRAINED_PLAN
  const hourMatch = msg.match(/(?:have|got|only)\s+(\d+)\s*(?:hour|hr|hrs|hours|minute|min|mins)/);
  if (hourMatch || (msg.includes('today') && (msg.includes('1 hour') || msg.includes('one hour') || msg.includes('2 hours')))) {
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 1;
    return { type: 'TIME_CONSTRAINED_PLAN', availableHours: hours };
  }

  // 2. DAILY_PLAN
  if (
    msg.includes('learn today') ||
    msg.includes('do today') ||
    msg.includes('today plan') ||
    msg.includes('what should i learn today') ||
    msg.includes('what to do today')
  ) {
    return { type: 'DAILY_PLAN' };
  }

  // 3. SKILL_GAP
  if (
    msg.includes('missing') ||
    msg.includes('skill gap') ||
    msg.includes('gaps') ||
    msg.includes('skills am i missing') ||
    msg.includes('what skills am i missing')
  ) {
    return { type: 'SKILL_GAP' };
  }

  // 4. ASSESSMENT / REMEDIATION
  if (msg.includes('failed') || msg.includes('low score') || msg.includes('weakness') || msg.includes('failed my assessment')) {
    return { type: 'ASSESSMENT' };
  }

  // 5. ROADMAP_QUESTION
  if (
    msg.includes('why am i learning') ||
    msg.includes('why did my roadmap change') ||
    msg.includes('my roadmap') ||
    msg.includes('active plan') ||
    msg.includes('readiness')
  ) {
    return { type: 'ROADMAP_QUESTION' };
  }

  // 6. CAREER_QUESTION (e.g., "Why should I learn Python if my target is Mobile App Developer?")
  if (
    (msg.includes('why should i learn') || msg.includes('why learn') || msg.includes('is it useful for')) &&
    (msg.includes('target') || msg.includes('roadmap') || msg.includes('career') || msg.includes('role'))
  ) {
    return { type: 'CAREER_QUESTION' };
  }

  // 7. CONCEPT_EXPLANATION (e.g., "Explain Python loops", "What is REST API?")
  if (msg.startsWith('explain ') || msg.includes('explain how') || msg.includes('what is ') || msg.includes('what are ')) {
    if (msg.includes('topic') || msg.includes('covered') || msg.includes('basics') || msg.includes('fundamentals')) {
      return { type: 'TOPIC_LIST' };
    }
    return { type: 'CONCEPT_EXPLANATION' };
  }

  // 8. TOPIC_LIST (e.g., "what are the topics to be covered for python basics", "What are JavaScript fundamentals?")
  if (
    msg.includes('topic') ||
    msg.includes('covered') ||
    msg.includes('basics') ||
    msg.includes('fundamentals') ||
    msg.includes('syllabus') ||
    msg.includes('curriculum')
  ) {
    return { type: 'TOPIC_LIST' };
  }

  // 9. HOW_TO / KNOWLEDGE_QUESTION
  if (msg.includes('how to') || msg.includes('how do i') || msg.includes('what are') || msg.includes('python') || msg.includes('javascript') || msg.includes('react') || msg.includes('sql')) {
    return { type: 'KNOWLEDGE_QUESTION' };
  }

  return { type: 'GENERAL' };
}

/**
 * Main Chat Handler
 */
export async function processAgentChat({ userId, message, history = [] }) {
  const context = await getGroundedContext(userId);
  const intent = classifyIntent(message);
  const userMsgLower = String(message || '').toLowerCase();

  let replyText = '';
  let actions = [];
  let actionLogged = `Intent: ${intent.type}`;

  // ──────────────────────────────────────────────────────────────────────────
  // 1. TIME_CONSTRAINED_PLAN (Roadmap-dependent)
  // ──────────────────────────────────────────────────────────────────────────
  if (intent.type === 'TIME_CONSTRAINED_PLAN') {
    const hoursNum = intent.availableHours || 1;
    const roleName = context.roadmap?.roleTitle || 'your target career';
    const tasksNow = context.todayPlan?.tasks || [];

    if (tasksNow.length > 0) {
      const lines = tasksNow
        .slice(0, 4)
        .map((t, i) => `${i + 1}. **${t.title}** (~${t.estimatedMinutes} mins)`)
        .join('\n');
      replyText = `Based on your current **${roleName}** roadmap and today's actual scheduled tasks, here's what fits in ${hoursNum} hour(s):\n\n${lines}`;
    } else {
      replyText = `You don't have any tasks scheduled yet for today's **${roleName}** roadmap. Generate today's plan first, then I can tell you exactly what fits in ${hoursNum} hour(s).`;
    }

    actions.push({
      type: 'reschedule_task',
      label: `Set today's limit to ${hoursNum}h`,
      payload: { availableHours: hoursNum },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. DAILY_PLAN (Roadmap-dependent)
  // ──────────────────────────────────────────────────────────────────────────
  else if (intent.type === 'DAILY_PLAN') {
    const roleTitle = context.roadmap?.roleTitle || 'your target role';
    const todayTasks = context.todayPlan?.tasks || [];

    if (todayTasks.length > 0) {
      const top = todayTasks[0];
      const totalMinutes = context.todayPlan?.totalPlannedMinutes
        ?? todayTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
      const rest = todayTasks.slice(1, 4).map((t) => `• ${t.title} (~${t.estimatedMinutes} mins)`).join('\n');

      replyText = `Based on your active **${roleTitle}** roadmap and today's actual scheduled tasks, here's your plan for today:\n\n` +
        `• **Top priority**: ${top.title} (~${top.estimatedMinutes} mins)\n` +
        (rest ? `${rest}\n` : '') +
        `• **Total planned time today**: ~${Math.round(totalMinutes)} mins`;

      actions.push({
        type: 'start_assessment',
        label: `Start ${top.title} Assessment`,
        payload: { skillId: top.skillId },
      });
    } else {
      const nextSkill = context.gaps?.gaps?.[0]?.skillTitle || 'your next roadmap step';
      replyText = `You don't have a weekly plan generated yet for your active **${roleTitle}** roadmap, so I can't tell you today's exact tasks. Based on your skill gaps, **${nextSkill}** is next up — generate today's plan to get a concrete task list.`;

      actions.push({
        type: 'start_assessment',
        label: `Start ${nextSkill} Assessment`,
        payload: { skillId: context.gaps?.gaps?.[0]?.skillId || 'javascript' },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. SKILL_GAP (Roadmap-dependent)
  // ──────────────────────────────────────────────────────────────────────────
  else if (intent.type === 'SKILL_GAP') {
    const targetRole = context.roadmap?.roleTitle || 'your target role';
    const gapsList = (context.gaps?.gaps || []).slice(0, 4).map((g) => `${g.skillTitle} (${g.priority} priority)`).join('\n• ');

    replyText = `Here are the top missing skills for your target role (**${targetRole}**):\n\n` +
      (gapsList ? `• ${gapsList}` : 'You have completed all primary core requirements!');

    actions.push({
      type: 'show_gap',
      label: 'View Full Skill Gap Breakdown',
      payload: {},
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. ASSESSMENT / REMEDIATION (Roadmap-dependent)
  // ──────────────────────────────────────────────────────────────────────────
  else if (intent.type === 'ASSESSMENT') {
    const weakList = context.weakAreas.map((w) => w.topic).join(', ') || 'core concepts';

    replyText = `Don't worry! Struggle is a natural part of mastering complex skills. ` +
      `Your recent attempts show specific weak areas in: **${weakList}**.\n\n` +
      `I recommend doing a quick concept review followed by targeted practice tasks before attempting reassessment.`;

    actions.push({
      type: 'create_practice_task',
      label: 'Create Remediation Practice Task',
      payload: { weakTopics: context.weakAreas.map((w) => w.topic) },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. ROADMAP_QUESTION (Roadmap-dependent)
  // ──────────────────────────────────────────────────────────────────────────
  else if (intent.type === 'ROADMAP_QUESTION') {
    const targetRole = context.roadmap?.roleTitle || 'Target Role';

    replyText = `Your active plan is currently set to **${targetRole}**. ` +
      `You are currently ${context.roadmap?.summary?.percentByHours || 0}% ready based on completed nodes and verified skills. ` +
      `If you have already mastered certain topics, you can verify your knowledge via an assessment or Skill Passport to skip ahead!`;

    actions.push({
      type: 'show_gap',
      label: 'View Skill Gaps',
      payload: {},
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. CAREER_QUESTION (Direct Answer + Optional Roadmap Context)
  // ──────────────────────────────────────────────────────────────────────────
  else if (intent.type === 'CAREER_QUESTION') {
    const targetRole = context.roadmap?.roleTitle || 'Mobile App Developer';

    // Try Gemini if available
    replyText = await tryGeminiQuery(message, context, `The user asks a career comparison question: "${message}". Target role is ${targetRole}. Answer the question directly first, then optionally mention relevance to target role at the end.`);

    if (!replyText) {
      if (userMsgLower.includes('python')) {
        replyText = `Python is extremely versatile and widely used in AI/ML, data science, backend web development, and automation scripts. ` +
          `While Python may not be a primary requirement for your current **${targetRole}** roadmap, learning it can be very beneficial if you plan to integrate machine learning features or backend microservices.`;
      } else {
        replyText = `Learning additional technologies expands your versatility as a developer. ` +
          `While it may not be directly required for your current **${targetRole}** roadmap, it adds valuable skills to your engineering toolkit.`;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. TOPIC_LIST, CONCEPT_EXPLANATION, KNOWLEDGE_QUESTION, GENERAL
  // ──────────────────────────────────────────────────────────────────────────
  else {
    // Attempt Gemini LLM first for precise, high-quality answers
    const systemPrompt = `You are the EduPath 2.0 AI Assistant.
User's Question: "${message}"

RULES:
1. Answer the user's explicit question FIRST and directly.
2. User context (Target Role: ${context.roadmap?.roleTitle}) should ONLY be mentioned if it actually helps answer the user's question.
3. DO NOT force every question into the user's active career roadmap.
4. DO NOT start your response with "Based on your Mobile App Developer roadmap..." unless the question is explicitly about their daily plan or roadmap.
5. If asked for topics (e.g. Python basics, React fundamentals), provide a clear structured numbered list of core topics.`;

    replyText = await tryGeminiQuery(message, context, systemPrompt);

    // Fallback if Gemini is not available or fails
    if (!replyText) {
      replyText = await generateDeterministicKnowledgeAnswer(userMsgLower, message, context);
    }
  }

  // Log activity
  await AgentActivity.create({
    userId,
    action: actionLogged,
    reason: `User query (${intent.type}): "${message.substring(0, 80)}"`,
    metadata: { actionsCount: actions.length },
  });

  return {
    reply: replyText,
    actions,
    contextSummary: {
      targetRole: context.roadmap?.roleTitle || 'Developer',
      readinessPercent: context.roadmap?.summary?.percentByHours || 0,
      weakTopicsCount: context.weakAreas.length,
    },
  };
}

/**
 * Gemini LLM Helper
 */
async function tryGeminiQuery(message, context, customPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'obviously-not-a-real-key') {
    return null;
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = customPrompt || `You are the EduPath 2.0 AI Learning Agent.
Learner question: "${message}"
Answer directly, clearly, and accurately.`;

    const res = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    return res?.response?.text() || null;
  } catch {
    return null;
  }
}

/**
 * Deterministic Knowledge Answer Fallback (When Gemini is unavailable)
 */
async function generateDeterministicKnowledgeAnswer(userMsgLower, originalMessage, context) {
  // Topic: Python basics / Python topics
  if (userMsgLower.includes('python')) {
    if (userMsgLower.includes('loop') || userMsgLower.includes('loops')) {
      return `In Python, loops are used to iterate over a sequence (such as a list, tuple, dictionary, set, or string) or execute a block of code repeatedly.\n\n` +
        `1. **for Loop**: Used for iterating over a sequence.\n` +
        `\`\`\`python\nfor i in range(5):\n    print(i)\n\`\`\`\n\n` +
        `2. **while Loop**: Executes statements as long as a condition is True.\n` +
        `\`\`\`python\ncount = 0\nwhile count < 5:\n    print(count)\n    count += 1\n\`\`\`\n\n` +
        `3. **Loop Controls**: \`break\` (exits loop), \`continue\` (skips iteration), and \`else\` clause in loops.`;
    }

    if (userMsgLower.includes('function') || userMsgLower.includes('functions')) {
      return `Functions in Python are defined using the \`def\` keyword.\n\n` +
        `\`\`\`python\ndef greet(name):\n    return f"Hello, {name}!"\n\`\`\`\n\n` +
        `Key concepts include:\n` +
        `• Parameters & Return values\n` +
        `• Default arguments (\`def add(a, b=10)\`)\n` +
        `• Keyword arguments & \`*args\` / \`**kwargs\`\n` +
        `• Scope (Local vs Global) & Lambda functions.`;
    }

    return `Python basics usually include:\n\n` +
      `1. Python syntax and indentation\n` +
      `2. Variables and data types (int, float, str, bool)\n` +
      `3. Input and output (\`print()\`, \`input()\`)\n` +
      `4. Operators (arithmetic, logical, comparison)\n` +
      `5. Conditional statements (\`if\`, \`elif\`, \`else\`)\n` +
      `6. Loops (\`for\`, \`while\`)\n` +
      `7. Functions (\`def\`, parameters, return values)\n` +
      `8. Strings and string methods\n` +
      `9. Data structures (Lists, Tuples, Sets, Dictionaries)\n` +
      `10. Exception handling (\`try\`, \`except\`, \`finally\`)\n` +
      `11. File handling (\`open()\`, \`read()\`, \`write()\`)\n` +
      `12. Modules and packages (\`import\`)\n` +
      `13. Basic OOP concepts (Classes, Objects, Methods)\n\n` +
      `For a beginner, start with syntax → variables → conditions → loops → functions → collection types.`;
  }

  // Topic: JavaScript fundamentals
  if (userMsgLower.includes('javascript') || userMsgLower.includes('js')) {
    return `JavaScript fundamentals include:\n\n` +
      `1. Variables & Data Types (\`let\`, \`const\`, primitives & objects)\n` +
      `2. Operators & Expressions\n` +
      `3. Control Flow (\`if/else\`, \`switch\`, loops)\n` +
      `4. Functions (Declarations, Expressions, Arrow functions)\n` +
      `5. Arrays & Array Methods (\`map\`, \`filter\`, \`reduce\`)\n` +
      `6. Objects & Prototypal Inheritance\n` +
      `7. DOM Manipulation & Event Handling\n` +
      `8. Asynchronous JS (Promises, \`async/await\`, Fetch API)\n` +
      `9. ES6+ Features (Destructuring, Spread/Rest, Modules)\n` +
      `10. Error Handling (\`try...catch\`).`;
  }

  // Topic: React
  if (userMsgLower.includes('react')) {
    return `React fundamentals include:\n\n` +
      `1. JSX Syntax & Rendering\n` +
      `2. Components (Functional components)\n` +
      `3. Props & Component Reusability\n` +
      `4. State Management with \`useState\`\n` +
      `5. Side Effects with \`useEffect\`\n` +
      `6. Event Handling in React\n` +
      `7. Conditional Rendering & Lists (\`key\` prop)\n` +
      `8. Forms & Controlled Components\n` +
      `9. Context API / Global State\n` +
      `10. React Router & Component Lifecycle.`;
  }

  // Topic: SQL / Database
  if (userMsgLower.includes('sql') || userMsgLower.includes('database')) {
    return `Core SQL topics include:\n\n` +
      `1. Database & Table creation (\`CREATE TABLE\`)\n` +
      `2. Data Manipulation (\`SELECT\`, \`INSERT\`, \`UPDATE\`, \`DELETE\`)\n` +
      `3. Filtering & Sorting (\`WHERE\`, \`ORDER BY\`, \`LIKE\`)\n` +
      `4. Aggregation (\`GROUP BY\`, \`HAVING\`, \`COUNT\`, \`SUM\`, \`AVG\`)\n` +
      `5. Joins (\`INNER JOIN\`, \`LEFT JOIN\`, \`RIGHT JOIN\`, \`FULL JOIN\`)\n` +
      `6. Subqueries & Nested queries\n` +
      `7. Indexes & Performance optimization\n` +
      `8. Database Normalization & Foreign Keys.`;
  }

  // Try querying database CareerNode catalog for matches
  try {
    const terms = userMsgLower.split(/\s+/).filter((w) => w.length > 2);
    if (terms.length > 0) {
      const matchedNode = await CareerNode.findOne({
        $or: [
          { key: { $in: terms } },
          { aliases: { $in: terms } },
          { title: new RegExp(terms.join('|'), 'i') },
        ],
      }).lean();

      if (matchedNode) {
        let text = `**${matchedNode.title}** (${matchedNode.domain} domain, ${matchedNode.difficulty} level)\n\n`;
        if (matchedNode.description) text += `${matchedNode.description}\n\n`;
        if (matchedNode.checkpoints?.length > 0) {
          text += `**Key Checkpoints & Topics:**\n` + matchedNode.checkpoints.map((c) => `• ${c}`).join('\n');
        }
        return text;
      }
    }
  } catch {
    // Ignore db query errors
  }

  // General Direct Answer Fallback
  return `Regarding "${originalMessage}": Here is a general breakdown of key concepts:\n\n` +
    `1. Start with fundamental syntax and data representations.\n` +
    `2. Practice core control structures and logical branching.\n` +
    `3. Build modular functions and test small components.\n` +
    `4. Apply concepts through hands-on exercises and project work.`;
}

