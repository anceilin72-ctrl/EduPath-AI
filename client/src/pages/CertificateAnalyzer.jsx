import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Check, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow } from '../components/ui.jsx';

/**
 * CertificateAnalyzer — /certificate-analyzer
 *
 * Upload or type certificate credentials, map topics to catalog skills,
 * and store as CERTIFICATE evidence (treated as evidence, not 100% proof of mastery).
 */

export default function CertificateAnalyzer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    provider: '',
    credentialType: 'Course Certificate',
    credentialId: '',
    date: '',
    topicsText: '',
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [error, setError] = useState(null);

  async function handleAnalyze(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.reports.analyzeCertificate(form);
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

      await api.reports.confirmCertificate({
        title: form.title,
        provider: form.provider,
        credentialType: form.credentialType,
        credentialId: form.credentialId,
        date: form.date,
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
          <Award size={24} className="text-effort shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Certificate Evidence Analyzer</h1>
        </div>
        <p className="text-sm text-ink-soft mt-1">
          Extract, verify, and accredit formal certifications in your Skill Passport.
        </p>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      <form onSubmit={handleAnalyze} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Certificate / Course Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Human-Computer Interaction"
              className="input w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Issuer / Provider *</label>
            <input
              type="text"
              required
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="e.g. NPTEL / Coursera / AWS"
              className="input w-full text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Credential Type</label>
            <select
              value={form.credentialType}
              onChange={(e) => setForm({ ...form, credentialType: e.target.value })}
              className="input w-full text-xs"
            >
              <option value="Course Certificate">Course Certificate</option>
              <option value="Professional Certification">Professional Certification</option>
              <option value="Specialization Degree">Specialization / Nanodegree</option>
              <option value="Workshop / Training">Workshop / Training</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Credential ID (optional)</label>
            <input
              type="text"
              value={form.credentialId}
              onChange={(e) => setForm({ ...form, credentialId: e.target.value })}
              placeholder="e.g. NPTEL23CS45"
              className="input w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Completion Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="input w-full text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Topics / Skills Covered</label>
          <textarea
            value={form.topicsText}
            onChange={(e) => setForm({ ...form, topicsText: e.target.value })}
            placeholder="e.g. HCI, UX Design, Interaction Design, User Research..."
            className="w-full p-3 rounded-md border border-rule bg-paper text-sm h-24 resize-none"
          />
        </div>

        <button type="submit" disabled={analyzing || !form.title.trim()} className="btn-accent w-full py-2.5">
          {analyzing ? 'Extracting Credential Skills...' : 'Extract & Map Certificate Skills'}
        </button>
      </form>

      {detected && (
        <section className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div>
              <Eyebrow>Extracted Credential Skills ({detected.length})</Eyebrow>
              <h3 className="font-semibold text-base mt-0.5">Select and review skills to accredit as certificate evidence</h3>
            </div>
            <Sparkles size={18} className="text-done" />
          </div>

          {detected.length === 0 ? (
            <p className="text-xs text-ink-faint italic py-2">No matching catalog skills detected. Try listing specific topics above.</p>
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
                      <Badge tone="fixed">CERTIFICATE EVIDENCE</Badge>
                    </div>

                    {checked && (
                      <div className="pt-1 pl-7">
                        <label className="block text-[11px] font-medium text-ink-soft mb-1">
                          Evidence Text:
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
              Add Credential Evidence ({selectedKeys.length})
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
