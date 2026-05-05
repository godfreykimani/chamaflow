import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "./api.js";
import LoginPage    from "./LoginPage.jsx";
import ChangePinPage from "./ChangePinPage.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`;

const now = new Date();
const CURRENT_MONTH = now.toLocaleString("en-GB", { month: "long" }) + " " + now.getFullYear();

const TYPE_META = {
  Contribution: { icon: "◈", bg: "#E8F0FE", text: "#1565C0", border: "#90CAF9" },
  Fine:         { icon: "⚑", bg: "#FBE9E7", text: "#BF360C", border: "#FFAB91" },
  Lateness:     { icon: "◷", bg: "#FFF8E1", text: "#E65100", border: "#FFE082" },
};

const NAV_ITEMS = [
  { id: "dashboard",     label: "Dashboard",     icon: "⊞" },
  { id: "contributions", label: "Contributions", icon: "◈" },
  { id: "meetings",      label: "Meetings",      icon: "◉" },
  { id: "record",        label: "Record",        icon: "⊕" },
  { id: "members",       label: "Members",       icon: "◎" },
  { id: "settings",      label: "Settings",      icon: "⊙" },
];

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Tag({ label, color, text, border }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, background: color, color: text, fontSize: 11, fontWeight: 600, border: border ? `1px solid ${border}` : undefined }}>
      {label}
    </span>
  );
}

function Skeleton({ h = 16, w = "100%", r = 8 }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: "linear-gradient(90deg,#ECEAE4 25%,#F5F4F0 50%,#ECEAE4 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />;
}

