/**
 * aiTutorService.js — EduPath 2.0 Context-Aware AI Tutor.
 *
 * Distinct from the Career Agent ("What should I learn?").
 * Focuses on pedagogical instruction ("Teach me what I am learning.").
 *
 * 9-Step Pedagogical Teaching Flow:
 *  1. Simple Explanation
 *  2. Real-World Analogy
 *  3. Syntax / Concept
 *  4. Example
 *  5. Step-by-Step Explanation
 *  6. Practice Question (prompts student to answer)
 *  7. Mini Quiz
 *  8. Common Mistakes
 *  9. Short Recap
 *
 * CRITICAL RULE: Tutoring is purely educational and MUST NOT mutate:
 *  - Target Role
 *  - Active Roadmap
 *  - Skill Scores
 *  - Progress
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Roadmap from '../models/Roadmap.js';
import Progress from '../models/Progress.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import WeeklyPlan from '../models/WeeklyPlan.js';
import CareerNode from '../models/CareerNode.js';

/**
 * Extract topic name from user message (e.g. "Teach me Python functions" -> "Python functions")
 */
export function extractTutoringTopic(message = '') {
  const text = String(message).trim();
  const lower = text.toLowerCase();

  const patterns = [
    /^(?:teach me|explain|how do (?:i|we) use|what is|what are|help me understand|learn)\s+about\s+(.+)$/i,
    /^(?:teach me|explain|how do (?:i|we) use|what is|what are|help me understand|learn)\s+(.+)$/i,
    /^(.+)\s+(?:tutorial|lesson|guide|practice)$/i,
  ];

  const topicPrefixes = /^(?:how\s+to\s+use|how\s+to)\s+/i;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/[.?!\s]+$/, '').replace(topicPrefixes, '').trim();
    }
  }

  return text;
}

/**
 * Gather real-time learning context for the tutor.
 */
