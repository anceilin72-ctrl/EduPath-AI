import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Send,
  User,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow, Loading } from '../components/ui.jsx';

const PRESET_PROMPTS = {
  TECHNICAL: ['Start a technical interview', 'Ask me about backend concepts', 'Let\'s review database design'],
  ROLE_SPECIFIC: ['Mock interview for my target role', 'What do they ask for this role?'],
  PROJECT: ['Ask me about my projects', 'Let\'s discuss my latest project', 'Project architecture review'],
  RAPID_FIRE: ['Rapid-fire round', 'Quick concept check'],
  MOCK: ['Full mock interview', 'Simulate a real interview'],
  HR: ['Ask behavioral questions', 'HR screening mock', 'Let\'s practice soft skills'],
};

export default function InterviewCoach() {
  const [context, setContext] = useState(null);
  const [modes, setModes] = useState([]);
  const [activeMode, setActiveMode] = useState('TECHNICAL');
  
  const [messages, setMessages] = useState([
    {
      sender: 'coach',
      text: 'Welcome! I am your **AI Interview Coach** 💼.\n\nMy goal is to help you prepare for interviews. I will ask you questions based on your target role, projects, and skills. Then I will evaluate your answers to help you improve.\n\nSelect an interview mode above and let me know when you are ready to begin!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api.interview.context().then((res) => setContext(res.context)).catch(() => {});
    api.interview.modes().then((res) => setModes(res.modes)).catch(() => {});
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
      const res = await api.interview.chat({
        message: prompt,
        mode: activeMode,
        history: messages.map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      });

      const coachMsg = {
        sender: 'coach',
        text: res.reply,
        mode: res.mode,
        source: res.source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (res.mode !== activeMode) {
        setActiveMode(res.mode);
      }

      setMessages((prev) => [...prev, coachMsg]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }
  
  // Custom markdown parser for rendering the 6-part feedback nicely
  const renderFeedback = (text) => {
    // If it doesn't look like our structural feedback, just render as text (could be just the next question)
    if (!text.includes('**What you did well:**')) {
      return <div className="space-y-3 whitespace-pre-wrap leading-relaxed">{text}</div>;
    }
    
    // Split on standard headers
    const parts = text.split(/(?=\*\*(?:What you did well:|Missing concepts:|Technical accuracy:|Clarity:|Suggested improvement:|Example improved answer:|Next Question:)\*\*)/g);
    
    return (
      <div className="space-y-4">
        {parts.map((part, i) => {
          if (!part.trim()) return null;
          
          if (part.startsWith('**What you did well:**')) {
            return (
              <div key={i} className="bg-effort/10 border border-effort/20 rounded-md p-3">
                <span className="font-semibold text-effort text-xs block mb-1">STRENGTHS</span>
                <div className="text-sm">{part.replace('**What you did well:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Missing concepts:**')) {
            return (
              <div key={i} className="bg-warn/10 border border-warn/20 rounded-md p-3">
                <span className="font-semibold text-warn text-xs block mb-1">GAPS</span>
                <div className="text-sm">{part.replace('**Missing concepts:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Technical accuracy:**')) {
            return (
              <div key={i} className="border border-rule rounded-md p-3">
                <span className="font-semibold text-ink-soft text-xs block mb-1">ACCURACY</span>
                <div className="text-sm">{part.replace('**Technical accuracy:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Clarity:**')) {
            return (
              <div key={i} className="border border-rule rounded-md p-3">
                <span className="font-semibold text-ink-soft text-xs block mb-1">CLARITY</span>
                <div className="text-sm">{part.replace('**Clarity:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Suggested improvement:**')) {
             return (
              <div key={i} className="bg-done/10 border border-done/20 rounded-md p-3">
                <span className="font-semibold text-done text-xs block mb-1">IMPROVEMENT</span>
                <div className="text-sm">{part.replace('**Suggested improvement:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Example improved answer:**')) {
             return (
              <div key={i} className="bg-panel border border-rule rounded-md p-3 italic">
                <span className="font-semibold text-ink text-xs block mb-1 not-italic">EXAMPLE ANSWER</span>
                <div className="text-sm">{part.replace('**Example improved answer:**', '').trim()}</div>
              </div>
            );
          }
          if (part.startsWith('**Next Question:**')) {
             return (
              <div key={i} className="pt-2 border-t border-rule mt-2">
                <span className="font-semibold text-ink text-xs block mb-1">NEXT QUESTION</span>
                <div className="text-base font-medium">{part.replace('**Next Question:**', '').trim()}</div>
              </div>
            );
          }
          
          return <div key={i} className="whitespace-pre-wrap">{part}</div>;
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-effort-soft border border-effort flex items-center justify-center text-effort shadow-sm">
            <Briefcase size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">AI Interview Coach</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded border bg-effort-soft text-effort border-effort font-medium">
                EduPath 2.0
              </span>
            </div>
            <p className="text-xs text-ink-soft mt-0.5">
              Practice answering questions based on your projects, skills, and target role.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
           <Link to="/ai-tutor" className="btn-quiet text-xs flex items-center gap-1.5">
             <GraduationCap size={14} className="text-ink-soft" />
             AI Tutor
           </Link>
           <Link to="/ai-agent" className="btn-quiet text-xs flex items-center gap-1.5">
             <Bot size={14} className="text-ink-soft" />
             AI Learning Agent
           </Link>
        </div>
      </header>

      {/* Context & Modes */}
      {context && (
        <section className="card p-4 bg-panel border-rule/70 space-y-4">
           <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="eyebrow text-effort">Coach Context:</span>
            <span className="font-mono px-2 py-0.5 rounded border bg-card text-ink">
              Role: <strong className="text-effort">{context.targetRole}</strong>
            </span>
            <span className="font-mono px-2 py-0.5 rounded border bg-card text-ink">
              Projects: <strong>{context.projects?.length || 0}</strong>
            </span>
            <span className="font-mono px-2 py-0.5 rounded border bg-card text-ink">
              Skills: <strong>{context.skills?.length || 0}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold mr-2 text-ink-soft">Mode:</span>
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveMode(mode.id)}
                className={`text-xs font-medium py-1.5 px-3 rounded-full border transition-colors ${
                  activeMode === mode.id
                    ? 'bg-effort text-white border-effort'
                    : 'bg-card border-rule text-ink hover:bg-effort-soft hover:text-effort'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Preset Prompts */}
      <div className="flex flex-wrap gap-2">
        {(PRESET_PROMPTS[activeMode] || PRESET_PROMPTS['TECHNICAL']).map((prompt) => (
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

      {/* Chat Thread */}
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
                  <Briefcase size={16} />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl p-4 space-y-3 ${
                  isUser
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-card border border-rule/80 text-ink shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[11px] opacity-70 pb-1 border-b border-rule/30">
                  <span className="font-semibold">{isUser ? 'You' : 'EduPath Interview Coach'}</span>
                  <span className="font-mono">{msg.timestamp}</span>
                </div>

                <div className="text-xs sm:text-sm font-sans">
                  {isUser ? <div className="whitespace-pre-wrap">{msg.text}</div> : renderFeedback(msg.text)}
                </div>

                {msg.source && (
                  <div className="pt-2 border-t border-rule/40 text-[10px] font-mono text-ink-faint flex items-center justify-between">
                    <span>Engine ({msg.source})</span>
                    <span>No proficiency scoring</span>
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
              <Briefcase size={16} />
            </div>
            <div className="card p-3.5 bg-card border-rule text-xs text-ink-soft flex items-center gap-2">
              <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-effort border-t-transparent rounded-full" />
              <span>Analyzing answer and structuring feedback...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      {/* Input */}
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
          placeholder={`Type your answer or ask to start a ${activeMode.toLowerCase().replace('_', ' ')} interview...`}
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