function Spinner() {
  return <div style={{ width: 20, height: 20, border: "2px solid #ECEAE4", borderTopColor: "#1A1A1A", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

// ── Auth wrapper — renders Login → ChangePin → App ────────────────────────────

export default function Root() {
  const [authState,   setAuthState]   = useState("loading"); // loading | login | change_pin | app
  const [loginError,  setLoginError]  = useState(null);
  const [pinError,    setPinError]    = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Restore session from localStorage on mount
  useEffect(() => {
    const t = api.token.get();
    if (!t) return setAuthState("login");
    api.me()
      .then(() => setAuthState("app"))
      .catch(() => { api.token.clear(); setAuthState("login"); });
  }, []);

  // Listen for forced logout (401 from any API call)
  useEffect(() => {
    const handler = () => setAuthState("login");
    window.addEventListener("cf:logout", handler);
    return () => window.removeEventListener("cf:logout", handler);
  }, []);

  const handleLogin = async (phone, pin) => {
    setLoginError(null);
    setAuthLoading(true);
    try {
      const { token: t, must_change_pin } = await api.login(phone, pin);
      api.token.set(t);
      setAuthState(must_change_pin ? "change_pin" : "app");
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangePin = async (current_pin, new_pin) => {
    setPinError(null);
    setAuthLoading(true);
    try {
      await api.changePin(current_pin, new_pin);
      setAuthState("app");
    } catch (e) {
      setPinError(e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    api.token.clear();
    setAuthState("login");
    setLoginError(null);
  };

  if (authState === "loading")     return <LoadingScreen />;
  if (authState === "login")       return <LoginPage onLogin={handleLogin} loading={authLoading} error={loginError} />;
  if (authState === "change_pin")  return <ChangePinPage onSave={handleChangePin} loading={authLoading} error={pinError} />;
  return <ChamaFlow onLogout={handleLogout} />;
}

function LoadingScreen() {
  return (
    <div style={{ minHeight:"100vh", background:"#1C1C1E", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:28, fontWeight:700, color:"#F7F6F2", letterSpacing:"-1px", fontFamily:"'DM Serif Display',serif", marginBottom:24 }}>Kabazim Reloded</div>
      <div style={{ width:24, height:24, border:"2px solid #333", borderTopColor:"#C8A97E", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Main App (only shown when authenticated) ──────────────────────────────────

function ChamaFlow({ onLogout }) {
  // ── Auth — derive role from stored token ──
  const [role,        setRole]        = useState("Member");
  const [currentUser, setCurrentUser] = useState(null);

  // ── Navigation & layout ──
  const [page,     setPage]     = useState("dashboard");
  const [viewMode, setViewMode] = useState("mobile");

  // ── Shared data ──
  const [members,       setMembers]       = useState([]);
  const [contributions, setContributions] = useState([]);
  const [meetings,      setMeetings]      = useState([]);
  const [dashboard,     setDashboard]     = useState(null);

  // ── Filter state ──
  const [filterYear,   setFilterYear]   = useState(String(now.getFullYear()));
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterMember, setFilterMember] = useState("All");
  const [filterType,   setFilterType]   = useState("All");

  // ── UI state ──
  const [loading,          setLoading]          = useState({});
  const [toast,            setToast]            = useState(null);
  const [selectedMeeting,  setSelectedMeeting]  = useState(null);
  const [addMemberModal,   setAddMemberModal]   = useState(false);
  const [editMember,       setEditMember]       = useState(null);
  const [recordForm,       setRecordForm]       = useState({ member_id: "", type: "Contribution", month: CURRENT_MONTH, amount: "5000", method: "M-Pesa", ref: "", confirmed: false });
  const [apiOnline,        setApiOnline]        = useState(null);

  // ── Voice recording state ──
  const [recording,   setRecording]   = useState(false);
  const [transcribing,setTranscribing]= useState(false);
  const [waveform,    setWaveform]    = useState([]);
  const [transcript,  setTranscript]  = useState("");

  const isAdmin = role === "Chairman" || role === "Secretary";

  // ── Set loading key ──
  const setLoad = (key, val) => setLoading(p => ({ ...p, [key]: val }));

  // ── Toast helper ──
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Health check ──
  useEffect(() => {
    api.healthCheck()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  // ── Load current user from JWT ──
  useEffect(() => {
    api.me()
      .then(user => {
        setCurrentUser(user);
        setRole(user.role);
      })
      .catch(() => {});
  }, []);

  // ── Fetch all members ──
  useEffect(() => {
    setLoad("members", true);
    api.getMembers()
      .then(setMembers)
      .catch(() => showToast("Could not load members", "error"))
      .finally(() => setLoad("members", false));
  }, []);

  // ── Fetch dashboard when user is set ──
  useEffect(() => {
    if (!currentUser) return;
    setLoad("dashboard", true);
    api.getDashboard(currentUser.id)
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoad("dashboard", false));
  }, [currentUser]);

  // ── Fetch contributions when on contributions page or filters change ──
  useEffect(() => {
    if (page !== "contributions") return;
    setLoad("contributions", true);
    const params = {
      year:     filterYear,
      status:   filterStatus !== "All" ? filterStatus : undefined,
      memberId: isAdmin && filterMember !== "All" ? filterMember : (!isAdmin && currentUser ? currentUser.id : undefined),
      type:     filterType !== "All" ? filterType : undefined,
    };
    api.getContributions(params)
      .then(setContributions)
      .catch(() => showToast("Failed to load contributions", "error"))
      .finally(() => setLoad("contributions", false));
  }, [page, filterYear, filterStatus, filterMember, filterType, currentUser]);

  // ── Fetch meetings when on meetings page ──
  useEffect(() => {
    if (page !== "meetings") return;
    setLoad("meetings", true);
    api.getMeetings()
      .then(setMeetings)
      .catch(() => showToast("Failed to load meetings", "error"))
      .finally(() => setLoad("meetings", false));
  }, [page]);

  // ── Refetch contributions for Record page summary ──
  const [monthlySummary, setMonthlySummary] = useState(null);
  useEffect(() => {
    if (page !== "record") return;
    setLoad("summary", true);
    api.getMonthlySummary(CURRENT_MONTH)
      .then(setMonthlySummary)
      .catch(() => {})
      .finally(() => setLoad("summary", false));
  }, [page]);

  // ── Waveform animation ──
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() =>
      setWaveform(p => [...p, Math.random() * 60 + 10].slice(-40)), 80);
    return () => clearInterval(iv);
  }, [recording]);

  // ── Record contribution ──
  const handleRecordContrib = async () => {
    const { member_id, type, month, amount, method, ref, confirmed } = recordForm;
    if (!member_id || !amount) return showToast("Select a member and enter an amount", "error");
    try {
      setLoad("record", true);
      await api.addContribution({
        member_id: parseInt(member_id),
        type, month,
        amount: parseFloat(amount),
        method, ref,
        status: confirmed ? "Confirmed" : "Pending",
      });
      showToast("Contribution recorded successfully");
      setRecordForm(f => ({ ...f, member_id: "", ref: "", confirmed: false }));
      // Refresh summary
      const s = await api.getMonthlySummary(CURRENT_MONTH);
      setMonthlySummary(s);
    } catch (e) {
      showToast(e.message || "Failed to record", "error");
    } finally {
      setLoad("record", false);
    }
  };

  // ── Add member ──
  const handleAddMember = async (formData) => {
    try {
      const newMember = await api.addMember(formData);
      setMembers(prev => [...prev, newMember]);
      setAddMemberModal(false);
      showToast(`${newMember.name} added successfully`);
    } catch (e) {
      showToast(e.message || "Failed to add member", "error");
    }
  };

  // ── Edit member ──
  const handleEditMember = async (id, formData) => {
    try {
      const updated = await api.updateMember(id, formData);
      setMembers(prev => prev.map(m => m.id === id ? updated : m));
      setEditMember(null);
      showToast(`${updated.name} updated successfully`);
    } catch (e) {
      showToast(e.message || "Failed to update member", "error");
    }
  };

  // ── Toggle member active ──
  const handleToggleActive = async (id, currentActive) => {
    try {
      const updated = await api.updateMember(id, { active: !currentActive });
      setMembers(prev => prev.map(m => m.id === id ? updated : m));
      showToast(updated.active ? "Member activated" : "Member deactivated");
    } catch (e) {
      showToast("Failed to update member", "error");
    }
  };

  // ── Confirm contribution (admin) ──
  const handleConfirmContrib = async (id) => {
    try {
      await api.updateContribution(id, { status: "Confirmed" });
      setContributions(prev => prev.map(c => c.id === id ? { ...c, status: "Confirmed" } : c));
      showToast("Contribution confirmed");
    } catch (e) {
      showToast("Failed to confirm", "error");
    }
  };

  const selectStyle = {
    padding: "9px 14px", borderRadius: 12, border: "1px solid #ECEAE4",
    background: "#fff", fontSize: 12, color: "#1A1A1A", fontFamily: "inherit",
    cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 30,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#EDEBE6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes toastIn { from{transform:translateX(120%)} to{transform:translateX(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        .fade-up  { animation: fadeUp 0.3s ease both; }
        .slide-up { animation: slideUp 0.3s cubic-bezier(.4,0,.2,1) forwards; }
        .toast-in { animation: toastIn 0.3s ease forwards; }
        .nav-btn:hover { background: rgba(0,0,0,0.04); }
        .card:hover { transform:translateY(-1px); box-shadow:0 8px 28px rgba(0,0,0,0.1)!important; transition:all 0.2s; }
        .btn:hover  { filter:brightness(1.06); transform:translateY(-1px); }
        .btn:active { transform:scale(0.97); }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:0; }
        input,select,textarea { font-family:inherit; }
        button { cursor:pointer; font-family:inherit; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ background: "#1A1A1A", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#444", fontSize: 11, letterSpacing: 1 }}>KABAZIM RELODED</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: apiOnline === null ? "#666" : apiOnline ? "#4CAF50" : "#EF5350" }} />
            <span style={{ fontSize: 10, color: apiOnline ? "#4CAF50" : "#EF5350" }}>
              {apiOnline === null ? "Connecting…" : apiOnline ? "Connected" : "API offline"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentUser && (
            <span style={{ fontSize: 11, color: "#666" }}>{currentUser.name} · <span style={{ color: "#C8A97E" }}>{role}</span></span>
          )}
          {/* Layout switcher */}
          <div style={{ display: "flex", background: "#2A2A2A", borderRadius: 8, padding: 2 }}>
            {[["mobile","📱"],["tablet","💻"]].map(([v,e]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, background: viewMode === v ? "#F0EDE6" : "transparent", color: viewMode === v ? "#1A1A1A" : "#555", transition: "all 0.15s", cursor: "pointer" }}>{e}</button>
            ))}
          </div>
          <button onClick={onLogout} style={{ background: "#2A2A2A", border: "none", color: "#999", borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>

      {/* ── App shell ── */}
      <div style={{ display: "flex", justifyContent: "center", padding: viewMode === "tablet" ? 24 : 0, minHeight: "calc(100vh - 46px)" }}>
        <div style={{
          width: viewMode === "mobile" ? "100%" : 940,
          maxWidth: viewMode === "mobile" ? 430 : 940,
          background: "#F7F6F2",
          borderRadius: viewMode === "tablet" ? 24 : 0,
          overflow: "hidden",
          display: viewMode === "tablet" ? "flex" : "block",
          boxShadow: viewMode === "tablet" ? "0 24px 80px rgba(0,0,0,0.2)" : "none",
          minHeight: viewMode === "tablet" ? "calc(100vh - 94px)" : "calc(100vh - 46px)",
        }}>
          {/* Tablet sidebar */}
          {viewMode === "tablet" && (
            <div style={{ width: 224, background: "#1C1C1E", display: "flex", flexDirection: "column", padding: "32px 0", flexShrink: 0 }}>
              <div style={{ padding: "0 24px 28px" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-0.5px" }}>Kabazim Reloded</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2, letterSpacing: 1 }}>SAVINGS PLATFORM</div>
              </div>
              <div style={{ padding: "0 12px", flex: 1 }}>
                {NAV_ITEMS.filter(n => isAdmin || !["record","members"].includes(n.id)).map(item => (
                  <button key={item.id} className="nav-btn" onClick={() => setPage(item.id)} style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px",
                    borderRadius: 10, border: "none", marginBottom: 2, textAlign: "left", transition: "all 0.15s",
                    background: page === item.id ? "rgba(240,237,230,0.1)" : "transparent",
                    color: page === item.id ? "#F0EDE6" : "#555",
                    fontWeight: page === item.id ? 600 : 400, fontSize: 13,
                  }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
              {currentUser && (
                <div style={{ padding: "20px 16px 0" }}>
                  <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#C8A97E,#A07850)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                      {currentUser.name?.charAt(0)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F0EDE6" }}>{currentUser.name}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{role}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Mobile header */}
            {viewMode === "mobile" && (
              <div style={{ background: "#F7F6F2", padding: "14px 20px 10px", borderBottom: "1px solid #ECEAE4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A" }}>Kabazim Reloded</div>
                  <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5 }}>{role.toUpperCase()}</div>
                </div>
                {currentUser && (
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#C8A97E,#A07850)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                    {currentUser.name?.charAt(0)}
                  </div>
                )}
              </div>
            )}

            {/* Page content */}
            <div style={{ flex: 1, overflowY: "auto", padding: viewMode === "tablet" ? "28px 32px" : "0 0 80px" }}>
              {!apiOnline && apiOnline !== null && (
                <div style={{ margin: 20, background: "#FFF3E0", borderRadius: 14, padding: 16, borderLeft: "4px solid #FF9800" }}>
                  <div style={{ fontWeight: 700, color: "#E65100", marginBottom: 4 }}>API server is offline</div>
                  <div style={{ fontSize: 12, color: "#BF360C" }}>Run <code style={{ background: "#FFE0B2", padding: "1px 6px", borderRadius: 4 }}>node server.js</code> in the backend folder to start the API.</div>
                </div>
              )}

              {page === "dashboard"     && <DashboardPage dashboard={dashboard} loading={loading.dashboard} member={currentUser} role={role} setPage={setPage} />}
              {page === "contributions" && <ContributionsPage contributions={contributions} members={members} isAdmin={isAdmin} loading={loading.contributions} filterYear={filterYear} setFilterYear={setFilterYear} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterMember={filterMember} setFilterMember={setFilterMember} filterType={filterType} setFilterType={setFilterType} onConfirm={handleConfirmContrib} selectStyle={selectStyle} />}
              {page === "meetings"      && <MeetingsPage meetings={meetings} loading={loading.meetings} isAdmin={isAdmin} setSelectedMeeting={setSelectedMeeting} recording={recording} transcribing={transcribing} transcript={transcript} waveform={waveform} onStart={() => { setRecording(true); setTranscript(""); setWaveform([]); }} onStop={() => { setRecording(false); setTranscribing(true); simulateTranscript(setTranscript, () => setTranscribing(false)); }} />}
              {page === "record"  && isAdmin && <RecordPage members={members} summary={monthlySummary} loading={loading.summary || loading.record} recordForm={recordForm} setRecordForm={setRecordForm} onSubmit={handleRecordContrib} selectStyle={selectStyle} />}
              {page === "members" && isAdmin && <MembersPage members={members} loading={loading.members} onAdd={() => setAddMemberModal(true)} onToggle={handleToggleActive} onEdit={m => setEditMember(m)} />}
              {page === "settings"      && <SettingsPage role={role} currentUser={currentUser} onLogout={onLogout} />}
            </div>

            {/* Mobile bottom nav */}
            {viewMode === "mobile" && (
              <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#F7F6F2", borderTop: "1px solid #ECEAE4", display: "flex", padding: "8px 0 16px", zIndex: 100 }}>
                {NAV_ITEMS.filter(n => isAdmin || !["record","members"].includes(n.id)).map(item => (
                  <button key={item.id} className="nav-btn" onClick={() => setPage(item.id)} style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    border: "none", background: "transparent", padding: "4px 2px", borderRadius: 8,
                    color: page === item.id ? "#1A1A1A" : "#AAAAAA", transition: "color 0.15s",
                  }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: page === item.id ? 600 : 400 }}>{item.label}</span>
                    {page === item.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#1A1A1A", marginTop: -1 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals & Overlays */}
      {selectedMeeting && <PDFModal meeting={selectedMeeting} members={members} onClose={() => setSelectedMeeting(null)} />}
      {addMemberModal  && <AddMemberModal onClose={() => setAddMemberModal(false)} onAdd={handleAddMember} members={members} />}
      {editMember      && <EditMemberModal member={editMember} onClose={() => setEditMember(null)} onSave={handleEditMember} />}

      {/* Toast */}
      {toast && (
        <div className="toast-in" style={{ position: "fixed", bottom: 100, right: 20, zIndex: 9999, background: toast.type === "success" ? "#1A1A1A" : "#C62828", color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 28px rgba(0,0,0,0.25)", maxWidth: 300 }}>
          {toast.type === "success" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Transcription simulation (replace with real Whisper/AI API) ───────────────

function simulateTranscript(setTranscript, onDone) {
  const lines = [
    "Meeting called to order at 10:02 AM by the Chairman, Amara Ochieng.",
    "Secretary confirmed quorum — 24 members present.",
    "Treasurer presented contribution summary: KES 122,000 collected this month.",
    "Motion to approve previous minutes — proposed by Charles Kamau, seconded by George Otieno.",
    "Decision: Approved investment in T-Bills worth KES 500,000.",
    "Welfare update: Member Quincy Njoroge underwent surgery — welfare of KES 10,000 approved.",
    "Next meeting scheduled for June 14, 2025 at Panari Hotel.",
    "Meeting adjourned at 12:15 PM.",
  ];
  let i = 0;
  const t = setInterval(() => {
    if (i < lines.length) setTranscript(p => p + (p ? "\n\n" : "") + lines[i++]);
    else { clearInterval(t); onDone(); }
  }, 600);
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────

function DashboardPage({ dashboard, loading, member, role, setPage }) {
  if (loading) return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 24 }}><Skeleton h={14} w={80} /><div style={{ marginTop: 8 }}><Skeleton h={28} w={200} /></div></div>
      <Skeleton h={130} r={20} />
      <div style={{ marginTop: 12 }}><Skeleton h={100} r={16} /></div>
    </div>
  );

  const totalSavings    = dashboard?.total_savings    ?? 0;
  const monthlyExpected = dashboard?.monthly_expected ?? (member?.shares || 1) * 5000;
  const monthlyPaid     = dashboard?.monthly_paid     ?? 0;
  const isPaid          = dashboard?.contribution_status === "Paid";
  const pct             = Math.min((monthlyPaid / monthlyExpected) * 100, 100);

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, color: "#999" }}>Good morning,</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px", fontFamily: "'DM Serif Display', serif" }}>
          {member?.name?.split(" ")[0] ?? "…"} 👋
        </div>
      </div>

      {/* Hero card */}
      <div style={{ background: "#1C1C1E", borderRadius: 20, padding: 24, marginBottom: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(200,169,126,0.1)" }} />
        <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 8 }}>TOTAL SAVINGS</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-1px", fontFamily: "'DM Serif Display', serif" }}>{fmt(totalSavings)}</div>
        <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
          {[
            ["SHARES",  member?.shares ?? 1],
            ["MONTHLY", fmt(monthlyExpected)],
            ["ROLE",    role],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {i > 0 && <div style={{ width: 1, height: 28, background: "#333" }} />}
              <div>
                <div style={{ fontSize: 9, color: "#555", letterSpacing: 0.5 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#C8A97E", marginTop: 2 }}>{v}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly status */}
      <div className="card" style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{CURRENT_MONTH}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>{fmt(monthlyExpected)}</div>
          </div>
          <div style={{ padding: "6px 14px", borderRadius: 20, background: isPaid ? "#E8F5E9" : "#FFF3E0", color: isPaid ? "#2E7D32" : "#E65100", fontSize: 12, fontWeight: 600 }}>
            {isPaid ? "✓ Paid" : "○ Pending"}
          </div>
        </div>
        <div style={{ background: "#F0EEE8", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: isPaid ? "linear-gradient(90deg,#4CAF50,#66BB6A)" : "linear-gradient(90deg,#FF9800,#FFC107)", borderRadius: 6, transition: "width 1s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
          {isPaid ? `Paid ${fmt(monthlyPaid)}` : `${fmt(monthlyPaid)} of ${fmt(monthlyExpected)} paid · Due ${CURRENT_MONTH}`}
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <QuickCard title="Contribution History" sub="View all records" icon="◈" color="#E8F0FE" iconColor="#1565C0" onClick={() => setPage("contributions")} />
        <QuickCard title="Previous Meetings"    sub="View minutes"    icon="◉" color="#F3E5F5" iconColor="#6A1B9A" onClick={() => setPage("meetings")} />
      </div>

      {/* Recent contributions */}
      {dashboard?.recent_contributions?.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 14 }}>Recent Activity</div>
          {dashboard.recent_contributions.map((c, i, arr) => {
            const tm = TYPE_META[c.type] || TYPE_META.Contribution;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: i < arr.length - 1 ? 12 : 0, borderBottom: i < arr.length - 1 ? "1px solid #F5F4F0" : "none", marginBottom: i < arr.length - 1 ? 12 : 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.status === "Confirmed" ? "#4CAF50" : "#FF9800", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#333" }}>{c.type} — {c.month}</div>
                  <div style={{ fontSize: 10, color: "#BBB", marginTop: 1 }}>{c.method} · {c.ref}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: tm.text }}>{fmt(c.amount)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickCard({ title, sub, icon, color, iconColor, onClick }) {
  return (
    <button onClick={onClick} className="card btn" style={{ background: "#fff", borderRadius: 16, padding: 18, border: "none", textAlign: "left", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", width: "100%", cursor: "pointer" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: iconColor, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{sub}</div>
    </button>
  );
}

// ── Contributions Page ────────────────────────────────────────────────────────

function ContributionsPage({ contributions, members, isAdmin, loading, filterYear, setFilterYear, filterStatus, setFilterStatus, filterMember, setFilterMember, filterType, setFilterType, onConfirm, selectStyle }) {
  const totalShares   = members.filter(m => m.active).reduce((s,m) => s + (m.shares || 1), 0);
  const totalFines    = contributions.filter(c => c.type === "Fine").reduce((s,c) => s+c.amount, 0);
  const totalLateness = contributions.filter(c => c.type === "Lateness").reduce((s,c) => s+c.amount, 0);
  const grandTotal    = contributions.reduce((s,c) => s+c.amount, 0);
  const selectedMemberName = members.find(m => m.id === parseInt(filterMember))?.name;

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Contributions</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
          {isAdmin ? (filterMember !== "All" ? `Viewing: ${selectedMemberName}` : "All members") : "Your payment history"}
        </div>
      </div>

      {/* Summary hero */}
      <div style={{ background: "linear-gradient(135deg,#1C1C1E,#2A2A2E)", borderRadius: 20, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 10 }}>{filterYear} TOTAL</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-1px", marginBottom: 14 }}>{fmt(grandTotal)}</div>
        <div style={{ display: "flex", gap: 0 }}>
          {[["SHARES", `${totalShares} shares`, "#90CAF9"],["FINES", totalFines > 0 ? fmt(totalFines) : "—", "#FFAB91"],["LATENESS", totalLateness > 0 ? fmt(totalLateness) : "—", "#FFE082"]].map(([k,v,c],i) => (
            <div key={k} style={{ flex: 1, paddingLeft: i > 0 ? 12 : 0, paddingRight: i < 2 ? 12 : 0, borderRight: i < 2 ? "1px solid #333" : "none" }}>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "#ECEAE4", borderRadius: 10, padding: 3 }}>
            {[String(now.getFullYear()-1), String(now.getFullYear())].map(y => (
              <button key={y} onClick={() => setFilterYear(y)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: filterYear === y ? "#fff" : "transparent", color: filterYear === y ? "#1A1A1A" : "#888", boxShadow: filterYear === y ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>{y}</button>
            ))}
          </div>
          <div style={{ display: "flex", background: "#ECEAE4", borderRadius: 10, padding: 3 }}>
            {["All","Confirmed","Pending"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: filterStatus === s ? "#fff" : "transparent", color: filterStatus === s ? "#1A1A1A" : "#888", boxShadow: filterStatus === s ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>{s}</button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterMember} onChange={e => setFilterMember(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              <option value="All">All Members</option>
              {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{
              ...selectStyle,
              fontWeight: filterType !== "All" ? 700 : 400,
              color: filterType !== "All" ? TYPE_META[filterType]?.text : "#1A1A1A",
              background: filterType !== "All" ? TYPE_META[filterType]?.bg : "#fff",
              borderColor: filterType !== "All" ? TYPE_META[filterType]?.border : "#ECEAE4",
            }}>
              <option value="All">All Types</option>
              <option value="Contribution">Contribution (min KES 5,000)</option>
              <option value="Fine">Fine (KES 500)</option>
              <option value="Lateness">Lateness (KES 200)</option>
            </select>
          </div>
        )}

        {(filterMember !== "All" || filterType !== "All") && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filterMember !== "All" && (
              <Chip label={`👤 ${selectedMemberName?.split(" ")[0]}`} onRemove={() => setFilterMember("All")} dark />
            )}
            {filterType !== "All" && (
              <Chip label={`${TYPE_META[filterType]?.icon} ${filterType}`} onRemove={() => setFilterType("All")} bg={TYPE_META[filterType]?.bg} color={TYPE_META[filterType]?.text} border={TYPE_META[filterType]?.border} />
            )}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#BBB", marginBottom: 12 }}>{loading ? "Loading…" : `${contributions.length} record${contributions.length !== 1 ? "s" : ""}`}</div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(k => <Skeleton key={k} h={100} r={14} />)}
        </div>
      ) : contributions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#CCC" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>◌</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>No records match your filters</div>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "#ECEAE4" }} />
          {contributions.map((c, i) => {
            const tm = TYPE_META[c.type] || TYPE_META.Contribution;
            return (
              <div key={c.id} style={{ display: "flex", gap: 14, marginBottom: 14, position: "relative", animation: `fadeUp 0.25s ease ${Math.min(i,12)*0.04}s both` }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, zIndex: 1, background: tm.bg, border: `2px solid ${tm.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: tm.text, fontSize: 15 }}>
                  {c.status === "Confirmed" ? tm.icon : "○"}
                </div>
                <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", borderLeft: `3px solid ${tm.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{c.month}</div>
                      {filterMember === "All" && isAdmin && <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{c.member_name}</div>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tm.text }}>{fmt(c.amount)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: c.status === "Pending" && isAdmin ? 10 : 0 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: tm.bg, color: tm.text, fontSize: 11, fontWeight: 700, border: `1px solid ${tm.border}` }}>{tm.icon} {c.type}</span>
                    <Tag label={c.method} color={c.method === "M-Pesa" ? "#E3F2FD" : "#F3E5F5"} text={c.method === "M-Pesa" ? "#1565C0" : "#6A1B9A"} />
                    <Tag label={c.status} color={c.status === "Confirmed" ? "#E8F5E9" : "#FFF3E0"} text={c.status === "Confirmed" ? "#2E7D32" : "#E65100"} />
                  </div>
                  {c.status === "Pending" && isAdmin && (
                    <button className="btn" onClick={() => onConfirm(c.id)} style={{ background: "#1A1A1A", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                      Confirm Payment
                    </button>
                  )}
                  <div style={{ fontSize: 10, color: "#CCC", marginTop: 8 }}>Ref: {c.ref || "—"} · {c.created_at?.slice(0,16)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove, dark, bg, color, border }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: dark ? "#1A1A1A" : bg, color: dark ? "#F0EDE6" : color, border: border ? `1px solid ${border}` : "none", padding: "4px 10px 4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {label}
      <button onClick={onRemove} style={{ background: "rgba(128,128,128,0.2)", border: "none", color: "inherit", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, cursor: "pointer", padding: 0 }}>✕</button>
    </div>
  );
}

// ── Meetings Page ─────────────────────────────────────────────────────────────

function MeetingsPage({ meetings, loading, isAdmin, setSelectedMeeting, recording, transcribing, transcript, waveform, onStart, onStop }) {
  const [showRec, setShowRec] = useState(false);

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Meetings</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{meetings.length} meetings</div>
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => setShowRec(v => !v)} style={{ background: showRec ? "#1A1A1A" : "linear-gradient(135deg,#C8A97E,#A07850)", color: "#fff", border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}>
            {showRec ? "✕ Close" : "⏺ Record AI"}
          </button>
        )}
      </div>

      {/* AI Recorder */}
      {showRec && (
        <div style={{ background: "#1C1C1E", borderRadius: 20, padding: 20, marginBottom: 20 }} className="fade-up">
          <div style={{ fontSize: 13, fontWeight: 600, color: "#F7F6F2", marginBottom: 14 }}>🎙 AI Meeting Recorder</div>
          <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginBottom: 14, overflow: "hidden" }}>
            {recording ? (
              waveform.map((h,i) => <div key={i} style={{ width: 3, height: h, background: "#C8A97E", borderRadius: 2, transition: "height 0.05s" }} />)
            ) : (
              Array.from({length: 30}).map((_,i) => <div key={i} style={{ width: 3, height: 8, background: "#333", borderRadius: 2 }} />)
            )}
          </div>
          {!recording && !transcribing && !transcript && (
            <button className="btn" onClick={onStart} style={{ width: "100%", background: "#C8A97E", color: "#1A1A1A", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700 }}>⏺ Start Recording</button>
          )}
          {recording && (
            <button className="btn" onClick={onStop} style={{ width: "100%", background: "#EF5350", color: "#fff", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, animation: "pulse 1.5s infinite" }}>⏹ Stop Recording</button>
          )}
          {transcribing && <div style={{ fontSize: 12, color: "#888", animation: "pulse 1s infinite" }}>◌ Generating minutes…</div>}
          {transcript && (
            <div style={{ background: "#111", borderRadius: 12, padding: 14, maxHeight: 200, overflowY: "auto", marginTop: 12 }}>
              <div style={{ fontSize: 10, color: "#C8A97E", marginBottom: 8, letterSpacing: 0.5 }}>TRANSCRIPT</div>
              <div style={{ fontSize: 12, color: "#CCC", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{transcript}</div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button style={{ flex: 1, background: "#C8A97E", color: "#1A1A1A", border: "none", borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 700 }}>💾 Save Draft</button>
                <button style={{ flex: 1, background: "#333", color: "#F0EDE6", border: "none", borderRadius: 10, padding: "10px", fontSize: 12 }}>📄 Export PDF</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1,2,3].map(k => <Skeleton key={k} h={140} r={16} />)}</div>
      ) : meetings.map((m, i) => (
        <div key={m.id} style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", animation: `fadeUp 0.3s ease ${i*0.07}s both` }} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{m.date}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>📍 {m.location}</div>
              {m.agenda && <div style={{ fontSize: 11, color: "#BBB", marginTop: 2 }}>📋 {m.agenda}</div>}
            </div>
            <Tag label={m.status} color={m.status === "Approved" ? "#E8F5E9" : "#FFF8E1"} text={m.status === "Approved" ? "#2E7D32" : "#F57F17"} />
          </div>
          <div style={{ display: "flex", gap: 16, paddingBottom: 12, borderBottom: "1px solid #F5F4F0", marginBottom: 12 }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{m.attendance_count ?? m.attendance ?? 0}</div><div style={{ fontSize: 10, color: "#999" }}>Present</div></div>
            <div style={{ width: 1, background: "#F0EEE8" }} />
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 700, color: (m.total_collected||0) > 0 ? "#1A1A1A" : "#CCC" }}>{(m.total_collected||0) > 0 ? fmt(m.total_collected) : "—"}</div><div style={{ fontSize: 10, color: "#999" }}>Collected</div></div>
            {m.decisions?.length > 0 && <><div style={{ width: 1, background: "#F0EEE8" }} /><div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{m.decisions.length}</div><div style={{ fontSize: 10, color: "#999" }}>Decisions</div></div></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setSelectedMeeting(m)} style={{ flex: 2, background: "#F0EEE8", color: "#1A1A1A", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>📄 View Minutes</button>
            {isAdmin && (
              <>
                <button className="btn" style={{ flex: 1, background: "#E8F5E9", color: "#2E7D32", border: "none", borderRadius: 10, padding: "9px 8px", fontSize: 11, fontWeight: 600 }}>Propose</button>
                <button className="btn" style={{ flex: 1, background: "#E3F2FD", color: "#1565C0", border: "none", borderRadius: 10, padding: "9px 8px", fontSize: 11, fontWeight: 600 }}>Second</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Record Contribution Page ───────────────────────────────────────────────────

function RecordPage({ members, summary, loading, recordForm, setRecordForm, onSubmit, selectStyle }) {
  const expected    = summary?.totalExpected ?? 130000;
  const paid        = summary?.totalPaid ?? 0;
  const outstanding = expected - paid;
  const paidCount   = summary?.rows?.filter(r => r.paid_contrib >= r.expected).length ?? 0;

  const F = recordForm;
  const setF = (k, v) => setRecordForm(f => ({ ...f, [k]: v }));

  const minAmount = F.type === "Contribution" ? 5000 : F.type === "Fine" ? 500 : 200;

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Record Contribution</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{CURRENT_MONTH}</div>
      </div>

      {/* Monthly summary card */}
      <div style={{ background: "#1C1C1E", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 12 }}>{CURRENT_MONTH.toUpperCase()} SUMMARY</div>
        {loading ? <Skeleton h={60} w="100%" /> : (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <div><div style={{ fontSize: 9, color: "#666" }}>EXPECTED</div><div style={{ fontSize: 18, fontWeight: 700, color: "#F7F6F2", marginTop: 2 }}>{fmt(expected)}</div></div>
              <div style={{ width: 1, background: "#333" }} />
              <div><div style={{ fontSize: 9, color: "#666" }}>COLLECTED</div><div style={{ fontSize: 18, fontWeight: 700, color: "#4CAF50", marginTop: 2 }}>{fmt(paid)}</div></div>
              <div style={{ width: 1, background: "#333" }} />
              <div><div style={{ fontSize: 9, color: "#666" }}>OUTSTANDING</div><div style={{ fontSize: 18, fontWeight: 700, color: "#FF7043", marginTop: 2 }}>{fmt(outstanding)}</div></div>
            </div>
            <div style={{ background: "#333", borderRadius: 6, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.min((paid / expected)*100,100)}%`, height: "100%", background: "linear-gradient(90deg,#4CAF50,#66BB6A)", borderRadius: 6, transition: "width 1s ease" }} />
            </div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>{paidCount} of {summary?.rows?.length ?? 26} members paid</div>
          </>
        )}
      </div>

      {/* Record form */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 16 }}>New Entry</div>

        <Label text="MEMBER">
          <select value={F.member_id} onChange={e => setF("member_id", e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            <option value="">Select member…</option>
            {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Label>

        <Label text="TYPE">
          <select value={F.type} onChange={e => { setF("type", e.target.value); setF("amount", e.target.value === "Contribution" ? "5000" : e.target.value === "Fine" ? "500" : "200"); }} style={{ ...selectStyle, width: "100%", color: TYPE_META[F.type]?.text, background: TYPE_META[F.type]?.bg, borderColor: TYPE_META[F.type]?.border }}>
            <option value="Contribution">Contribution (min KES 5,000)</option>
            <option value="Fine">Fine (KES 500)</option>
            <option value="Lateness">Lateness (KES 200)</option>
          </select>
        </Label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Label text="AMOUNT">
            <input type="number" min={minAmount} value={F.amount} onChange={e => setF("amount", e.target.value)} style={{ ...selectStyle, width: "100%", paddingRight: 14 }} />
          </Label>
          <Label text="METHOD">
            <select value={F.method} onChange={e => setF("method", e.target.value)} style={{ ...selectStyle, width: "100%" }}>
              <option>M-Pesa</option>
              <option>Bank Slip</option>
            </select>
          </Label>
        </div>

        <Label text="REFERENCE">
          <input placeholder="Transaction reference…" value={F.ref} onChange={e => setF("ref", e.target.value)} style={{ ...selectStyle, width: "100%", paddingRight: 14 }} />
        </Label>

        <Label text="PROOF OF PAYMENT">
          <div style={{ border: "2px dashed #ECEAE4", borderRadius: 12, padding: "18px", textAlign: "center", background: "#F7F6F2", cursor: "pointer" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>⬆</div>
            <div style={{ fontSize: 12, color: "#BBB" }}>Upload image or screenshot</div>
          </div>
        </Label>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, marginTop: 4 }}>
          <div onClick={() => setF("confirmed", !F.confirmed)} style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid", borderColor: F.confirmed ? "#1A1A1A" : "#CCC", background: F.confirmed ? "#1A1A1A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
            {F.confirmed && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
          </div>
          <div style={{ fontSize: 13, color: "#555" }}>Mark as Confirmed</div>
        </div>

        <button className="btn" onClick={onSubmit} disabled={loading} style={{ width: "100%", background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? <><Spinner /> Saving…</> : "Save Contribution"}
        </button>
      </div>

      {/* Members table */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F5F4F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Member Balances</div>
          <div style={{ fontSize: 11, color: "#999" }}>{CURRENT_MONTH}</div>
        </div>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 20 }}><Skeleton h={40} /><div style={{ marginTop: 10 }}><Skeleton h={40} /></div></div>
          ) : (summary?.rows ?? []).map((r, i) => {
            const bal = r.expected - r.paid_contrib;
            return (
              <div key={r.id} style={{ padding: "12px 20px", borderBottom: "1px solid #F9F8F5", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: bal <= 0 ? "#E8F5E9" : "#FFF3E0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: bal <= 0 ? "#2E7D32" : "#E65100", flexShrink: 0 }}>
                  {r.name?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "#999" }}>{r.shares} share{r.shares > 1 ? "s" : ""} · {fmt(r.expected)}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: bal <= 0 ? "#2E7D32" : "#CCC" }}>{bal <= 0 ? fmt(r.paid_contrib) : "—"}</div>
                  {bal > 0 && <div style={{ fontSize: 10, color: "#FF7043" }}>-{fmt(bal)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Label({ text, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>{text}</div>
      {children}
    </div>
  );
}

// ── Members Page ──────────────────────────────────────────────────────────────

function MembersPage({ members, loading, onAdd, onToggle, onEdit }) {
  const active = members.filter(m => m.active).length;
  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Members</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{active} active</div>
        </div>
        <button className="btn" onClick={onAdd} style={{ background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 12, padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>+ Add</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[["Chairman",members.filter(m=>m.role==="Chairman"&&m.active).length,"#FFF8E1","#F57F17"],["Secretary",members.filter(m=>m.role==="Secretary"&&m.active).length,"#E8F5E9","#2E7D32"],["Members",members.filter(m=>m.role==="Member"&&m.active).length,"#E3F2FD","#1565C0"]].map(([r,c,bg,tc]) => (
          <div key={r} style={{ background: bg, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: tc }}>{c}</div>
            <div style={{ fontSize: 9, color: tc, opacity: 0.8, marginTop: 2 }}>{r}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1,2,3,4].map(k => <Skeleton key={k} h={80} r={14} />)}</div>
      ) : members.map((m, i) => (
        <div key={m.id} style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", animation: `fadeUp 0.25s ease ${Math.min(i,10)*0.04}s both`, opacity: m.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: m.role === "Chairman" ? "linear-gradient(135deg,#FFD54F,#FF8F00)" : m.role === "Secretary" ? "linear-gradient(135deg,#81C784,#2E7D32)" : "linear-gradient(135deg,#90CAF9,#1565C0)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {m.name?.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{m.name}</div>
                {!m.active && <Tag label="Inactive" color="#F5F4F0" text="#999" />}
              </div>
              <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{m.role} · {m.shares} share{m.shares > 1 ? "s" : ""} · {m.phone}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => onEdit(m)} style={{ flex: 1, background: "#F0EEE8", color: "#1A1A1A", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11, fontWeight: 600 }}>
              ✎ Edit Details
            </button>
            <button className="btn" onClick={() => onToggle(m.id, !!m.active)} style={{ flex: 1, background: m.active ? "#FFF3E0" : "#E8F5E9", color: m.active ? "#E65100" : "#2E7D32", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11, fontWeight: 600 }}>
              {m.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

function SettingsPage({ role, currentUser, onLogout }) {
  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Settings</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Chama configuration</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 14 }}>Chama Details</div>
        {[["Name","Kabazim Reloded"],["Meeting Day","Monthly"],["Members","18"],["Share Value","KES 5,000 / month"]].map(([k,v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F5F4F0" }}>
            <div style={{ fontSize: 12, color: "#999" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#1A1A1A" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Profile card */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 14 }}>Profile</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", background: "linear-gradient(135deg,#C8A97E,#A07850)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18 }}>{currentUser?.name?.charAt(0) ?? "?"}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{currentUser?.name ?? "Loading…"}</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{role} · {currentUser?.phone}</div>
          </div>
        </div>
        <button className="btn" onClick={onLogout} style={{ width: "100%", background: "#1C1C1E", color: "#F7F6F2", border: "none", borderRadius: 12, padding: "13px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          Sign Out
        </button>
      </div>

      <div style={{ background: "#F0EEE8", borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#A07850", marginBottom: 4 }}>API Connected</div>
        <div style={{ fontSize: 12, color: "#999" }}>Backend running on Railway</div>
      </div>
    </div>
  );
}

// ── PDF Preview Modal ─────────────────────────────────────────────────────────

function PDFModal({ meeting, members, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="slide-up" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #ECEAE4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Meeting Minutes</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "#F0EEE8", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📥 Export PDF</button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, color: "#999", cursor: "pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "28px 28px 40px", fontFamily: "Georgia, serif" }}>
          <div style={{ textAlign: "center", marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #1A1A1A" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#666", marginBottom: 6 }}>OFFICIAL MEETING MINUTES</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1A1A1A" }}>Kabazim Reloded</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Registered Chama · Kenya</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[["DATE", meeting.date],["LOCATION", meeting.location],["PRESENT", meeting.attendance_count ?? "—"],["STATUS", meeting.status]].map(([k,v]) => (
              <div key={k}><div style={{ fontSize: 8, color: "#999", letterSpacing: 1 }}>{k}</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{v}</div></div>
            ))}
          </div>
          <PDFSection title="1. AGENDA">{meeting.agenda || "General monthly meeting"}</PDFSection>
          <PDFSection title="2. CONTRIBUTION SUMMARY">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#1A1A1A", color: "#fff" }}>
                  {["#","Member","Shares","Expected","Status"].map(h => <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.slice(0,26).map((m, i) => (
                  <tr key={m.id} style={{ background: i%2===0 ? "#F9F8F6" : "#fff" }}>
                    <td style={{ padding: "6px 8px", color: "#999", fontSize: 10 }}>{i+1}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{m.shares}</td>
                    <td style={{ padding: "6px 8px" }}>{fmt(m.shares * 5000)}</td>
                    <td style={{ padding: "6px 8px", color: i < 22 ? "#2E7D32" : "#E65100", fontWeight: 600, fontSize: 10 }}>{i < 22 ? "✓ Paid" : "Pending"}</td>
                  </tr>
                ))}
                <tr style={{ background: "#1A1A1A", color: "#fff", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "9px 8px" }}>TOTAL</td>
                  <td style={{ padding: "9px 8px" }}>{fmt(130000)}</td>
                  <td style={{ padding: "9px 8px", color: "#C8A97E" }}>{meeting.total_collected > 0 ? fmt(meeting.total_collected) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </PDFSection>
          <PDFSection title="3. SIGNATORIES">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 8 }}>
              {["Chairman — Godfrey Kimani","Secretary — Lydia Kibe"].map(s => (
                <div key={s} style={{ textAlign: "center" }}>
                  <div style={{ height: 36, borderBottom: "1px solid #1A1A1A", marginBottom: 6 }} />
                  <div style={{ fontSize: 10, color: "#666" }}>{s}</div>
                </div>
              ))}
            </div>
          </PDFSection>
        </div>
      </div>
    </div>
  );
}

function PDFSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#1A1A1A", textTransform: "uppercase", borderBottom: "1px solid #ECEAE4", paddingBottom: 6, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────

function AddMemberModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", shares: "1", role: "Member" });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await onAdd({ ...form, shares: parseInt(form.shares) || 1 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="fade-up" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Add New Member</div>
          <button onClick={onClose} style={{ background: "#F0EEE8", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {[["Full Name","text","e.g. Alice Mwangi","name"],["Phone","tel","07XX XXX XXX","phone"],["Email","email","alice@email.com","email"]].map(([l,t,p,k]) => (
          <div key={k} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>{l.toUpperCase()}</div>
            <input type={t} placeholder={p} value={form[k]} onChange={e => setF(k, e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ECEAE4", background: "#F7F6F2", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>SHARES</div>
            <input type="number" min={1} value={form.shares} onChange={e => setF("shares", e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ECEAE4", background: "#F7F6F2", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>ROLE</div>
            <select value={form.role} onChange={e => setF("role", e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ECEAE4", background: "#F7F6F2", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
              <option>Member</option><option>Secretary</option><option>Chairman</option>
            </select>
          </div>
        </div>
        <button className="btn" onClick={handleSubmit} disabled={saving || !form.name} style={{ width: "100%", background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", opacity: !form.name ? 0.5 : 1 }}>
          {saving ? <><Spinner /> Adding…</> : "Add Member"}
        </button>
      </div>
    </div>
  );
}

// ── Edit Member Modal ─────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSave }) {
  const [form, setForm] = useState({
    name:   member.name   || "",
    phone:  member.phone  || "",
    shares: String(member.shares || 1),
    role:   member.role   || "Member",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const roleColor = { Chairman: "#F57F17", Secretary: "#2E7D32", Member: "#1565C0" };
  const roleBg    = { Chairman: "#FFF8E1", Secretary: "#E8F5E9", Member: "#E3F2FD" };

  const changed =
    form.name !== member.name ||
    form.phone !== member.phone ||
    form.shares !== String(member.shares) ||
    form.role !== member.role;

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) return setError("Name and phone are required.");
    setSaving(true);
    setError(null);
    try {
      await onSave(member.id, { name: form.name.trim(), phone: form.phone.trim(), shares: parseInt(form.shares) || 1, role: form.role });
    } catch (e) {
      setError(e.message || "Failed to save.");
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: "13px 14px", borderRadius: 12, border: "1.5px solid #ECEAE4", background: "#F9F8F5", fontSize: 14, fontFamily: "inherit", outline: "none", color: "#1A1A1A", transition: "border-color 0.15s" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="fade-up" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A" }}>Edit Member</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>Changes are saved to the database</div>
          </div>
          <button onClick={onClose} style={{ background: "#F0EEE8", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Avatar preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#F7F6F2", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: form.role === "Chairman" ? "linear-gradient(135deg,#FFD54F,#FF8F00)" : form.role === "Secretary" ? "linear-gradient(135deg,#81C784,#2E7D32)" : "linear-gradient(135deg,#90CAF9,#1565C0)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            {form.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{form.name || "—"}</div>
            <div style={{ display: "inline-block", marginTop: 4, padding: "2px 10px", borderRadius: 20, background: roleBg[form.role], color: roleColor[form.role], fontSize: 10, fontWeight: 700 }}>{form.role}</div>
          </div>
        </div>

        {/* Fields */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>FULL NAME</div>
          <input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Full name" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>PHONE NUMBER</div>
          <input type="tel" value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="07XX XXX XXX" style={inputStyle} />
          <div style={{ fontSize: 10, color: "#BBB", marginTop: 4 }}>This is the number used to log in</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>SHARES</div>
            <input type="number" min={1} max={10} value={form.shares} onChange={e => setF("shares", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>ROLE</div>
            <select value={form.role} onChange={e => setF("role", e.target.value)} style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
              <option value="Member">Member</option>
              <option value="Secretary">Secretary</option>
              <option value="Chairman">Chairman</option>
            </select>
          </div>
        </div>

        {error && <div style={{ background: "#FBE9E7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#BF360C", fontWeight: 500 }}>{error}</div>}

        <button className="btn" onClick={handleSubmit} disabled={saving || !changed} style={{ width: "100%", background: changed && !saving ? "#1A1A1A" : "#ECEAE4", color: changed && !saving ? "#F7F6F2" : "#BBB", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
          {saving ? <><Spinner /> Saving…</> : changed ? "Save Changes" : "No Changes"}
        </button>
      </div>
    </div>
  );
}
