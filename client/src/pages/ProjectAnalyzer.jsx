import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Code2, FolderPlus, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow, Loading } from '../components/ui.jsx';

/**
 * ProjectAnalyzer — /project-analyzer
 *
 * Enter project details, extract matching catalog skills, confirm, and save
 * as PROJECT evidence in Skill Passport.
 */

export default function ProjectAnalyzer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '', technologies: '', role: '' });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [error, setError] = useState(null);

  async function handleAnalyze(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.reports.analyzeProject(form);
      setDetected(res.detected || []);
      setSelectedKeys((res.detected || []).map((d) => d.skillId));
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleSkill(skillId) {
    setSelectedKeys((prev) =>
      prev.includes(skillId) ? prev.filter((k) => k !== skillId) : [...prev, skillId]
    );
  }

  async function handleConfirm() {
    if (selectedKeys.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const itemsToSave = (detected || [])
        .filter((d) => selectedKeys.includes(d.skillId))
        .map((d) => ({ skillId: d.skillId, evidenceText: d.evidenceText }));

      await api.reports.confirmProject({
        projectName: form.name,
        detectedNodeKeys: selectedKeys,
        items: itemsToSave,
      });
      navigate('/skill-passport');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <header>
        <div className="flex items-center gap-2">
          <Code2 size={24} className="text-effort shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">AI Project Evidence Analyzer</h1>
        </div>
        <p className="text-sm text-ink-soft mt-1">
          Extract skills, frameworks, and architecture evidence from your real-world projects.
        </p>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      <form onSubmit={handleAnalyze} className="card p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Project Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. AI Audio Vishing Detector"
            className="input w-full text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Tech Stack</label>
          <input
            type="text"
            value={form.technologies}
            onChange={(e) => setForm({ ...form, technologies: e.target.value })}
            placeholder="e.g. Python, PyTorch, CNN-LSTM, FastAPI, React"
            className="input w-full text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Description & Architecture</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Built a real-time deep learning system that detects synthetic voice anomalies..."
            className="w-full p-3 rounded-md border border-rule bg-paper text-sm h-24 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Your Role / Contributions</label>
          <input
            type="text"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="e.g. Designed model architecture, implemented API endpoints"
            className="input w-full text-sm"
          />
        </div>

        <button type="submit" disabled={analyzing || !form.name.trim()} className="btn-accent w-full py-2.5">
          {analyzing ? 'Analyzing Project...' : 'Analyze Project with AI'}
        </button>
      </form>

      {/* Detected Skills Selection */}
      {detected && (
        <section className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div>
              <Eyebrow>Detected Project Evidence ({detected.length})</Eyebrow>
              <h3 className="font-semibold text-base mt-0.5">Select and review skills to add to Skill Passport</h3>
            </div>
            <Sparkles size={18} className="text-done" />
          </div>

          {detected.length === 0 ? (
            <p className="text-xs text-ink-faint italic py-2">No matching catalog skills detected. Try adding more specific tech terms above.</p>
          ) : (
            <div className="space-y-3">
              {detected.map((item) => {
                const checked = selectedKeys.includes(item.skillId);
                return (
                  <div
                    key={item.skillId}
                    className={`p-3.5 rounded-lg border text-xs transition-colors space-y-2 ${
                      checked ? 'bg-done-soft border-done' : 'bg-panel border-rule text-ink'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSkill(item.skillId)}
                        />
                        <span className="font-semibold text-sm text-ink">{item.skillTitle}</span>
                      </label>
                      <Badge tone={item.confidence === 'High' ? 'done' : 'effort'}>{item.confidence} Confidence</Badge>
                    </div>

                    {checked && (
                      <div className="pt-1 pl-7">
                        <label className="block text-[11px] font-medium text-ink-soft mb-1">
                          Evidence Quote / Snippet:
                        </label>
                        <input
                          type="text"
                          value={item.evidenceText || ''}
                          onChange={(e) => {
                            const newText = e.target.value;
                            setDetected((prev) =>
                              prev.map((d) => (d.skillId === item.skillId ? { ...d, evidenceText: newText } : d))
                            );
                          }}
                          className="input w-full text-xs font-mono py-1.5 bg-paper"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || selectedKeys.length === 0}
              className="btn-accent"
            >
              <Check size={14} aria-hidden="true" />
              Confirm & Save to Passport ({selectedKeys.length})
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
