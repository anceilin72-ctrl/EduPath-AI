import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Eyebrow, Loading } from '../components/ui.jsx';

/**
 * CareerSimulator — /simulator
 *
 * What-If Career Simulator (Phase 12 upgrade):
 * - Proper hoursPerDay × daysPerWeek → hoursPerWeek conversion
 * - Multi-skill override picker from real catalog
 * - Pace multiplier (relaxed / normal / intensive)
 * - Target completion date with feasibility check
 * - Rich result: skill diff, simulated gaps, roadmap changes, time bars
 */

// ─────────────────────── helpers ───────────────────────────────────────────

function HoursBar({ label, hours, maxHours, tone = 'ink' }) {
  const pct = maxHours > 0 ? Math.min(100, Math.round((hours / maxHours) * 100)) : 0;
  const barColour = tone === 'effort' ? 'bg-effort' : 'bg-ink';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-ink-soft">
        <span>{label}</span>
        <span className="figure font-semibold text-ink">{hours}h</span>
      </div>
      <div className="h-3 rounded-full bg-paper border border-rule overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GapBadge({ levels }) {
  if (levels <= 0) return null;
  const colour =
    levels >= 3 ? 'text-red-600 bg-red-50 border-red-200' :
    levels === 2 ? 'text-warn bg-warn-soft border-warn' :
    'text-effort bg-effort-soft border-effort';
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium ${colour}`}>
      {levels} level{levels > 1 ? 's' : ''}
    </span>
  );
}

// ─────────────────────── skill picker ──────────────────────────────────────

function SkillPicker({ skills, selected, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? skills.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : skills;

  const toggle = (key) => {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input w-full text-xs flex items-center justify-between gap-2"
      >
        <span>
          {selected.length === 0
            ? 'None selected'
            : `${selected.length} skill${selected.length > 1 ? 's' : ''} selected`}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 card border border-rule shadow-lg max-h-64 flex flex-col">
          {/* search */}
          <div className="p-2 border-b border-rule flex items-center gap-2">
            <Search size={12} className="text-ink-faint shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none"
            />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-ink-soft hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          {/* list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-ink-faint p-3">No skills match.</p>
            ) : (
              filtered.map((s) => (
                <label
                  key={s.key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-paper cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.key)}
                    onChange={() => toggle(s.key)}
                    className="shrink-0"
                  />
                  <span>{s.title}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────── main component ────────────────────────────────────

export default function CareerSimulator() {
  const navigate = useNavigate();

  // ── parameters ─────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [targetRoleKey, setTargetRoleKey] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('2');
  const [daysPerWeek, setDaysPerWeek] = useState('5');
  const [pace, setPace] = useState('normal');
  const [extraKnownKeys, setExtraKnownKeys] = useState([]);
  const [targetDate, setTargetDate] = useState('');

  // ── skill catalog ───────────────────────────────────────────────────────
  const [availableSkills, setAvailableSkills] = useState([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // ── run simulation ───────────────────────────────────────────────────────
  const runSimulation = useCallback(async (params) => {
    const {
      targetRoleKey: rk,
      hoursPerDay: hpdRaw,
      daysPerWeek: dpwRaw,
      pace: p,
      extraKnownKeys: eks,
      targetDate: td,
    } = params;

    if (!rk) return;

    // Frontend validation
    const errors = {};
    let hpd = parseFloat(hpdRaw);
    let dpw = parseInt(dpwRaw, 10);

    if (isNaN(hpd) || hpd < 0.5) {
      errors.hoursPerDay = 'Study hours must be at least 0.5 hours per day.';
    } else if (hpd > 24) {
      errors.hoursPerDay = 'Study hours cannot exceed 24 hours per day.';
    }

    if (isNaN(dpw) || dpw < 1) {
      errors.daysPerWeek = 'Study days must be at least 1 day per week.';
    } else if (dpw > 7) {
      errors.daysPerWeek = 'Study days cannot exceed 7 days per week.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Please fix the validation errors below.');
      return;
    }

    setSimulating(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api.simulator.simulate({
        targetRoleKey: rk,
        hoursPerDay: hpd,
        daysPerWeek: dpw,
        pace: p,
        extraKnownKeys: eks,
        targetDate: td || undefined,
      });
      setSimulation(res);
    } catch (err) {
      setError(err.message);
      // Handle backend validation errors
      if (err.fields && Array.isArray(err.fields)) {
        const backendErrors = {};
        err.fields.forEach(({ field, message }) => {
          backendErrors[field] = message;
        });
        setFieldErrors(backendErrors);
      }
    } finally {
      setSimulating(false);
    }
  }, []);

  // ── initial data load ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.roles.list().catch(() => ({ roles: [] })),
      api.dashboard.get().catch(() => ({ roadmap: null, user: null })),
    ]).then(([rolesRes, dashRes]) => {
      if (!isMounted) return;
      const loadedRoles = rolesRes.roles || [];
      setRoles(loadedRoles);

      const activeKey = dashRes.roadmap?.roleKey || dashRes.user?.profile?.targetRoleKey;
      let defaultKey = loadedRoles[0]?.key || 'frontend-developer';
      if (activeKey) {
        const match = loadedRoles.find(
          (r) => r.key === activeKey || r.title.toLowerCase() === activeKey.toLowerCase()
        );
        if (match) defaultKey = match.key;
      }
      setTargetRoleKey(defaultKey);
      setLoading(false);

      // Run initial simulation
      runSimulation({
        targetRoleKey: defaultKey,
        hoursPerDay: '2',
        daysPerWeek: '5',
        pace: 'normal',
        extraKnownKeys: [],
        targetDate: ''
      });
    });
    return () => { isMounted = false; };
  }, [runSimulation]);

  // ── fetch skill catalog when role changes ────────────────────────────────
  useEffect(() => {
    if (!targetRoleKey) return;
    api.simulator.skills(targetRoleKey)
      .then((res) => setAvailableSkills(res.skills || []))
      .catch(() => setAvailableSkills([]));
    // Reset extraKnownKeys when role changes to avoid stale selections
    setExtraKnownKeys([]);
  }, [targetRoleKey]);

  // ── apply path ───────────────────────────────────────────────────────────
  async function handleApplyPath() {
    setApplying(true);
    setError(null);
    setFieldErrors({});
    try {
      let hpd = parseFloat(hoursPerDay);
      let dpw = parseInt(daysPerWeek, 10);

      // Frontend validation before apply
      const errors = {};
      if (isNaN(hpd) || hpd < 0.5) {
        errors.hoursPerDay = 'Study hours must be at least 0.5 hours per day.';
      } else if (hpd > 24) {
        errors.hoursPerDay = 'Study hours cannot exceed 24 hours per day.';
      }

      if (isNaN(dpw) || dpw < 1) {
        errors.daysPerWeek = 'Study days must be at least 1 day per week.';
      } else if (dpw > 7) {
        errors.daysPerWeek = 'Study days cannot exceed 7 days per week.';
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError('Please fix the validation errors before applying.');
        return;
      }

      const res = await api.simulator.apply({
        targetRoleKey,
        hoursPerDay: hpd,
        daysPerWeek: dpw,
        extraKnownKeys,
      });
      navigate(`/plans/${res.roadmap._id}`);
    } catch (err) {
      setError(err.message);
      // Handle backend validation errors
      if (err.fields && Array.isArray(err.fields)) {
        const backendErrors = {};
        err.fields.forEach(({ field, message }) => {
          backendErrors[field] = message;
        });
        setFieldErrors(backendErrors);
      }
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <Loading label="Loading Career Simulator" />;

  const sim = simulation;
  const maxHours = sim
    ? Math.max(sim.currentPath.totalHours, sim.simulatedPath.totalHours, 1)
    : 1;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass size={24} className="text-effort shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">What-If Career Simulator</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Simulate switching roles or changing study availability — without altering your active plan.
          </p>
        </div>
        <Badge tone="fixed">Non-destructive</Badge>
      </header>

      {error && <Callout tone="error">{error}</Callout>}

      {/* ── Parameters Card ──────────────────────────────────────────────── */}
      <section className="card p-6 space-y-5">
        <Eyebrow>Simulation Parameters</Eyebrow>

        {/* Row 1: Role + Hours + Days */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Target Role */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              <Compass size={11} className="inline mr-1" />
              Target role
            </label>
            <select
              value={targetRoleKey}
              onChange={(e) => setTargetRoleKey(e.target.value)}
              className="input w-full text-xs"
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.title} ({r.domain})
                </option>
              ))}
            </select>
          </div>

          {/* Hours per day */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              <Clock size={11} className="inline mr-1" />
              Study hours / day
            </label>
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={hoursPerDay}
              onChange={(e) => {
                setHoursPerDay(e.target.value);
                setFieldErrors((prev) => ({ ...prev, hoursPerDay: undefined }));
              }}
              className={`input w-full text-xs ${fieldErrors.hoursPerDay ? 'border-warn ring-1 ring-warn' : ''}`}
            />
            {fieldErrors.hoursPerDay && (
              <p className="text-xs text-warn mt-1 flex items-center gap-1">
                <span>⚠</span>
                <span>{fieldErrors.hoursPerDay}</span>
              </p>
            )}
          </div>

          {/* Days per week */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              <Calendar size={11} className="inline mr-1" />
              Study days / week
            </label>
            <input
              type="number"
              min="1"
              max="7"
              step="1"
              value={daysPerWeek}
              onChange={(e) => {
                setDaysPerWeek(e.target.value);
                setFieldErrors((prev) => ({ ...prev, daysPerWeek: undefined }));
              }}
              className={`input w-full text-xs ${fieldErrors.daysPerWeek ? 'border-warn ring-1 ring-warn' : ''}`}
            />
            {fieldErrors.daysPerWeek && (
              <p className="text-xs text-warn mt-1 flex items-center gap-1">
                <span>⚠</span>
                <span>{fieldErrors.daysPerWeek}</span>
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Pace + Target Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {/* Pace */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-2">
              <Zap size={11} className="inline mr-1" />
              Learning pace
            </label>
            <div className="flex gap-2">
              {[
                { value: 'relaxed', label: 'Relaxed', hint: 'More breathing room' },
                { value: 'normal', label: 'Normal', hint: 'Standard estimates' },
                { value: 'intensive', label: 'Intensive', hint: 'Compressed schedule' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex-1 text-center border rounded p-2 cursor-pointer text-xs transition-colors ${
                    pace === opt.value
                      ? 'border-effort bg-effort-soft text-effort font-semibold'
                      : 'border-rule hover:border-effort'
                  }`}
                >
                  <input
                    type="radio"
                    name="pace"
                    value={opt.value}
                    checked={pace === opt.value}
                    onChange={() => setPace(opt.value)}
                    className="sr-only"
                  />
                  <div>{opt.label}</div>
                  <div className="text-ink-faint text-xs mt-0.5">{opt.hint}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Target date */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              <Calendar size={11} className="inline mr-1" />
              Target completion date <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              type="date"
              value={targetDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setTargetDate(e.target.value)}
              className="input w-full text-xs"
            />
          </div>
        </div>

        {/* Row 3: Skill overrides */}
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">
            <Check size={11} className="inline mr-1" />
            What if I already know…{' '}
            <span className="text-ink-faint font-normal">
              (skills marked as known will be skipped in the simulation)
            </span>
          </label>
          {availableSkills.length > 0 ? (
            <SkillPicker
              skills={availableSkills}
              selected={extraKnownKeys}
              onChange={setExtraKnownKeys}
            />
          ) : (
            <p className="text-xs text-ink-faint">Loading skill list…</p>
          )}
          {extraKnownKeys.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {extraKnownKeys.map((k) => {
                const s = availableSkills.find((x) => x.key === k);
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-effort-soft text-effort border border-effort"
                  >
                    {s?.title ?? k}
                    <button
                      type="button"
                      onClick={() => setExtraKnownKeys((prev) => prev.filter((x) => x !== k))}
                      className="ml-0.5 text-effort hover:text-ink"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Re-run button */}
        <div className="pt-1 flex items-center justify-between">
          <p className="text-xs text-ink-faint">
            {simulating ? 'Running simulation…' : 'Click Re-run Simulation to apply changes.'}
          </p>
          <button
            type="button"
            onClick={() =>
              runSimulation({ targetRoleKey, hoursPerDay, daysPerWeek, pace, extraKnownKeys, targetDate })
            }
            disabled={simulating}
            className="btn-accent text-xs"
          >
            <RefreshCw size={14} className={simulating ? 'animate-spin' : ''} aria-hidden="true" />
            Re-run Simulation
          </button>
        </div>
      </section>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {sim && (
        <div className="space-y-5">

          {/* 1. Side-by-Side Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Current */}
            <div className="card p-5 border-l-4 border-l-ink space-y-3">
              <div>
                <Eyebrow>Current Active Path</Eyebrow>
                <h3 className="text-lg font-semibold mt-0.5">{sim.currentPath.roleTitle}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="panel p-2">
                  <p className="text-ink-faint">Total Work</p>
                  <p className="figure font-semibold text-lg mt-0.5">{sim.currentPath.totalHours}h</p>
                </div>
                <div className="panel p-2">
                  <p className="text-ink-faint">Duration</p>
                  <p className="figure font-semibold text-lg mt-0.5">{sim.currentPath.totalWeeks}w</p>
                </div>
                <div className="panel p-2">
                  <p className="text-ink-faint">Steps</p>
                  <p className="figure font-semibold text-lg mt-0.5">{sim.currentPath.nodeCount}</p>
                </div>
              </div>
            </div>

            {/* Simulated */}
            <div className="card p-5 border-l-4 border-l-effort bg-effort-soft space-y-3">
              <div>
                <Eyebrow>Simulated Path</Eyebrow>
                <h3 className="text-lg font-semibold text-effort mt-0.5">{sim.simulatedPath.roleTitle}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="panel p-2">
                  <p className="text-ink-faint">Simulated Work</p>
                  <p className="figure font-semibold text-lg text-effort mt-0.5">{sim.simulatedPath.totalHours}h</p>
                </div>
                <div className="panel p-2">
                  <p className="text-ink-faint">Duration</p>
                  <p className="figure font-semibold text-lg text-effort mt-0.5">{sim.simulatedPath.totalWeeks}w</p>
                </div>
                <div className="panel p-2">
                  <p className="text-ink-faint">Steps</p>
                  <p className="figure font-semibold text-lg text-effort mt-0.5">{sim.simulatedPath.nodeCount}</p>
                </div>
              </div>
              {sim.simulatedPath.projectedFinishDate && (
                <p className="text-xs text-ink-soft">
                  Projected finish:{' '}
                  <span className="font-medium text-ink">
                    {new Date(sim.simulatedPath.projectedFinishDate).toLocaleDateString('en-IN', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* 2. Learning Work Bar Chart */}
          <div className="card p-5 space-y-3">
            <Eyebrow>Learning Work Comparison</Eyebrow>
            <div className="space-y-3">
              <HoursBar label="Current path" hours={sim.currentPath.totalHours} maxHours={maxHours} tone="ink" />
              <HoursBar label="Simulated path" hours={sim.simulatedPath.totalHours} maxHours={maxHours} tone="effort" />
            </div>
            <div className="flex gap-6 text-xs text-ink-soft pt-1">
              <span>
                Duration: <strong className="text-ink">{sim.currentPath.totalWeeks}w</strong> →{' '}
                <strong className="text-effort">{sim.simulatedPath.totalWeeks}w</strong>
                {sim.delta.weeksDiff !== 0 && (
                  <span className={sim.delta.weeksDiff < 0 ? 'text-done ml-1' : 'text-warn ml-1'}>
                    ({sim.delta.weeksDiff > 0 ? '+' : ''}{sim.delta.weeksDiff}w)
                  </span>
                )}
              </span>
              <span>
                Work: <strong className="text-ink">{sim.currentPath.totalHours}h</strong> →{' '}
                <strong className="text-effort">{sim.simulatedPath.totalHours}h</strong>
                {sim.delta.hoursDiff !== 0 && (
                  <span className={sim.delta.hoursDiff < 0 ? 'text-done ml-1' : 'text-warn ml-1'}>
                    ({sim.delta.hoursDiff > 0 ? '+' : ''}{sim.delta.hoursDiff}h)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* 3. What Changes */}
          {(sim.delta.skillsAdded?.length > 0 || sim.delta.skillsRemoved?.length > 0 || sim.delta.skillsSkipped?.length > 0) && (
            <div className="card p-5 space-y-4">
              <Eyebrow>What Changes?</Eyebrow>

              {/* summary line */}
              <div className="text-sm text-ink-soft space-y-0.5">
                {sim.delta.skillsAdded?.length > 0 && (
                  <p>
                    <span className="text-warn font-semibold">+{sim.delta.skillsAdded.length}</span>{' '}
                    new skill{sim.delta.skillsAdded.length > 1 ? 's' : ''} required
                  </p>
                )}
                {sim.delta.skillsSkipped?.length > 0 && (
                  <p>
                    <span className="text-done font-semibold">−{sim.delta.skillsSkipped.length}</span>{' '}
                    skill{sim.delta.skillsSkipped.length > 1 ? 's' : ''} skipped (you marked{' '}
                    {sim.delta.skillsSkipped.length > 1 ? 'them' : 'it'} as known)
                  </p>
                )}
                {sim.delta.skillsRemoved?.length > 0 && (
                  <p>
                    <span className="text-fixed font-semibold">−{sim.delta.skillsRemoved.length}</span>{' '}
                    skill{sim.delta.skillsRemoved.length > 1 ? 's' : ''} removed (not needed for this role)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Skills Added */}
                {sim.delta.skillsAdded?.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink mb-1.5">Skills Added</p>
                    <div className="space-y-1">
                      {sim.delta.skillsAdded.slice(0, 10).map((s) => (
                        <div key={s.nodeKey} className="flex items-center gap-1.5">
                          <span className="text-warn">+</span>
                          <span className="text-ink-soft">{s.title}</span>
                        </div>
                      ))}
                      {sim.delta.skillsAdded.length > 10 && (
                        <p className="text-ink-faint">+{sim.delta.skillsAdded.length - 10} more…</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Skills Skipped (overrides) */}
                {sim.delta.skillsSkipped?.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink mb-1.5">Skills Skipped</p>
                    <div className="space-y-1">
                      {sim.delta.skillsSkipped.map((s) => (
                        <div key={s.nodeKey} className="flex items-center gap-1.5">
                          <span className="text-done">✓</span>
                          <span className="text-ink-soft">{s.title}</span>
                          {s.hoursSaved > 0 && (
                            <span className="text-ink-faint ml-auto">−{s.hoursSaved}h</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills Removed (role diff) */}
                {sim.delta.skillsRemoved?.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink mb-1.5">Skills Removed</p>
                    <div className="space-y-1">
                      {sim.delta.skillsRemoved.slice(0, 10).map((s) => (
                        <div key={s.nodeKey} className="flex items-center gap-1.5">
                          <span className="text-fixed">−</span>
                          <span className="text-ink-soft">{s.title}</span>
                        </div>
                      ))}
                      {sim.delta.skillsRemoved.length > 10 && (
                        <p className="text-ink-faint">+{sim.delta.skillsRemoved.length - 10} more…</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Simulated Skill Gaps */}
          {sim.skillGaps?.length > 0 && (
            <div className="card p-5 space-y-3">
              <Eyebrow>Simulated Skill Gaps</Eyebrow>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-faint border-b border-rule">
                      <th className="text-left py-1.5 pr-4 font-medium">Skill</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Current</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Target</th>
                      <th className="text-left py-1.5 font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {sim.skillGaps.map((g) => (
                      <tr key={g.nodeKey}>
                        <td className="py-1.5 pr-4 font-medium text-ink">{g.title}</td>
                        <td className="py-1.5 pr-4 text-ink-soft capitalize">{g.currentLevel}</td>
                        <td className="py-1.5 pr-4 text-ink-soft capitalize">{g.targetLevel}</td>
                        <td className="py-1.5">
                          <GapBadge levels={g.gapLevels} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Target Date Feasibility */}
          {sim.targetDateFeasibility && (
            <div className={`card p-5 space-y-2 border-l-4 ${
              sim.targetDateFeasibility.feasible ? 'border-l-done' : 'border-l-warn'
            }`}>
              <Eyebrow>Target Date Feasibility</Eyebrow>
              <p className="text-sm font-medium text-ink">
                Target:{' '}
                {new Date(sim.targetDateFeasibility.targetDate).toLocaleDateString('en-IN', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
                {' '}({sim.targetDateFeasibility.weeksUntilTarget} weeks away)
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs text-ink-soft">
                <div>
                  <p className="text-ink-faint">Required</p>
                  <p className="figure font-semibold text-ink">
                    {sim.targetDateFeasibility.requiredHoursPerWeek ?? '—'}h / week
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint">Your availability</p>
                  <p className="figure font-semibold text-ink">
                    {sim.targetDateFeasibility.availableHoursPerWeek}h / week
                  </p>
                </div>
              </div>
              {sim.targetDateFeasibility.feasible ? (
                <p className="text-xs text-done font-medium">✓ On track — your availability covers the required pace.</p>
              ) : (
                <p className="text-xs text-warn font-medium">
                  ⚠ {sim.targetDateFeasibility.shortfallPerWeek}h/week short of the required pace.
                  Increase study time or choose a later date.
                </p>
              )}
            </div>
          )}

          {/* 6. Apply / Keep buttons */}
          <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-ink-soft max-w-prose">
              Applying will switch your active roadmap to{' '}
              <strong>{sim.simulatedPath.roleTitle}</strong>.
              Your current plan will be archived.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => navigate('/home')} className="btn-ghost">
                Keep Current Path
              </button>
              <button
                type="button"
                onClick={handleApplyPath}
                disabled={applying}
                className="btn-accent"
              >
                <Check size={14} aria-hidden="true" />
                {applying ? 'Applying…' : 'Apply This Path'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}


