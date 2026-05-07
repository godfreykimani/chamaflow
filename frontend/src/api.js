/**
 * ChamaFlow API Client
 * All fetch calls in one place.
 * Token is read from localStorage and sent as Bearer header automatically.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Token management ─────────────────────────────────────────────────────────

export const token = {
  get:    ()      => localStorage.getItem("cf_token"),
  set:    (t)     => localStorage.setItem("cf_token", t),
  clear:  ()      => localStorage.removeItem("cf_token"),
};

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request(path, options = {}) {
  const t = token.get();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type":  "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  const json = await res.json().catch(() => ({ ok: false, error: "Invalid server response" }));

  // Token expired or invalid → force logout
  if (res.status === 401) {
    token.clear();
    window.dispatchEvent(new Event("cf:logout"));
  }

  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (phone, pin) =>
  request("/auth/login", { method: "POST", body: JSON.stringify({ phone, pin }) });

export const changePin = (current_pin, new_pin) =>
  request("/auth/change-pin", { method: "POST", body: JSON.stringify({ current_pin, new_pin }) });

export const resetPin = (member_id) =>
  request("/auth/reset-pin", { method: "POST", body: JSON.stringify({ member_id }) });

export const me = () => request("/auth/me");

// ─── Members ─────────────────────────────────────────────────────────────────

export const getMembers = (active) =>
  request(`/members${active !== undefined ? `?active=${active}` : ""}`);

export const getMember = (id) => request(`/members/${id}`);

export const addMember = (body) =>
  request("/members", { method: "POST", body: JSON.stringify(body) });

export const updateMember = (id, body) =>
  request(`/members/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deactivateMember = (id) =>
  request(`/members/${id}`, { method: "DELETE" });

// ─── Contributions ────────────────────────────────────────────────────────────

export const getContributions = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== "All"));
  const qs    = new URLSearchParams(clean).toString();
  return request(`/contributions${qs ? `?${qs}` : ""}`);
};

export const addContribution = (body) =>
  request("/contributions", { method: "POST", body: JSON.stringify(body) });

export const updateContribution = (id, body) =>
  request(`/contributions/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteContribution = (id) =>
  request(`/contributions/${id}`, { method: "DELETE" });

export const uploadProof = (id, file) => {
  const form = new FormData();
  form.append("proof", file);
  const t = token.get();
  return fetch(`${BASE}/contributions/${id}/upload`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: form,
  })
    .then(r => r.json())
    .then(j => { if (!j.ok) throw new Error(j.error); return j.data; });
};

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const getMeetings = () => request("/meetings");
export const getMeeting  = (id) => request(`/meetings/${id}`);

export const addMeeting = (body) =>
  request("/meetings", { method: "POST", body: JSON.stringify(body) });

export const updateMeeting = (id, body) =>
  request(`/meetings/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteMeeting = (id) =>
  request(`/meetings/${id}`, { method: "DELETE" });

export const recordAttendance = (meetingId, body) =>
  request(`/meetings/${meetingId}/attendance`, { method: "POST", body: JSON.stringify(body) });

export const addDecision = (meetingId, body) =>
  request(`/meetings/${meetingId}/decisions`, { method: "POST", body: JSON.stringify(body) });

export const transcribeMeeting = (id, audioBlob) => {
  const t = token.get();
  const form = new FormData();
  form.append("audio", audioBlob, "recording.webm");
  return fetch(`${BASE}/meetings/${id}/transcript`, {
    method: "POST",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: form,
  })
    .then(r => r.json())
    .then(j => { if (!j.ok) throw new Error(j.error); return j.data; });
};

export const endorseMeeting = (id, type) =>
  request(`/meetings/${id}/endorse`, { method: "POST", body: JSON.stringify({ type }) });

// ─── Dashboard & Summary ──────────────────────────────────────────────────────

export const getDashboard = (memberId) => request(`/dashboard/${memberId}`);

export const getMonthlySummary = (month) =>
  request(`/summary?month=${encodeURIComponent(month)}`);

// ─── Audit ────────────────────────────────────────────────────────────────────

export const getAuditLog = () => request("/audit");

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthCheck = () => request("/health");
