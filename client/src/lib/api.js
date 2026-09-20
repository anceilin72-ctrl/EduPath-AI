/**
 * The only place in the app that talks to the server.
 *
 * Everything goes through `request`, which centralises three things that are easy
 * to get subtly wrong if each component does its own fetching:
 *
 *   1. The auth header. Components should not know that a token exists.
 *   2. The error shape. The API always answers a failure with
 *      { error, message, fields? } — that is unwrapped into a thrown ApiError so
 *      callers can `catch (err) { setError(err.message) }` and show something the
 *      user can act on, rather than "Failed to fetch".
 *   3. A 401 meaning the session is over, wherever it happens.
 *
 * Requests go to /api/... with no hostname. Vite proxies that to the Express
 * server in development (see vite.config.js), so the same code works in a build
 * served by the API itself.
 */

const TOKEN_KEY = 'crg.token';

/** Called when the server rejects the stored token, so the app can log out once. */
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing modes can throw on access. An unauthenticated app is a
    // working app, so this is not worth surfacing.
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore — the session just will not survive a reload */
  }
}

/** An error the API explained. `fields` maps validation messages to inputs. */
export class ApiError extends Error {
  constructor(message, { status, fields, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields ?? [];
    this.details = details;
  }

  /** The message for one field, if the server complained about it. */
  fieldError(name) {
    return this.fields.find((f) => f.field === name)?.message ?? null;
  }
}

function buildUrl(path, query) {
  const url = `/api${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Skip empties so `?domain=` never reaches the server as a real filter.
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request(path, { method = 'GET', body, query, formData, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // FormData sets its own multipart boundary; setting Content-Type by hand
  // breaks the upload in a way that is very hard to diagnose from the browser.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(
      'Could not reach the server. Check that the backend is running on port 5000.',
      { status: 0 }
    );
  }

  if (response.status === 401) {
    setToken(null);
    onUnauthorized?.();
  }

  // 204s and empty bodies are legitimate; do not try to parse them.
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('The server sent a response the app could not read.', {
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed (${response.status}).`, {
      status: response.status,
      fields: payload?.fields,
      details: payload?.details,
    });
  }

  return payload;
}

/**
 * One named function per endpoint.
 *
 * Grouped by resource and kept thin on purpose: the value is that a component
 * reads `api.roadmaps.create({ roleKey })` instead of assembling a URL, so a
 * change to a route is a one-line change here.
 */