export async function getTutorContext(userId) {
  if (!userId) {
    return {
      currentRoadmapTopic: 'Programming Fundamentals',
      skill: 'general',
      userLevel: 'beginner',
      completedLessons: [],
      assessmentWeaknesses: [],
      todayTask: null,
    };
  }

  const [roadmap, allProgress, attempts, weeklyPlan] = await Promise.all([
    Roadmap.findOne({ userId, isArchived: false }).sort({ createdAt: -1 }).lean(),
    Progress.find({ userId }).lean(),
    AssessmentAttempt.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    WeeklyPlan.findOne({ userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const completedKeys = allProgress.filter((p) => p.status === 'completed').map((p) => p.nodeKey);
  const weakTopics = [...new Set(attempts.flatMap((a) => a.weakTopics || []))];

  // Find next uncompleted node in roadmap
  let currentTopic = 'Programming Fundamentals';
  let skillKey = 'general';
  let userLevel = 'beginner';

  if (roadmap) {
    for (const phase of roadmap.phases || []) {
      for (const node of phase.nodes || []) {
        if (!completedKeys.includes(node.nodeKey)) {
          currentTopic = node.title || node.nodeKey;
          skillKey = node.nodeKey;
          userLevel = node.difficulty || 'beginner';
          break;
        }
      }
      if (skillKey !== 'general') break;
    }
  }

  // Check today task
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayDay = weeklyPlan?.days?.find((d) => d.dayName === todayName);
  const todayTask = todayDay?.tasks?.find((t) => t.completion === 'pending') || null;

  return {
    currentRoadmapTopic: currentTopic,
    skill: skillKey,
    userLevel,
    completedLessons: completedKeys,
    assessmentWeaknesses: weakTopics,
    todayTask: todayTask ? { title: todayTask.title, estimatedMinutes: todayTask.estimatedMinutes } : null,
  };
}

/**
 * Deterministic fallback generator implementing the 9-part pedagogical teaching flow.
 */
export function generateDeterministicLesson({ topic, userLevel = 'beginner', context = {} }) {
  const cleanTopic = topic || 'Functions in Python';
  const levelText = userLevel.charAt(0).toUpperCase() + userLevel.slice(1);

  // Topic-specific customizations
  const isPythonFunctions = cleanTopic.toLowerCase().includes('python') && cleanTopic.toLowerCase().includes('function');

  if (isPythonFunctions) {
    return {
      topic: 'Python Functions',
      userLevel,
      flowSteps: [
        {
          step: 1,
          title: '1. Simple Explanation',
          content: 'A **Python function** is a reusable block of code designed to perform a specific task. Instead of writing the same logic repeatedly, you package it into a function and call it whenever you need it.',
        },
        {
          step: 2,
          title: '2. Real-World Analogy',
          content: 'Think of a function like a **kitchen blender** 🍹. You put ingredients in (inputs/arguments), press a button (execute the function), and it gives you a fresh smoothie back (return value). You don\'t rebuild the blender every time you want a drink!',
        },
        {
          step: 3,
          title: '3. Syntax & Structure',
          content: 'In Python, functions are defined using the `def` keyword followed by the function name, parentheses `()`, and a colon `:`.\n\n```python\ndef function_name(parameter1, parameter2):\n    # Code block indented\n    result = parameter1 + parameter2\n    return result\n```',
        },
        {
          step: 4,
          title: '4. Concrete Example',
          content: 'Here is a function that calculates total cost with tax:\n\n```python\ndef calculate_total(price, tax_rate=0.05):\n    tax = price * tax_rate\n    return price + tax\n\n# Calling the function\nfinal_amount = calculate_total(100)\nprint(f"Total: ${final_amount}") # Output: Total: $105.0\n```',
        },
        {
          step: 5,
          title: '5. Step-by-Step Breakdown',
          content: '1. `def calculate_total(...)` defines the function and parameters.\n2. `tax_rate=0.05` sets a default argument if none is provided.\n3. `return price + tax` sends the computed value back to the caller.\n4. Calling `calculate_total(100)` assigns `final_amount = 105.0`.',
        },
        {
          step: 6,
          title: '6. Practice Question for You 💻',
          content: '**Your Turn:** Write a Python function called `greet_user(name)` that takes a person\'s name as an argument and returns `"Welcome to EduPath, " + name + "!"`.\n\n*What would your function definition look like? Reply with your code!*',
        },
        {
          step: 7,
          title: '7. Mini Quiz 🧪',
          content: '**Quick Check:** What happens if a Python function does not have a `return` statement?\n- A) It causes a SyntaxError\n- B) It returns `None` by default\n- C) It loops infinitely\n\n*(Answer in chat to check your understanding!)*',
        },
        {
          step: 8,
          title: '8. Common Mistakes to Avoid ⚠️',
          content: '- **Forgetting Indentation**: Python requires 4-space indentation for function bodies.\n- **Missing `return`**: Using `print()` inside a function does not return a value for later use.\n- **Modifying Global Variables accidentally**: Variables created inside a function are local in scope.',
        },
        {
          step: 9,
          title: '9. Short Recap 📝',
          content: '- Define with `def name(params):`\n- Pass data in via arguments\n- Send results back with `return`\n- Functions make code modular, testable, and reusable.',
        },
      ],
      interactivePrompt: 'Try answering the practice question (Step 6) or mini quiz (Step 7) below! How would you write `greet_user(name)`?',
    };
  }

  // General 9-part template for any topic
  return {
    topic: cleanTopic,
    userLevel,
    flowSteps: [
      {
        step: 1,
        title: '1. Simple Explanation',
        content: `**${cleanTopic}** is a core ${levelText}-level concept. It provides a structured approach to solving problems efficiently and writing maintainable code.`,
      },
      {
        step: 2,
        title: '2. Real-World Analogy',
        content: `Think of **${cleanTopic}** like a well-organized toolbox 🧰. Each component has a designated purpose, ensuring you do not have to reinvent the tool every time you encounter a problem.`,
      },
      {
        step: 3,
        title: '3. Core Concepts & Syntax',
        content: `When working with **${cleanTopic}**, focus on fundamental principles, clean naming conventions, and standard architectural patterns.`,
      },
      {
        step: 4,
        title: '4. Example Walkthrough',
        content: `Here is a standard pattern for **${cleanTopic}**:\n\n\`\`\`javascript\n// Applying ${cleanTopic}\nfunction executeConcept(input) {\n  if (!input) return null;\n  return { success: true, data: input };\n}\n\`\`\``,
      },
      {
        step: 5,
        title: '5. Step-by-Step Breakdown',
        content: '1. Identify the input and requirements.\n2. Apply the core pattern step-by-step.\n3. Validate boundary conditions and return clean output.',
      },
      {
        step: 6,
        title: '6. Practice Question for You 💻',
        content: `**Your Turn:** How would you apply **${cleanTopic}** to handle an edge case where the input is empty or invalid? Try writing a brief explanation or code snippet!`,
      },
      {
        step: 7,
        title: '7. Mini Quiz 🧪',
        content: `**Quick Check:** Why is it recommended to follow standard best practices when implementing **${cleanTopic}**?\n- A) To increase code complexity\n- B) To ensure maintainability, readability, and performance\n- C) It is required by the compiler`,
      },
      {
        step: 8,
        title: '8. Common Mistakes to Avoid ⚠️',
        content: '- Over-complicating simple use-cases\n- Ignoring edge cases or error handling\n- Not testing with realistic input data',
      },
      {
        step: 9,
        title: '9. Short Recap 📝',
        content: `- Understand the core purpose of ${cleanTopic}\n- Keep implementations clean and modular\n- Practice with real-world mini challenges`,
      },
    ],
    interactivePrompt: `How would you explain the main benefit of ${cleanTopic} in your own words?`,
  };
}

/**
 * Generate an interactive tutor response using Gemini AI (with deterministic fallback).
 */
export async function teachTopic({ userId, message, topic, history = [] }) {
  const context = await getTutorContext(userId);
  const targetTopic = topic || extractTutoringTopic(message);

  // If Gemini API is configured, generate dynamic lesson matching the 9-part pedagogical flow
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are the EduPath 2.0 AI Tutor.
Your role is: "Teach me what I am learning." (Instructional Tutor, NOT Career Agent).

Target Topic to teach: "${targetTopic}"
Student Level: ${context.userLevel}
Weak Areas from past assessments (if relevant): ${context.assessmentWeaknesses.join(', ') || 'None'}

You MUST structure your response following this exact 9-part pedagogical teaching flow:
1. **Simple Explanation** (clear, friendly, level-appropriate)
2. **Real-World Analogy** (intuitive everyday metaphor)
3. **Syntax / Concept** (formal definition / structure)
4. **Example** (clean code or concrete practical example)
5. **Step-by-Step Explanation** (walk through the example)
6. **Practice Question** (ask the student to solve a small challenge or write code)
7. **Mini Quiz** (1 multiple choice question to test understanding)
8. **Common Mistakes** (2-3 common pitfalls to watch out for)
9. **Short Recap** (bullet point takeaway)

IMPORTANT:
- Keep explanations interactive. Encourage the student to respond to the practice question or quiz.
- DO NOT change the student's roadmap, target role, or progress.
- Teach "${targetTopic}" even if the student's active roadmap is different.

Student's input: "${message}"`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return {
        topic: targetTopic,
        reply: text,
        context,
        source: 'ai-tutor',
      };
    } catch (err) {
      console.warn('AI Tutor fallback triggered due to error:', err.message);
    }
  }

  // Deterministic rule-based 9-part lesson
  const lesson = generateDeterministicLesson({
    topic: targetTopic,
    userLevel: context.userLevel,
    context,
  });

  const formattedText = lesson.flowSteps
    .map((s) => `### ${s.title}\n\n${s.content}`)
    .join('\n\n') +
    `\n\n---\n💬 **Tutor:** ${lesson.interactivePrompt}`;

  return {
    topic: lesson.topic,
    reply: formattedText,
    lessonData: lesson,
    context,
    source: 'deterministic-tutor',
  };
}
