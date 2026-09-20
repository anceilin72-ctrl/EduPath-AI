import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Clock,
  History,
  Send,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow, Loading } from '../components/ui.jsx';

/**
 * AIAgentChat — /ai-agent
 *
 * Natural Language AI Learning Agent grounded in database context.
 * Features quick prompt chips, real-time context stats, interactive action buttons,
 * and conversational streaming/history.
 */

const PRESET_PROMPTS = [
  'What should I learn today?',
  'I only have 1 hour today.',
  'Why am I learning PyTorch?',
  'What skills am I missing?',
  'I failed my ML assessment.',
  'What project should I build?',
];

export default function AIAgentChat() {
  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: 'Hello! I am your EduPath 2.0 AI Learning Agent. I have full context of your target role, Skill Passport, active roadmap, and assessment history. How can I help your learning journey today?',
      actions: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);

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
      const res = await api.agent.chat({ message: prompt });
      const agentMsg = {
        sender: 'agent',
        text: res.reply,
        actions: res.actions || [],
        contextSummary: res.contextSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, agentMsg]);
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
          <Bot size={26} className="text-effort shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">EduPath AI Learning Agent</h1>
            <p className="text-xs text-ink-soft mt-0.5">
              Grounded in your real roadmap, skill passport evidence, and assessment history.
            </p>
          </div>
        </div>

        <Link to="/agent-activity" className="btn-quiet text-xs">
          <History size={14} aria-hidden="true" />
          Agent Activity Timeline
        </Link>
      </header>

      {/* Preset Prompt Chips */}
      <section className="flex flex-wrap gap-2">
        {PRESET_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleSend(prompt)}
            disabled={sending}
            className="text-xs px-3 py-1.5 rounded-full border border-rule bg-paper hover:bg-panel hover:border-effort/40 text-ink-soft transition-all"
          >
            {prompt}
          </button>
        ))}
      </section>

      {error && <Callout tone="error">{error}</Callout>}

      {/* Chat Messages Container */}
      <div className="card p-4 sm:p-6 min-h-[420px] max-h-[550px] overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'agent' && (
              <div className="w-8 h-8 rounded-full bg-effort-soft border border-effort flex items-center justify-center shrink-0">
                <Bot size={16} className="text-effort" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-xl p-4 text-sm space-y-3 ${
                msg.sender === 'user'
                  ? 'bg-effort text-paper rounded-tr-none'
                  : 'bg-panel border border-rule text-ink rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

              {/* Render Grounded Action Buttons */}
              {msg.actions?.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-2 border-t border-rule/40">
                  {msg.actions.map((act, i) => (
                    <Link
                      key={i}
                      to={
                        act.type === 'start_assessment'
                          ? `/assessments`
                          : act.type === 'show_gap'
                          ? `/skill-gaps`
                          : `/weekly-planner`
                      }
                      className="btn-accent text-xs py-1 px-3 inline-flex items-center gap-1.5"
                    >
                      <Zap size={12} aria-hidden="true" />
                      {act.label}
                    </Link>
                  ))}
                </div>
              )}

              <span className={`block text-[10px] font-mono text-right ${msg.sender === 'user' ? 'text-paper/80' : 'text-ink-faint'}`}>
                {msg.timestamp}
              </span>
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-full bg-panel border border-rule flex items-center justify-center shrink-0">
                <User size={16} className="text-ink-soft" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-ink-faint italic p-2">
            <Bot size={14} className="animate-spin text-effort" />
            Analyzing grounded context...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything: 'What should I do today?', 'Why Python?', 'I have 1 hour'..."
          className="input flex-1 py-3 text-sm"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()} className="btn-accent py-3 px-5">
          <Send size={16} aria-hidden="true" />
          Ask AI
        </button>
      </form>
    </div>
  );
}