export const api = {
  auth: {
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    me: () => request('/auth/me'),
    updateProfile: (body) => request('/auth/me/profile', { method: 'PATCH', body }),
  },

  roles: {
    list: (query) => request('/roles', { query }),
    domains: () => request('/roles/domains'),
    get: (key) => request(`/roles/${encodeURIComponent(key)}`),
  },

  nodes: {
    search: (query) => request('/nodes', { query }),
    resolve: (terms) => request('/nodes/resolve', { method: 'POST', body: { terms } }),
    get: (key) => request(`/nodes/${encodeURIComponent(key)}`),
  },

  roadmaps: {
    preview: (body) => request('/roadmaps/preview', { method: 'POST', body }),
    create: (body) => request('/roadmaps', { method: 'POST', body }),
    list: (query) => request('/roadmaps', { query }),
    get: (id) => request(`/roadmaps/${id}`),
    regenerate: (id, body = {}) => request(`/roadmaps/${id}/regenerate`, { method: 'POST', body }),
    archive: (id, isArchived) =>
      request(`/roadmaps/${id}/archive`, { method: 'PATCH', body: { isArchived } }),
    remove: (id) => request(`/roadmaps/${id}`, { method: 'DELETE' }),
    // ── Adaptive Layer (Phase 4) ──────────────────────────────────────────
    adapt: (id, body) => request(`/roadmaps/${id}/adapt`, { method: 'POST', body }),
    adaptationHistory: (id) => request(`/roadmaps/${id}/adaptation-history`),
    agentDecisions: (id, query) => request(`/roadmaps/${id}/agent-decisions`, { query }),
    acceptDecision: (id, did) =>
      request(`/roadmaps/${id}/decisions/${did}/accept`, { method: 'POST', body: {} }),
    rejectDecision: (id, did) =>
      request(`/roadmaps/${id}/decisions/${did}/reject`, { method: 'POST', body: {} }),
  },

  progress: {
    get: (roadmapId) => request(`/progress/${roadmapId}`),
    set: (roadmapId, nodeKey, body) =>
      request(`/progress/${roadmapId}/${encodeURIComponent(nodeKey)}`, { method: 'PUT', body }),
    reset: (roadmapId) => request(`/progress/${roadmapId}`, { method: 'DELETE' }),
  },

  resume: {
    upload: (file) => {
      const formData = new FormData();
      formData.append('resume', file);
      return request('/resume/upload', { method: 'POST', formData });
    },
    confirm: (nodeKeys, mode = 'add', { rejectedKeys = [] } = {}) =>
      request('/resume/confirm', { method: 'POST', body: { nodeKeys, rejectedKeys, mode } }),
    get: () => request('/resume'),
    remove: () => request('/resume', { method: 'DELETE' }),
  },

  analysis: {
    gap: (body) => request('/analysis/gap', { method: 'POST', body }),
    roleFit: (query) => request('/analysis/role-fit', { query }),
  },

  /**
   * The whole home screen in one request.
   *
   * The timezone offset is sent from the browser because the study streak counts
   * calendar days: a step finished at 1am is still "today" to the learner, and the
   * server has no other way to know where they are.
   */
  dashboard: {
    get: () => request('/dashboard', { query: { tzOffset: -new Date().getTimezoneOffset() } }),
  },

  skills: {
    passport: () => request('/skills/passport'),
    getEvidence: (skillId) => request(`/skills/${encodeURIComponent(skillId)}/evidence`),
    addEvidence: (skillId, body) =>
      request(`/skills/${encodeURIComponent(skillId)}/evidence`, { method: 'POST', body }),
    updateEvidence: (skillId, evidenceId, body) =>
      request(`/skills/${encodeURIComponent(skillId)}/evidence/${evidenceId}`, {
        method: 'PATCH',
        body,
      }),
    deleteEvidence: (skillId, evidenceId) =>
      request(`/skills/${encodeURIComponent(skillId)}/evidence/${evidenceId}`, {
        method: 'DELETE',
      }),
    addProject: (body) => request('/skills/projects', { method: 'POST', body }),
    gaps: (query) => request('/skills/gaps', { query }),
    getSkillGap: (skillId, query) =>
      request(`/skills/gaps/${encodeURIComponent(skillId)}`, { query }),
    recalculateGaps: (body) => request('/skills/gaps/recalculate', { method: 'POST', body }),
  },

  assessments: {
    generate: (body) => request('/assessments/generate', { method: 'POST', body }),
    get: (id) => request(`/assessments/${id}`),
    submit: (id, body) => request(`/assessments/${id}/submit`, { method: 'POST', body }),
    historyAll: () => request('/assessments/history/all'),
    historyBySkill: (skillId) =>
      request(`/assessments/history/${encodeURIComponent(skillId)}`),
  },

  agent: {
    weeklyPlan: () => request('/agent/weekly-plan'),
    generatePlan: () => request('/agent/weekly-plan/generate', { method: 'POST' }),
    today: (query) => request('/agent/today', { query }),
    reportMissedTask: (taskId, body) =>
      request(`/agent/tasks/${encodeURIComponent(taskId)}/missed`, { method: 'POST', body }),
    completeTask: (taskId, body) =>
      request(`/agent/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST', body }),
    chat: (body) => request('/agent/chat', { method: 'POST', body }),
    activity: () => request('/agent/activity'),
    weeklyReport: () => request('/agent/weekly-report'),
    decisionLog: () => request('/agent/decisions/log'),
  },

  reports: {
    progress: () => request('/reports/progress'),
    readiness: () => request('/reports/readiness'),
    analyzeProject: (body) => request('/reports/project/analyze', { method: 'POST', body }),
    confirmProject: (body) => request('/reports/project/confirm', { method: 'POST', body }),
    analyzeCertificate: (body) => request('/reports/certificate/analyze', { method: 'POST', body }),
    confirmCertificate: (body) => request('/reports/certificate/confirm', { method: 'POST', body }),
  },

  simulator: {
    skills: (roleKey) =>
      request(`/simulator/skills${roleKey ? `?roleKey=${encodeURIComponent(roleKey)}` : ''}`),
    simulate: (body) => request('/simulator/simulate', { method: 'POST', body }),
    apply: (body) => request('/simulator/apply', { method: 'POST', body }),
  },


  tutor: {
    context: () => request('/tutor/context'),
    chat: (body) => request('/tutor/chat', { method: 'POST', body }),
    explain: (body) => request('/tutor/explain', { method: 'POST', body }),
  },

  interview: {
    context: () => request('/interview/context'),
    modes: () => request('/interview/modes'),
    chat: (body) => request('/interview/chat', { method: 'POST', body }),
    evaluate: (body) => request('/interview/evaluate', { method: 'POST', body }),
  },

  health: () => request('/health'),
};

export default api;
