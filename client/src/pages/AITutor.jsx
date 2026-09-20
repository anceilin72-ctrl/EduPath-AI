import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow, Loading } from '../components/ui.jsx';

const PRESET_TUTOR_PROMPTS = [
  'Teach me Python functions',
  'Explain Docker containers with a real-world analogy',
  'How do async/await promises work in JavaScript?',
  'Give me a practice challenge on SQL Joins',
  'What are common mistakes in CSS Grid vs Flexbox?',
];

export default function AITutor() {
  const [context, setContext] = useState(null);
  const [messages, setMessages] = useState([
    {
      sender: 'tutor',
      text: 'Hello! I am your **Context-Aware AI Tutor** 🎓.\n\nMy role is to teach you the concepts and skills you need, step-by-step with real-world analogies, code walkthroughs, interactive practice questions, and mini quizzes.\n\nWhat would you like to learn today? (e.g. *"Teach me Python functions"* or ask about your current roadmap topic!)',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api.tutor
      .context()
      .then((res) => setContext(res.context))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend(textToSend) {
    const prompt = textToSend || input;
    if (!prompt.trim() || sending) return;

    const userMsg = {
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await api.tutor.chat({
        message: prompt,
        history: messages.map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
      });

      const tutorMsg = {
        sender: 'tutor',
        text: res.reply,
        topic: res.topic,
        lessonData: res.lessonData,
        source: res.source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, tutorMsg]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-effort-soft border border-effort flex items-center justify-center text-effort shadow-sm">
            <GraduationCap size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Context-Aware AI Tutor</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded border bg-effort-soft text-effort border-effort font-medium">
                EduPath 2.0
              </span>
            </div>
            <p className="text-xs text-ink-soft mt-0.5">
              Instructional tutor: 9-part pedagogical flow with analogies, step-by-step examples, and practice questions.
            </p>
          </div>
        </div>

        <Link to="/ai-agent" className="btn-quiet text-xs flex items-center gap-1.5">
          <Bot size={14} className="text-ink-soft" />
          AI Learning Agent
        </Link>
      </header>

      {/* Learning Context Chips */}
      {context && (
        <section className="card p-3.5 bg-panel border-rule/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow text-effort">Tutor Context:</span>
            <span className="font-mono px-2 py-0.5 rounded border bg-card text-ink">
              Topic: <strong className="text-effort">{context.currentRoadmapTopic}</strong>
            </span>
            <span className="font-mono px-2 py-0.5 rounded border bg-card text-ink capitalize">
              Level: <strong>{context.userLevel}</strong>
            </span>
            {context.assessmentWeaknesses?.length > 0 && (
              <span className="font-mono px-2 py-0.5 rounded border bg-warn-soft border-warn text-warn">
                Focus Areas: {context.assessmentWeaknesses.slice(0, 2).join(', ')}
              </span>
            )}
          </div>
          {context.todayTask && (
            <button
              type="button"
              onClick={() => handleSend(`Teach me ${context.todayTask.title}`)}
              className="text-xs font-medium text-effort hover:underline flex items-center gap-1"
            >
              <span>Teach Today's Task ({context.todayTask.title})</span>
              <ArrowRight size={12} />
            </button>
          )}
        </section>
      )}

      {/* Preset Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {PRESET_TUTOR_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleSend(prompt)}
            disabled={sending}
            className="text-xs font-medium py-1 px-3 rounded-full border border-rule bg-card hover:bg-panel text-ink-soft hover:text-ink transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Conversation Thread */}
      <div className="card p-5 min-h-[460px] max-h-[620px] overflow-y-auto space-y-4 bg-gradient-to-b from-card to-panel border-rule">
        {messages.map((msg, idx) => {
          const isUser = msg.sender === 'user';

          return (
            <div
              key={idx}
              className={`flex gap-3 text-sm ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-effort text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <GraduationCap size={16} />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl p-4 space-y-3 ${
                  isUser
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-card border border-rule/80 text-ink shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[11px] opacity-70 pb-1 border-b border-white/10">
                  <span className="font-semibold">{isUser ? 'You' : 'EduPath AI Tutor'}</span>
                  <span className="font-mono">{msg.timestamp}</span>
                </div>

                <div className="space-y-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.text}
                </div>

                {msg.source && (
                  <div className="pt-2 border-t border-rule/40 text-[10px] font-mono text-ink-faint flex items-center justify-between">
                    <span>Pedagogical Engine ({msg.source})</span>
                    <span>No roadmap modification</span>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-full bg-panel border border-rule flex items-center justify-center shrink-0 mt-0.5 text-ink">
                  <User size={15} />
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-effort text-white flex items-center justify-center shrink-0 animate-pulse">
              <GraduationCap size={16} />
            </div>
            <div className="card p-3.5 bg-card border-rule text-xs text-ink-soft flex items-center gap-2">
              <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-effort border-t-transparent rounded-full" />
              <span>Structuring 9-step lesson with practice questions...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      {/* Input Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask tutor: e.g. 'Teach me Python functions' or type your answer to the practice question..."
          disabled={sending}
          className="input flex-1 text-sm py-2.5"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="btn-primary shrink-0 flex items-center gap-1.5 py-2.5 px-4"
        >
          <span>Send</span>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
