import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as api from "./api.js";
import LoginPage    from "./LoginPage.jsx";
import ChangePinPage from "./ChangePinPage.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`;

const now = new Date();
// M2: computed as a function so it stays accurate across month boundaries
const getCurrentMonth = () => {
  const d = new Date();
  return d.toLocaleString("en-GB", { month: "long" }) + " " + d.getFullYear();
};
const CURRENT_MONTH = getCurrentMonth();

const TYPE_META = {
  Contribution: { icon: "◈", bg: "#E8F0FE", text: "#1565C0", border: "#90CAF9" },
  Fine:         { icon: "⚑", bg: "#FBE9E7", text: "#BF360C", border: "#FFAB91" },
  Lateness:     { icon: "◷", bg: "#FFF8E1", text: "#E65100", border: "#FFE082" },
};

const NAV_ITEMS = [
  { id: "dashboard",     label: "Dashboard",     icon: "⊞" },
  { id: "contributions", label: "Contributions", icon: "◈" },
  { id: "meetings",      label: "Meetings",      icon: "◉" },
  { id: "record",        label: "Record",        icon: "⊕", adminOnly: true },
  { id: "members",       label: "Members",       icon: "◎" },
  { id: "report",        label: "Annual Report", icon: "▤", adminOnly: true },
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
  const [viewMode, setViewMode] = useState(() => window.innerWidth >= 640 ? "desktop" : "mobile");

  useEffect(() => {
    const onResize = () => setViewMode(window.innerWidth >= 640 ? "desktop" : "mobile");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const [transcriptMeeting, setTranscriptMeeting] = useState(null);
  const [addMemberModal,   setAddMemberModal]   = useState(false);
  const [editMember,       setEditMember]       = useState(null);
  const [recordForm,       setRecordForm]       = useState({ member_id: "", type: "Contribution", month: CURRENT_MONTH, amount: "5000", method: "M-Pesa", ref: "", confirmed: false });
  const [apiOnline,        setApiOnline]        = useState(null);


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
  const loadDashboard = useCallback(() => {
    if (!currentUser) return;
    setLoad("dashboard", true);
    api.getDashboard(currentUser.id)
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoad("dashboard", false));
  }, [currentUser]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

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
  }, [page, filterYear, filterStatus, filterMember, filterType, currentUser, isAdmin]);

  // ── Fetch meetings when on meetings page ──
  const loadMeetings = useCallback(() => {
    setLoad("meetings", true);
    api.getMeetings()
      .then(data => {
        setMeetings(data);
        // keep the open minutes panel in sync with fresh data
        setTranscriptMeeting(prev => prev ? (data.find(m => m.id === prev.id) ?? prev) : null);
      })
      .catch(() => showToast("Failed to load meetings", "error"))
      .finally(() => setLoad("meetings", false));
  }, [showToast]);

  useEffect(() => {
    if (page !== "meetings") return;
    loadMeetings();
  }, [page]);

  // ── Refetch contributions for Record page summary ──
  const [monthlySummary, setMonthlySummary] = useState(null);
  useEffect(() => {
    if (page !== "record") return;
    setLoad("summary", true);
    api.getMonthlySummary(getCurrentMonth())
      .then(setMonthlySummary)
      .catch(() => {})
      .finally(() => setLoad("summary", false));
  }, [page]);

  // ── Annual report ──
  const [annualReport,     setAnnualReport]     = useState(null);
  const [reportYear,       setReportYear]       = useState(String(now.getFullYear()));
  useEffect(() => {
    if (page !== "report") return;
    setLoad("report", true);
    api.getAnnualReport(reportYear)
      .then(setAnnualReport)
      .catch(() => showToast("Failed to load report", "error"))
      .finally(() => setLoad("report", false));
  }, [page, reportYear]);

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
      setRecordForm(f => ({ ...f, member_id: "", amount: "5000", ref: "", confirmed: false }));
      // Refresh summary
      const s = await api.getMonthlySummary(CURRENT_MONTH);
      setMonthlySummary(s);
    } catch (e) {
      showToast(e.message || "Failed to record", "error");
    } finally {
      setLoad("record", false);
    }
  };

  // ── Bulk import contributions ──
  const handleBulkImport = async (month, entries) => {
    try {
      setLoad("record", true);
      const result = await api.bulkImportContributions({ month, entries });
      showToast(`${result.inserted} contributions imported for ${month}`);
      const s = await api.getMonthlySummary(CURRENT_MONTH);
      setMonthlySummary(s);
      return true;
    } catch (e) {
      showToast(e.message || "Bulk import failed", "error");
      return false;
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
  const [confirmingId, setConfirmingId] = useState(null);
  const handleConfirmContrib = async (id) => {
    if (confirmingId) return; // L5: prevent double-confirm
    setConfirmingId(id);
    try {
      await api.updateContribution(id, { status: "Confirmed" });
      setContributions(prev => prev.map(c => c.id === id ? { ...c, status: "Confirmed" } : c));
      showToast("Contribution confirmed");
    } catch (e) {
      showToast("Failed to confirm", "error");
    } finally {
      setConfirmingId(null);
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
        @keyframes fadeUp    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes slideRight{ from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes toastIn   { from{transform:translateX(120%)} to{transform:translateX(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.4} }
        .fade-up    { animation: fadeUp 0.3s ease both; }
        .slide-up   { animation: slideUp 0.3s cubic-bezier(.4,0,.2,1) forwards; }
        .slide-right{ animation: slideRight 0.28s cubic-bezier(.4,0,.2,1) forwards; }
        .toast-in   { animation: toastIn 0.3s ease forwards; }
        .nav-btn:hover { background: rgba(0,0,0,0.04); }
        .card:hover { transform:translateY(-1px); box-shadow:0 8px 28px rgba(0,0,0,0.1)!important; transition:all 0.2s; }
        .btn:hover  { filter:brightness(1.06); transform:translateY(-1px); }
        .btn:active { transform:scale(0.97); }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:0; }
        input,select,textarea { font-family:inherit; }
        button { cursor:pointer; font-family:inherit; }
      `}</style>

      {/* ── Top bar (desktop only) ── */}
      {viewMode === "desktop" && (
        <div style={{ background: "#1A1A1A", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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
            <button onClick={onLogout} style={{ background: "#2A2A2A", border: "none", color: "#999", borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
      )}

      {/* ── App shell ── */}
      <div style={{ display: "flex", width: "100%", minHeight: viewMode === "desktop" ? "calc(100vh - 46px)" : "100vh", background: "#F7F6F2" }}>

        {/* Desktop sidebar */}
        {viewMode === "desktop" && (
          <div style={{ width: 240, minWidth: 240, background: "#1C1C1E", display: "flex", flexDirection: "column", padding: "32px 0", position: "sticky", top: 0, height: "calc(100vh - 46px)", overflowY: "auto" }}>
            <div style={{ padding: "0 24px 28px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-0.5px" }}>Kabazim Reloded</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 2, letterSpacing: 1 }}>SAVINGS PLATFORM</div>
            </div>
            <div style={{ padding: "0 12px", flex: 1 }}>
              {NAV_ITEMS.filter(n => isAdmin || !n.adminOnly).map(item => (
                <button key={item.id} className="nav-btn" onClick={() => setPage(item.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px",
                  borderRadius: 10, border: "none", marginBottom: 2, textAlign: "left", transition: "all 0.15s",
                  background: page === item.id ? "rgba(200,169,126,0.15)" : "transparent",
                  color: page === item.id ? "#F0EDE6" : "#666",
                  fontWeight: page === item.id ? 600 : 400, fontSize: 13, cursor: "pointer",
                }}>
                  <span style={{ fontSize: 16, opacity: page === item.id ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                  {page === item.id && <div style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: "#C8A97E" }} />}
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
                  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{role}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
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
          <div style={{ flex: 1, overflowY: "auto", padding: viewMode === "mobile" ? "0 0 80px" : 0 }}>
            {!apiOnline && apiOnline !== null && (
              <div style={{ margin: 20, background: "#FFF3E0", borderRadius: 14, padding: 16, borderLeft: "4px solid #FF9800" }}>
                <div style={{ fontWeight: 700, color: "#E65100", marginBottom: 4 }}>API server is offline</div>
                <div style={{ fontSize: 12, color: "#BF360C" }}>Run <code style={{ background: "#FFE0B2", padding: "1px 6px", borderRadius: 4 }}>node server.js</code> in the backend folder to start the API.</div>
              </div>
            )}

            <div style={{ padding: viewMode === "desktop" ? "36px 48px" : 0 }}>
              {page === "dashboard"     && <DashboardPage dashboard={dashboard} loading={loading.dashboard} member={currentUser} role={role} setPage={setPage} viewMode={viewMode} onRefresh={loadDashboard} />}
              {page === "contributions" && <ContributionsPage contributions={contributions} members={members} isAdmin={isAdmin} loading={loading.contributions} filterYear={filterYear} setFilterYear={setFilterYear} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterMember={filterMember} setFilterMember={setFilterMember} filterType={filterType} setFilterType={setFilterType} onConfirm={handleConfirmContrib} confirmingId={confirmingId} selectStyle={selectStyle} />}
              {page === "meetings"      && <MeetingsPage meetings={meetings} loading={loading.meetings} isAdmin={isAdmin} currentUser={currentUser} setSelectedMeeting={setSelectedMeeting} setTranscriptMeeting={setTranscriptMeeting} showToast={showToast} onRefresh={loadMeetings} viewMode={viewMode} />}
              {page === "record"  && isAdmin && <RecordPage members={members} summary={monthlySummary} loading={loading.summary || loading.record} recordForm={recordForm} setRecordForm={setRecordForm} onSubmit={handleRecordContrib} onBulkImport={handleBulkImport} selectStyle={selectStyle} />}
              {page === "members" && isAdmin && <MembersPage members={members} loading={loading.members} onAdd={() => setAddMemberModal(true)} onToggle={handleToggleActive} onEdit={m => setEditMember(m)} viewMode={viewMode} />}
              {page === "report"  && isAdmin && <AnnualReportPage report={annualReport} loading={loading.report} year={reportYear} setYear={setReportYear} />}
              {page === "settings"      && <SettingsPage role={role} currentUser={currentUser} onLogout={onLogout} memberCount={members.filter(m => m.active).length} />}
            </div>
          </div>

          {/* Mobile bottom nav */}
          {viewMode === "mobile" && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#F7F6F2", borderTop: "1px solid #ECEAE4", display: "flex", padding: "8px 0 16px", zIndex: 100 }}>
              {NAV_ITEMS.filter(n => isAdmin || !n.adminOnly).map(item => (
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

      {/* Modals & Overlays */}

      {selectedMeeting   && <PDFModal meeting={selectedMeeting} members={members} onClose={() => setSelectedMeeting(null)} />}
      {transcriptMeeting && viewMode === "desktop" && <TranscriptPanel meeting={transcriptMeeting} onClose={() => setTranscriptMeeting(null)} />}
      {addMemberModal    && <AddMemberModal onClose={() => setAddMemberModal(false)} onAdd={handleAddMember} members={members} />}
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


// ── Dashboard Page ─────────────────────────────────────────────────────────────

function DashboardPage({ dashboard, loading, member, role, setPage, viewMode, onRefresh }) {
  const isDesktop = viewMode === "desktop";
  if (loading) return (
    <div style={{ padding: isDesktop ? 0 : 20 }}>
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

  const heroCard = (
    <div style={{ background: "#1C1C1E", borderRadius: 20, padding: 24, marginBottom: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(200,169,126,0.1)" }} />
      <button onClick={onRefresh} disabled={loading} className="refresh-btn" data-tooltip="Refresh balance"
        style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "default" : "pointer", color: "#C8A97E", fontSize: 20, transition: "background 0.15s", zIndex: 1 }}>
        <span style={{ display: "inline-block", animation: loading ? "spin 0.8s linear infinite" : "none" }}>↻</span>
      </button>
      <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 8 }}>TOTAL SAVINGS</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-1px", fontFamily: "'DM Serif Display', serif" }}>{fmt(totalSavings)}</div>
      <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
        {[["SHARES", member?.shares ?? 1], ["MONTHLY", fmt(monthlyExpected)], ["ROLE", role]].map(([k, v], i) => (
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
  );

  const monthlyCard = (
    <div className="card" style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", position: "relative" }}>
      <button onClick={onRefresh} disabled={loading} className="refresh-btn" data-tooltip="Refresh contributions"
        style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.04)", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "default" : "pointer", color: "#1A1A1A", fontSize: 20, transition: "background 0.15s", zIndex: 1 }}>
        <span style={{ display: "inline-block", animation: loading ? "spin 0.8s linear infinite" : "none" }}>↻</span>
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingRight: 36 }}>
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
  );

  const activityCard = (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 0", fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>Recent Activity</div>
      {dashboard?.recent_contributions?.length > 0 ? (
        <div style={{ padding: "12px 20px 20px" }}>
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
      ) : (
        <EmptyState type="activity" title="No recent activity" subtitle="Your recent payments will show up here." />
      )}
    </div>
  );

  return (
    <div style={{ padding: isDesktop ? 0 : 20 }} className="fade-up">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, color: "#999" }}>Good morning,</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px", fontFamily: "'DM Serif Display', serif" }}>
          {member?.name?.split(" ")[0] ?? "…"} 👋
        </div>
      </div>

      {isDesktop ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Left column */}
          <div>
            {heroCard}
            {monthlyCard}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <QuickCard title="Contributions" sub="View all records" icon="◈" color="#E8F0FE" iconColor="#1565C0" onClick={() => setPage("contributions")} />
              <QuickCard title="Meetings"      sub="View minutes"    icon="◉" color="#F3E5F5" iconColor="#6A1B9A" onClick={() => setPage("meetings")} />
            </div>
          </div>
          {/* Right column */}
          <div>{activityCard}</div>
        </div>
      ) : (
        <>
          {heroCard}
          {monthlyCard}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <QuickCard title="Contribution History" sub="View all records" icon="◈" color="#E8F0FE" iconColor="#1565C0" onClick={() => setPage("contributions")} />
            <QuickCard title="Previous Meetings"    sub="View minutes"    icon="◉" color="#F3E5F5" iconColor="#6A1B9A" onClick={() => setPage("meetings")} />
          </div>
          {activityCard}
        </>
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

function ContributionsPage({ contributions, members, isAdmin, loading, filterYear, setFilterYear, filterStatus, setFilterStatus, filterMember, setFilterMember, filterType, setFilterType, onConfirm, confirmingId, selectStyle }) {
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
        <EmptyState
          type="contributions"
          title="No contributions found"
          subtitle={filterMember !== "All" || filterStatus !== "All" || filterType !== "All"
            ? "Try adjusting your filters to see more records."
            : "No payments have been recorded yet for this period."}
        />
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
                    <button className="btn" onClick={() => onConfirm(c.id)} disabled={confirmingId === c.id}
                      style={{ background: confirmingId === c.id ? "#CCC" : "#1A1A1A", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                      {confirmingId === c.id ? "Confirming…" : "Confirm Payment"}
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

function MeetingsPage({ meetings, loading, isAdmin, currentUser, setSelectedMeeting, setTranscriptMeeting, showToast, onRefresh, viewMode }) {
  const [showRec,        setShowRec]        = useState(false);
  const [recMonth,       setRecMonth]       = useState("");
  const [recording,      setRecording]      = useState(false);
  const [transcribing,   setTranscribing]   = useState(false);
  const [waveform,       setWaveform]       = useState([]);
  const [aiProvider,     setAiProvider]     = useState("groq");
  const [endorseTarget,    setEndorseTarget]    = useState(null);
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [deleteConfirm,    setDeleteConfirm]    = useState(null);
  const [deleting,         setDeleting]         = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const waveTimerRef     = useRef(null);

  // Derive the matched meeting from the selected month (may be null for future months)
  const recMeeting = recMonth
    ? meetings.find(m => {
        const [monthName, year] = recMonth.split(" ");
        return m.date.includes(monthName) && m.date.includes(year);
      })
    : null;

  // Month options: 12 months back → 12 months ahead
  const monthOptions = Array.from({ length: 25 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1);
    return d.toLocaleString("en-GB", { month: "long" }) + " " + d.getFullYear();
  });

  // Waveform animation while recording
  useEffect(() => {
    if (!recording) return;
    waveTimerRef.current = setInterval(() =>
      setWaveform(p => [...p, Math.random() * 60 + 10].slice(-40)), 80);
    return () => clearInterval(waveTimerRef.current);
  }, [recording]);

  const handleStartRecording = async () => {
    if (!recMonth) return showToast("Select a month first", "error");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(100);
      setRecording(true);
      setWaveform([]);
    } catch {
      showToast("Microphone access denied — please allow microphone in browser settings", "error");
    }
  };

  const handleStopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    // Capture values now — closures inside onstop must not rely on state
    const capturedMeeting = recMeeting;
    const capturedMonth   = recMonth;
    const capturedMime    = mr.mimeType || "audio/webm";

    mr.onstop = async () => {
      if (audioChunksRef.current.length === 0) {
        showToast("No audio captured — please try again", "error");
        return;
      }
      setTranscribing(true);
      try {
        let meetingId = capturedMeeting?.id;

        // No existing meeting for this month — create a placeholder
        if (!meetingId) {
          const [monthName, year] = capturedMonth.split(" ");
          const created = await api.addMeeting({
            date:     `${monthName} 1, ${year}`,
            location: "TBD — update after meeting",
            agenda:   `${capturedMonth} monthly meeting`,
          });
          meetingId = created.id;
          showToast(`New meeting created for ${capturedMonth}`);
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: capturedMime });
        await api.transcribeMeeting(meetingId, audioBlob, aiProvider);
        showToast("Transcript saved successfully");
        onRefresh();
        setShowRec(false);
        setRecMonth("");
      } catch (e) {
        showToast(e.message || "Transcription failed", "error");
      } finally {
        setTranscribing(false);
      }
    };
    mr.stop();
    mr.stream.getTracks().forEach(t => t.stop());
    clearInterval(waveTimerRef.current);
    setRecording(false);
  };

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Meetings</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{meetings.length} meetings</div>
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => { setShowRec(v => !v); setRecording(false); setTranscribing(false); }}
            style={{ background: showRec ? "#1A1A1A" : "linear-gradient(135deg,#C8A97E,#A07850)", color: "#fff", border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}>
            {showRec ? "✕ Close" : "🎙 Record AI"}
          </button>
        )}
      </div>

      {/* AI Recorder Modal — admin only */}
      {showRec && isAdmin && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget && !recording && !transcribing) { setShowRec(false); setRecMonth(""); } }}>
          <div style={{ background: "#1C1C1E", borderRadius: 24, padding: 32, width: "100%", maxWidth: 670, fontFamily: "'DM Sans', sans-serif" }} className="fade-up modal-card">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#F7F6F2", letterSpacing: "-0.5px" }}>🎙 AI Meeting Recorder</div>
              {!recording && !transcribing && (
                <button onClick={() => { setShowRec(false); setRecMonth(""); }}
                  style={{ background: "#2A2A2A", border: "none", borderRadius: 8, width: 32, height: 32, color: "#888", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              )}
            </div>

            {/* Model selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[
                { id: "groq",        label: "Groq",         sub: "Whisper Large v3" },
                { id: "huggingface", label: "HuggingFace",  sub: "Whisper Turbo"    },
              ].map(p => (
                <button key={p.id} onClick={() => !recording && !transcribing && setAiProvider(p.id)}
                  style={{ flex: 1, padding: "12px 10px", borderRadius: 12, border: `1.5px solid ${aiProvider === p.id ? "#C8A97E" : "#333"}`, background: aiProvider === p.id ? "rgba(200,169,126,0.12)" : "#2A2A2A", color: aiProvider === p.id ? "#C8A97E" : "#666", fontSize: 14, fontWeight: 600, cursor: recording || transcribing ? "default" : "pointer", textAlign: "center", lineHeight: 1.5, fontFamily: "inherit" }}>
                  {p.label}<br /><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>{p.sub}</span>
                </button>
              ))}
            </div>

            {/* Month selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#666", letterSpacing: 0.5, marginBottom: 8 }}>SELECT MEETING MONTH</div>
              <select value={recMonth} onChange={e => setRecMonth(e.target.value)} disabled={recording || transcribing}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid #333", background: "#2A2A2A", color: "#F0EDE6", fontSize: 15, fontFamily: "inherit", outline: "none" }}>
                <option value="">Choose month…</option>
                {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {recMeeting && (
                <div style={{ fontSize: 13, color: "#4CAF50", marginTop: 8 }}>✓ {recMeeting.date} — {recMeeting.location}</div>
              )}
              {recMonth && !recMeeting && (
                <div style={{ fontSize: 13, color: "#C8A97E", marginTop: 8 }}>◎ No meeting scheduled yet — a placeholder will be created automatically</div>
              )}
            </div>

            {/* Waveform */}
            <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginBottom: 20, overflow: "hidden", background: "#111", borderRadius: 14 }}>
              {recording
                ? waveform.map((h, i) => <div key={i} style={{ width: 3, height: h, background: "#C8A97E", borderRadius: 2, transition: "height 0.05s" }} />)
                : Array.from({ length: 40 }).map((_, i) => <div key={i} style={{ width: 3, height: 8, background: "#2A2A2A", borderRadius: 2 }} />)
              }
            </div>

            {/* Controls */}
            {transcribing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", padding: 16 }}>
                <div style={{ width: 18, height: 18, border: "2px solid #333", borderTopColor: "#C8A97E", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 15, color: "#888" }}>Transcribing with {aiProvider === "huggingface" ? "Whisper Turbo" : "Groq Whisper"}…</span>
              </div>
            ) : recording ? (
              <button className="btn" onClick={handleStopRecording}
                style={{ width: "100%", background: "#EF5350", color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, fontFamily: "inherit", animation: "pulse 1.5s infinite" }}>
                ⏹ Stop &amp; Transcribe
              </button>
            ) : (
              <button className="btn" onClick={handleStartRecording} disabled={!recMonth}
                style={{ width: "100%", background: recMonth ? "#C8A97E" : "#2A2A2A", color: recMonth ? "#1A1A1A" : "#555", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, fontFamily: "inherit" }}>
                ⏺ Start Recording
              </button>
            )}
            <div style={{ fontSize: 12, color: "#555", textAlign: "center", marginTop: 14 }}>
              Audio transcribed by {aiProvider === "huggingface" ? "HuggingFace Whisper Turbo" : "Groq Whisper Large v3"} and saved to the meeting
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Meeting cards — newest first */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1,2,3].map(k => <Skeleton key={k} h={160} r={16} />)}</div>
      ) : meetings.length === 0 ? (
        <EmptyState
          type="meetings"
          title="No meetings yet"
          subtitle="Meeting records will appear here once they are created. Use the AI Recorder to capture and transcribe your first meeting."
        />
      ) : [...meetings]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map((m, i) => {
        const userHasEndorsed = currentUser && (m.proposer_id === currentUser.id || m.seconder_id === currentUser.id);
        const canEndorse      = m.transcript && !userHasEndorsed;
        const confirmingDelete = deleteConfirm === m.id;

        return (
          <div key={m.id} style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", animation: `fadeUp 0.3s ease ${i*0.07}s both` }} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{m.date}</div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>📍 {m.location}</div>
                {m.agenda && <div style={{ fontSize: 11, color: "#BBB", marginTop: 2 }}>📋 {m.agenda}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag label={m.status} color={m.status === "Approved" ? "#E8F5E9" : "#FFF8E1"} text={m.status === "Approved" ? "#2E7D32" : "#F57F17"} />
                {isAdmin && (
                  <button
                    className="btn"
                    onClick={() => setDeleteConfirm(confirmingDelete ? null : m.id)}
                    style={{ background: confirmingDelete ? "#FBE9E7" : "#F5F4F0", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: confirmingDelete ? "#C62828" : "#BBB", cursor: "pointer", flexShrink: 0 }}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Delete confirmation bar */}
            {confirmingDelete && (
              <div style={{ background: "#FBE9E7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 12, color: "#BF360C", fontWeight: 500 }}>Delete this meeting and all its data?</div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setDeleteConfirm(null)} style={{ background: "#fff", border: "1px solid #DDD", borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer", color: "#555" }}>Cancel</button>
                  <button
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await api.deleteMeeting(m.id);
                        setDeleteConfirm(null);
                        showToast("Meeting deleted");
                        onRefresh();
                      } catch (e) {
                        showToast(e.message || "Failed to delete", "error");
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    style={{ background: "#C62828", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#fff" }}>
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, paddingBottom: 12, borderBottom: "1px solid #F5F4F0", marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{m.attendance_count ?? 0}</div><div style={{ fontSize: 10, color: "#999" }}>Present</div></div>
              <div style={{ width: 1, background: "#F0EEE8" }} />
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 700, color: (m.total_collected||0) > 0 ? "#1A1A1A" : "#CCC" }}>{(m.total_collected||0) > 0 ? fmt(m.total_collected) : "—"}</div><div style={{ fontSize: 10, color: "#999" }}>Collected</div></div>
              {m.decisions?.length > 0 && <><div style={{ width: 1, background: "#F0EEE8" }} /><div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{m.decisions.length}</div><div style={{ fontSize: 10, color: "#999" }}>Decisions</div></div></>}
            </div>

            {/* Transcript snippet */}
            {m.transcript && (
              <div style={{ background: "#F7F6F2", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                <div style={{ fontSize: 9, color: "#C8A97E", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>🎙 AI TRANSCRIPT</div>
                {m.transcript.slice(0, 140)}{m.transcript.length > 140 ? "…" : ""}
              </div>
            )}

            {/* Endorsements */}
            {(m.proposer_name || m.seconder_name) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {m.proposer_name && (
                  <div style={{ background: "#E8F5E9", borderRadius: 8, padding: "5px 10px", fontSize: 10, color: "#2E7D32", fontWeight: 600 }}>
                    📝 Proposed: {m.proposer_name}
                  </div>
                )}
                {m.seconder_name && (
                  <div style={{ background: "#E3F2FD", borderRadius: 8, padding: "5px 10px", fontSize: 10, color: "#1565C0", fontWeight: 600 }}>
                    🤝 Seconded: {m.seconder_name}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn"
                onClick={() => viewMode === "desktop" ? setTranscriptMeeting(m) : setSelectedMeeting(m)}
                style={{ flex: 2, background: "#F0EEE8", color: "#1A1A1A", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>
                📄 View Minutes
              </button>
              {isAdmin && (
                <button className="btn" onClick={() => setAttendanceTarget(m)}
                  style={{ flex: 1, background: "#E8F0FE", color: "#1565C0", border: "none", borderRadius: 10, padding: "9px 8px", fontSize: 11, fontWeight: 600 }}>
                  ✓ Attendance
                </button>
              )}
              {m.transcript && (
                canEndorse ? (
                  <button className="btn" onClick={() => setEndorseTarget(m)}
                    style={{ flex: 1, background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 10, padding: "9px 8px", fontSize: 11, fontWeight: 600 }}>
                    ✍ Endorse
                  </button>
                ) : userHasEndorsed ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#4CAF50", fontWeight: 600 }}>
                    ✓ Endorsed
                  </div>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#999" }}>
                    Full
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}

      {/* Attendance modal */}
      {attendanceTarget && (
        <AttendanceModal
          meeting={attendanceTarget}
          onClose={() => { setAttendanceTarget(null); onRefresh(); }}
          showToast={showToast}
        />
      )}

      {/* Endorsement modal */}
      {endorseTarget && (
        <EndorsementModal
          meeting={endorseTarget}
          currentUser={currentUser}
          onClose={() => setEndorseTarget(null)}
          onEndorse={async (type) => {
            try {
              await api.endorseMeeting(endorseTarget.id, type);
              showToast(`Meeting ${type === "propose" ? "proposed" : "seconded"} successfully`);
              onRefresh();
              setEndorseTarget(null);
            } catch (e) {
              showToast(e.message || "Failed to endorse", "error");
            }
          }}
        />
      )}
    </div>
  );
}

// ── Endorsement Modal ─────────────────────────────────────────────────────────

function EndorsementModal({ meeting, currentUser, onClose, onEndorse }) {
  const [choice,   setChoice]   = useState("");
  const [endorsing,setEndorsing]= useState(false);

  const proposeSlotFree = !meeting.proposer_id;
  const secondSlotFree  = !meeting.seconder_id;

  const handleSubmit = async () => {
    if (!choice) return;
    setEndorsing(true);
    try {
      await onEndorse(choice);
    } finally {
      setEndorsing(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="fade-up modal-card" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 420, padding: "24px 24px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A" }}>Endorse Meeting</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{meeting.date} · {meeting.location}</div>
          </div>
          <button onClick={onClose} style={{ background: "#F0EEE8", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Current endorsements */}
        <div style={{ background: "#F7F6F2", borderRadius: 14, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5, marginBottom: 10 }}>CURRENT ENDORSEMENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: meeting.proposer_name ? "#E8F5E9" : "#F0EEE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                {meeting.proposer_name ? "✓" : "○"}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A" }}>Proposed by</div>
                <div style={{ fontSize: 11, color: meeting.proposer_name ? "#2E7D32" : "#CCC" }}>
                  {meeting.proposer_name || "Not yet proposed"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: meeting.seconder_name ? "#E3F2FD" : "#F0EEE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                {meeting.seconder_name ? "✓" : "○"}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A" }}>Seconded by</div>
                <div style={{ fontSize: 11, color: meeting.seconder_name ? "#1565C0" : "#CCC" }}>
                  {meeting.seconder_name || "Not yet seconded"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Radio choices */}
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", marginBottom: 12 }}>Your endorsement:</div>
        {[
          { value: "propose", label: "I propose the meeting minutes", available: proposeSlotFree, color: "#2E7D32", bg: "#E8F5E9" },
          { value: "second",  label: "I second the meeting minutes",  available: secondSlotFree,  color: "#1565C0", bg: "#E3F2FD" },
        ].map(opt => (
          <div
            key={opt.value}
            onClick={() => opt.available && setChoice(opt.value)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", borderRadius: 14, marginBottom: 10,
              border: `2px solid ${choice === opt.value ? opt.color : "#ECEAE4"}`,
              background: choice === opt.value ? opt.bg : opt.available ? "#fff" : "#F7F6F2",
              cursor: opt.available ? "pointer" : "not-allowed",
              opacity: opt.available ? 1 : 0.5,
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: "50%", border: `2px solid ${choice === opt.value ? opt.color : "#DDD"}`,
              background: choice === opt.value ? opt.color : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s",
            }}>
              {choice === opt.value && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: opt.available ? "#1A1A1A" : "#999" }}>{opt.label}</div>
              {!opt.available && <div style={{ fontSize: 10, color: "#BBB", marginTop: 1 }}>Slot already taken</div>}
            </div>
          </div>
        ))}

        <button
          className="btn"
          onClick={handleSubmit}
          disabled={!choice || endorsing}
          style={{ width: "100%", marginTop: 8, background: choice && !endorsing ? "#1A1A1A" : "#ECEAE4", color: choice && !endorsing ? "#F7F6F2" : "#BBB", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}
        >
          {endorsing ? <><Spinner /> Submitting…</> : "Submit Endorsement"}
        </button>
      </div>
    </div>
  );
}

// ── Attendance Modal ──────────────────────────────────────────────────────────

function AttendanceModal({ meeting, onClose, showToast }) {
  const [rows,    setRows]    = useState(null);
  const [saving,  setSaving]  = useState(null); // member_id being saved
  const [fines,   setFines]   = useState([]);   // auto-generated fines this session

  useEffect(() => {
    api.getMeeting(meeting.id).then(data => {
      setRows(data.attendance.map(a => ({ ...a, dirty: false })));
    }).catch(() => showToast("Failed to load attendance", "error"));
  }, [meeting.id]);

  const STATUS_OPTS = [
    { value: "present", label: "Present",  color: "#2E7D32", bg: "#E8F5E9" },
    { value: "apology", label: "Apology",  color: "#F57F17", bg: "#FFF8E1" },
    { value: "absent",  label: "Absent",   color: "#C62828", bg: "#FFEBEE" },
  ];

  const handleChange = async (memberId, status) => {
    setRows(prev => prev.map(r => r.id === memberId ? { ...r, status, dirty: true } : r));
    setSaving(memberId);
    try {
      const result = await api.recordAttendance(meeting.id, { member_id: memberId, status });
      if (result?.autoFine) {
        const name = rows.find(r => r.id === memberId)?.name ?? "Member";
        const msg  = `Auto-fine: ${name} — KES ${result.autoFine.amount} (${result.autoFine.type})`;
        setFines(prev => [...prev, msg]);
        showToast(msg);
      } else if (status === "present") {
        // H6: resolve name before the async setFines updater to avoid stale closure
        const name = rows.find(r => r.id === memberId)?.name ?? "___";
        setFines(prev => prev.filter(f => !f.includes(name)));
      }
      setRows(prev => prev.map(r => r.id === memberId ? { ...r, dirty: false } : r));
    } catch (e) {
      showToast(e.message || "Failed to save", "error");
    } finally {
      setSaving(null);
    }
  };

  const presentCount = rows?.filter(r => r.status === "present").length ?? 0;
  const absentCount  = rows?.filter(r => r.status === "absent").length ?? 0;
  const apologyCount = rows?.filter(r => r.status === "apology").length ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="slide-up modal-card" onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F0EEE8" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A" }}>Meeting Attendance</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{meeting.date} · {meeting.location}</div>
            </div>
            <button onClick={onClose} style={{ background: "#F0EEE8", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          {rows && (
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
              {[["Present", presentCount, "#2E7D32", "#E8F5E9"], ["Apology", apologyCount, "#F57F17", "#FFF8E1"], ["Absent", absentCount, "#C62828", "#FFEBEE"]].map(([l, c, tc, bg]) => (
                <div key={l} style={{ flex: 1, background: bg, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: tc }}>{c}</div>
                  <div style={{ fontSize: 9, color: tc, opacity: 0.8 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-fines log */}
        {fines.length > 0 && (
          <div style={{ margin: "0 16px", marginTop: 12, background: "#FFF8E1", borderRadius: 10, padding: "10px 14px", border: "1px solid #FFE082" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#F57F17", letterSpacing: 0.5, marginBottom: 6 }}>AUTO-FINES GENERATED</div>
            {fines.map((f, i) => <div key={i} style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>⚡ {f}</div>)}
          </div>
        )}

        {/* Member list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
          {!rows ? (
            <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
          ) : rows.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F5F4F0" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#C8A97E,#A07850)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {r.name?.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: "#999" }}>{r.role}</div>
              </div>
              {saving === r.id ? (
                <div style={{ width: 18, height: 18 }}><Spinner /></div>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  {STATUS_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => handleChange(r.id, opt.value)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "2px solid", fontSize: 10, fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                      borderColor: r.status === opt.value ? opt.color : "#ECEAE4",
                      background:  r.status === opt.value ? opt.bg : "#fff",
                      color:       r.status === opt.value ? opt.color : "#BBB",
                    }}>{opt.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 24px 28px", borderTop: "1px solid #F0EEE8" }}>
          <button className="btn" onClick={onClose}
            style={{ width: "100%", background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Annual Report Page ────────────────────────────────────────────────────────

function AnnualReportPage({ report, loading, year, setYear }) {
  const years = Array.from({ length: 4 }, (_, i) => String(now.getFullYear() - i));

  const handlePrint = () => {
    const el = document.getElementById("annual-report-content");
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>Kabazim Reloded — ${year} Annual Report</title>
    <style>
      body { font-family: system-ui, sans-serif; color: #1A1A1A; padding: 32px; max-width: 900px; margin: 0 auto; }
      h1 { font-size: 24px; margin-bottom: 4px; }
      .sub { color: #999; font-size: 13px; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 12px; }
      th { text-align: left; padding: 8px 12px; background: #F7F6F2; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
      td { padding: 9px 12px; border-bottom: 1px solid #F0EEE8; }
      .section { font-size: 15px; font-weight: 700; margin: 24px 0 12px; }
      .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
      .stat { background: #F7F6F2; border-radius: 8px; padding: 16px; }
      .stat-value { font-size: 22px; font-weight: 700; }
      .stat-label { font-size: 10px; color: #999; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
      @media print { body { padding: 16px; } }
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const topContributors = report?.members?.slice(0, 3) ?? [];

  return (
    <div style={{ padding: 20 }} className="fade-up">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Annual Report</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Kabazim Reloded · {year} Summary</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "#ECEAE4", borderRadius: 10, padding: 3 }}>
            {years.map(y => (
              <button key={y} onClick={() => setYear(y)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: year === y ? "#1A1A1A" : "transparent", color: year === y ? "#fff" : "#888" }}>{y}</button>
            ))}
          </div>
          <button className="btn" onClick={handlePrint}
            style={{ background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>
            ⬇ Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[1,2,3].map(k => <Skeleton key={k} h={100} r={16} />)}
        </div>
      ) : !report ? (
        <EmptyState type="activity" title="No data available" subtitle={`No records found for ${year}.`} />
      ) : (
        <div id="annual-report-content">
          {/* Hidden print header */}
          <div className="print-only" style={{ display: "none" }}>
            <h1>Kabazim Reloded — {year} Annual Report</h1>
            <div className="sub">Generated {new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}</div>
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              ["Total Collected", fmt(report.totals.grand),       "#1C1C1E", "#F7F6F2"],
              ["Contributions",   fmt(report.totals.contributions),"#E8F5E9", "#2E7D32"],
              ["Fines & Lateness",fmt(report.totals.fines + report.totals.lateness), "#FFF8E1", "#F57F17"],
              ["Meetings Held",   report.meetings?.total ?? 0,    "#E8F0FE", "#1565C0"],
            ].map(([label, value, bg, color]) => (
              <div key={label} style={{ background: bg, borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 11, color, opacity: 0.7, letterSpacing: 0.5, marginBottom: 6 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Top contributors */}
          {topContributors.length > 0 && (
            <div style={{ background: "#1C1C1E", borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 14 }}>TOP CONTRIBUTORS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topContributors.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: ["#C8A97E","#9E9E9E","#A07850"][i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F7F6F2" }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{m.meetings_total ?? 0} meetings · {m.shares} share{m.shares > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#C8A97E" }}>{fmt(m.contributions)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly breakdown */}
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F5F4F0", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Monthly Breakdown</div>
            {report.monthly.length === 0 ? (
              <EmptyState type="activity" title="No monthly data" subtitle="No confirmed contributions recorded." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F7F6F2" }}>
                      {["Month", "Contributions", "Fines", "Lateness", "Total"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: h === "Month" ? "left" : "right", fontSize: 10, color: "#999", letterSpacing: 0.5, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly.map(r => (
                      <tr key={r.month} style={{ borderBottom: "1px solid #F9F8F5" }}>
                        <td style={{ padding: "11px 16px", fontWeight: 500, color: "#1A1A1A" }}>{r.month}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", color: "#2E7D32" }}>{fmt(r.contributions)}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", color: r.fines > 0 ? "#C62828" : "#CCC" }}>{r.fines > 0 ? fmt(r.fines) : "—"}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", color: r.lateness > 0 ? "#E65100" : "#CCC" }}>{r.lateness > 0 ? fmt(r.lateness) : "—"}</td>
                        <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, color: "#1A1A1A" }}>{fmt(r.contributions + r.fines + r.lateness)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Member breakdown */}
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F5F4F0", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Member Summary</div>
            {report.members.length === 0 ? (
              <EmptyState type="members" title="No member data" subtitle="No confirmed records for this year." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F7F6F2" }}>
                      {["Member","Contributions","Fines","Lateness","Meetings","Attendance"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: h === "Member" ? "left" : "right", fontSize: 10, color: "#999", letterSpacing: 0.5, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.members.map((m, i) => {
                      const attRate = m.meetings_total > 0 ? Math.round((m.present / m.meetings_total) * 100) : null;
                      return (
                        <tr key={m.id} style={{ borderBottom: "1px solid #F9F8F5", background: i % 2 === 0 ? "#fff" : "#FDFCFA" }}>
                          <td style={{ padding: "11px 16px" }}>
                            <div style={{ fontWeight: 600, color: "#1A1A1A" }}>{m.name}</div>
                            <div style={{ fontSize: 10, color: "#999" }}>{m.shares} share{m.shares > 1 ? "s" : ""}</div>
                          </td>
                          <td style={{ padding: "11px 16px", textAlign: "right", color: m.contributions > 0 ? "#2E7D32" : "#CCC", fontWeight: 600 }}>{m.contributions > 0 ? fmt(m.contributions) : "—"}</td>
                          <td style={{ padding: "11px 16px", textAlign: "right", color: m.fines > 0 ? "#C62828" : "#CCC" }}>{m.fines > 0 ? fmt(m.fines) : "—"}</td>
                          <td style={{ padding: "11px 16px", textAlign: "right", color: m.lateness > 0 ? "#E65100" : "#CCC" }}>{m.lateness > 0 ? fmt(m.lateness) : "—"}</td>
                          <td style={{ padding: "11px 16px", textAlign: "right", color: "#555" }}>{m.present ?? 0}/{m.meetings_total ?? 0}</td>
                          <td style={{ padding: "11px 16px", textAlign: "right" }}>
                            {attRate !== null ? (
                              <span style={{ padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: attRate >= 80 ? "#E8F5E9" : attRate >= 50 ? "#FFF8E1" : "#FFEBEE", color: attRate >= 80 ? "#2E7D32" : attRate >= 50 ? "#F57F17" : "#C62828" }}>{attRate}%</span>
                            ) : <span style={{ color: "#CCC" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Record Contribution Page ───────────────────────────────────────────────────

function RecordPage({ members, summary, loading, recordForm, setRecordForm, onSubmit, onBulkImport, selectStyle }) {
  const [tab, setTab] = useState("single");

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

      {/* Tab toggle */}
      <div style={{ display: "flex", background: "#F0EFEA", borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 }}>
        {[["single","Single Entry"],["bulk","Bulk Import"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", background: tab === id ? "#1A1A1A" : "transparent", color: tab === id ? "#F7F6F2" : "#999" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "bulk" && <BulkImportTab members={members} loading={loading} onBulkImport={onBulkImport} selectStyle={selectStyle} />}
      {tab !== "bulk" && <>


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

        <Label text="MONTH">
          <select value={F.month} onChange={e => setF("month", e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            {Array.from({ length: 14 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
              return d.toLocaleString("en-GB", { month: "long" }) + " " + d.getFullYear();
            }).map(m => <option key={m} value={m}>{m}</option>)}
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
          ) : (summary?.rows ?? []).length === 0 ? (
            <EmptyState type="contributions" title="No data for this month" subtitle="Contributions recorded this month will appear here." />
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
      </>}
    </div>
  );
}

// ── Bulk Import Tab ───────────────────────────────────────────────────────────

function BulkImportTab({ members, loading, onBulkImport, selectStyle }) {
  const activeMembers = members.filter(m => m.active);

  const monthOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return d.toLocaleString("en-GB", { month: "long" }) + " " + d.getFullYear();
  });

  const [month, setMonth]         = useState(CURRENT_MONTH);
  const [allConfirmed, setAllConf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);

  const initRows = () =>
    activeMembers.map(m => ({
      member_id: m.id,
      name: m.name,
      shares: m.shares,
      amount: String(m.shares * 5000),
      method: "M-Pesa",
      ref: "",
      status: "Confirmed",
      skip: false,
    }));

  const [rows, setRows] = useState(initRows);

  // M8: re-initialise rows if members list changes (e.g. new member added)
  useEffect(() => { setRows(initRows()); }, [members]);

  const setRow = (idx, key, val) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  const toggleAllConfirmed = (val) => {
    setAllConf(val);
    setRows(prev => prev.map(r => ({ ...r, status: val ? "Confirmed" : "Pending" })));
  };

  const handleSubmit = async () => {
    const entries = rows
      .filter(r => !r.skip && r.amount)
      .map(({ member_id, amount, method, ref, status }) => ({ member_id, amount, method, ref, status }));
    if (entries.length === 0) return;
    setSubmitting(true);
    const ok = await onBulkImport(month, entries);
    setSubmitting(false);
    if (ok) {
      setDone(true);
      setRows(initRows());
      setAllConf(false);
    }
  };

  const toImport = rows.filter(r => !r.skip).length;

  return (
    <div>
      {done && (
        <div style={{ background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#2E7D32", fontWeight: 600 }}>
          ✓ Import successful! Records saved.
          <span onClick={() => setDone(false)} style={{ float: "right", cursor: "pointer", fontWeight: 400 }}>Dismiss</span>
        </div>
      )}

      {/* Month + controls */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <Label text="MONTH TO IMPORT">
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Label>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <div onClick={() => toggleAllConfirmed(!allConfirmed)} style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid", borderColor: allConfirmed ? "#1A1A1A" : "#CCC", background: allConfirmed ? "#1A1A1A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {allConfirmed && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
          </div>
          <div style={{ fontSize: 13, color: "#555" }}>Mark all as Confirmed</div>
        </div>
      </div>

      {/* Member rows */}
      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F5F4F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Members ({toImport} to import)</div>
          <div style={{ fontSize: 11, color: "#999" }}>Uncheck to skip a member</div>
        </div>

        {rows.map((r, idx) => (
          <div key={r.member_id} style={{ padding: "14px 16px", borderBottom: "1px solid #F9F8F5", opacity: r.skip ? 0.4 : 1, transition: "opacity 0.15s" }}>
            {/* Row header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: r.skip ? 0 : 12 }}>
              <div onClick={() => setRow(idx, "skip", !r.skip)} style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid", borderColor: r.skip ? "#CCC" : "#1A1A1A", background: r.skip ? "transparent" : "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                {!r.skip && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
              </div>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#F0EFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#555", flexShrink: 0 }}>
                {r.name.charAt(0)}
              </div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "#999" }}>{r.shares} share{r.shares > 1 ? "s" : ""}</div>
            </div>

            {!r.skip && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr", gap: 8, paddingLeft: 30 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#999", marginBottom: 4 }}>AMOUNT (KES)</div>
                  <input type="number" value={r.amount} onChange={e => setRow(idx, "amount", e.target.value)}
                    style={{ ...selectStyle, width: "100%", paddingRight: 8, fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#999", marginBottom: 4 }}>METHOD</div>
                  <select value={r.method} onChange={e => setRow(idx, "method", e.target.value)} style={{ ...selectStyle, width: "100%", fontSize: 12 }}>
                    <option>M-Pesa</option>
                    <option>Bank Slip</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#999", marginBottom: 4 }}>REFERENCE</div>
                  <input placeholder="Ref…" value={r.ref} onChange={e => setRow(idx, "ref", e.target.value)}
                    style={{ ...selectStyle, width: "100%", paddingRight: 8, fontSize: 12 }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="btn" onClick={handleSubmit} disabled={submitting || loading || toImport === 0}
        style={{ width: "100%", background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {submitting ? <><Spinner /> Importing…</> : `Import ${toImport} contributions for ${month}`}
      </button>
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

// ── Empty State ───────────────────────────────────────────────────────────────

const EMPTY_ILLUSTRATIONS = {
  contributions: (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="10" width="44" height="58" rx="6" stroke="#E0DDD6" strokeWidth="2.2"/>
      <path d="M22 68 Q27.5 76 33 68 Q38.5 60 44 68 Q49.5 76 55 68 Q60.5 60 66 68" stroke="#E0DDD6" strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="28" x2="56" y2="28" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="32" y1="37" x2="56" y2="37" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="32" y1="46" x2="46" y2="46" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="48" y1="46" x2="56" y2="46" stroke="#C8A97E" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="66" cy="22" r="10" fill="#F7F6F2" stroke="#E0DDD6" strokeWidth="1.5"/>
      <line x1="66" y1="17" x2="66" y2="27" stroke="#C8A97E" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="61" y1="22" x2="71" y2="22" stroke="#C8A97E" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  meetings: (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="68" height="56" rx="10" stroke="#E0DDD6" strokeWidth="2.2"/>
      <line x1="10" y1="35" x2="78" y2="35" stroke="#E0DDD6" strokeWidth="2"/>
      <line x1="28" y1="10" x2="28" y2="24" stroke="#E0DDD6" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="60" y1="10" x2="60" y2="24" stroke="#E0DDD6" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="26" cy="48" r="3.5" fill="#E0DDD6"/>
      <circle cx="44" cy="48" r="3.5" fill="#C8A97E"/>
      <circle cx="62" cy="48" r="3.5" fill="#E0DDD6"/>
      <circle cx="26" cy="63" r="3.5" fill="#E0DDD6"/>
      <circle cx="44" cy="63" r="3.5" fill="#E0DDD6"/>
      <circle cx="62" cy="63" r="3.5" fill="#E0DDD6" opacity="0.4"/>
    </svg>
  ),
  activity: (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="14" y1="68" x2="74" y2="68" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="14" y1="68" x2="14" y2="20" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="20" y="52" width="10" height="16" rx="3" fill="#ECEAE4"/>
      <rect x="34" y="40" width="10" height="28" rx="3" fill="#ECEAE4"/>
      <rect x="48" y="46" width="10" height="22" rx="3" fill="#C8A97E" opacity="0.35"/>
      <rect x="62" y="34" width="10" height="34" rx="3" fill="#ECEAE4"/>
      <path d="M44 16 L45.4 20.6 L50.4 19.2 L46.8 23 L49.4 27.8 L44 25.2 L38.6 27.8 L41.2 23 L37.6 19.2 L42.6 20.6 Z" stroke="#C8A97E" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  members: (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="44" cy="30" r="12" stroke="#C8A97E" strokeWidth="2"/>
      <path d="M20 74 C20 58 30 50 44 50 C58 50 68 58 68 74" stroke="#C8A97E" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="18" cy="34" r="8" stroke="#E0DDD6" strokeWidth="1.8"/>
      <path d="M6 68 C6 56 12 50 18 50 C22 50 27 52 30 56" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="70" cy="34" r="8" stroke="#E0DDD6" strokeWidth="1.8"/>
      <path d="M82 68 C82 56 76 50 70 50 C66 50 61 52 58 56" stroke="#E0DDD6" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
};

function EmptyState({ type = "contributions", title, subtitle, action, onAction }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", minHeight: 280 }}>
      <div style={{ marginBottom: 20, opacity: 0.9 }}>
        {EMPTY_ILLUSTRATIONS[type]}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", marginBottom: 6, letterSpacing: "-0.3px" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "#BBB", maxWidth: 240, lineHeight: 1.5 }}>{subtitle}</div>}
      {action && onAction && (
        <button className="btn" onClick={onAction}
          style={{ marginTop: 20, background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 12, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {action}
        </button>
      )}
    </div>
  );
}

// ── Members Page ──────────────────────────────────────────────────────────────

function MembersPage({ members, loading, onAdd, onToggle, onEdit, viewMode }) {
  const active = members.filter(m => m.active).length;
  const isDesktop = viewMode === "desktop";
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
        <div style={{ display: isDesktop ? "grid" : "flex", gridTemplateColumns: isDesktop ? "1fr 1fr" : undefined, flexDirection: "column", gap: 10 }}>{[1,2,3,4].map(k => <Skeleton key={k} h={80} r={14} />)}</div>
      ) : members.length === 0 ? (
        <EmptyState type="members" title="No members yet" subtitle="Add your first member to get started." action="+ Add Member" onAction={onAdd} />
      ) : <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: isDesktop ? "1fr 1fr" : undefined, gap: 10 }}>{members.map((m, i) => (
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
      ))}</div>}
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

function SettingsPinModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [done,    setDone]    = useState(false);

  const mismatch = confirm.length === 4 && next !== confirm;
  const ready    = current.length === 4 && next.length === 4 && confirm.length === 4 && !mismatch;

  const handleSave = async () => {
    if (!ready) return;
    setSaving(true); setError(null);
    try {
      await api.changePin(current, next);
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="slide-up modal-card" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 440, padding: "28px 24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A" }}>Change PIN</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#999", cursor: "pointer" }}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>PIN updated!</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>Current PIN</div>
              <SettingsPinBoxes value={current} onChange={setCurrent} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>New PIN</div>
              <SettingsPinBoxes value={next} onChange={setNext} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: mismatch ? "#EF5350" : "#555", marginBottom: 10 }}>
                Confirm New PIN {mismatch && "— don't match"}
              </div>
              <SettingsPinBoxes value={confirm} onChange={setConfirm} hasError={mismatch} />
            </div>

            {error && (
              <div style={{ background: "#FBE9E7", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#BF360C", fontWeight: 500 }}>{error}</div>
            )}

            <button onClick={handleSave} disabled={!ready || saving}
              style={{ width: "100%", background: ready && !saving ? "#1A1A1A" : "#ECEAE4", color: ready && !saving ? "#F7F6F2" : "#BBB", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, transition: "all 0.2s" }}>
              {saving ? "Saving…" : "Update PIN"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPinBoxes({ value, onChange, hasError }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"} inputMode="numeric" maxLength={4}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        style={{ width: "100%", height: 52, padding: "0 44px 0 16px", fontSize: 22, fontWeight: 700, letterSpacing: 8,
          borderRadius: 12, border: `2px solid ${hasError ? "#EF5350" : value.length === 4 ? "#1A1A1A" : "#ECEAE4"}`,
          background: value ? "#F0EDE6" : "#F9F8F5", outline: "none", fontFamily: "inherit",
          transition: "border-color 0.15s, background 0.15s", boxSizing: "border-box" }}
      />
      <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999", padding: 4 }}>
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}

function SettingsPage({ role, currentUser, onLogout, memberCount }) {
  const [showPinModal, setShowPinModal] = useState(false);

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px" }}>Settings</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Chama configuration</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 14 }}>Chama Details</div>
        {[["Name","Kabazim Reloded"],["Meeting Day","Monthly"],["Members", String(memberCount ?? "—")],["Share Value","KES 5,000 / month"]].map(([k,v]) => (
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
        <button className="btn" onClick={() => setShowPinModal(true)}
          style={{ width: "100%", background: "#F7F6F2", color: "#1A1A1A", border: "1.5px solid #ECEAE4", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          🔑 Change PIN
        </button>
        <button className="btn" onClick={onLogout} style={{ width: "100%", background: "#1C1C1E", color: "#F7F6F2", border: "none", borderRadius: 12, padding: "13px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          Sign Out
        </button>
      </div>

      <div style={{ background: "#F0EEE8", borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#A07850", marginBottom: 4 }}>API Connected</div>
        <div style={{ fontSize: 12, color: "#999" }}>Backend running on Railway</div>
      </div>

      {showPinModal && <SettingsPinModal onClose={() => setShowPinModal(false)} />}
    </div>
  );
}

// ── Transcript Side Panel (desktop) ──────────────────────────────────────────

function TranscriptPanel({ meeting, onClose }) {
  const [copied, setCopied]         = useState(false);
  const [minutes, setMinutes]       = useState(null);
  const [loadingMin, setLoadingMin] = useState(true);
  const [freshMeeting, setFreshMeeting] = useState(meeting);

  useEffect(() => {
    setLoadingMin(true);
    setFreshMeeting(meeting);
    Promise.all([
      api.getMeeting(meeting.id),
      api.getMeetingMinutes(meeting.id),
    ])
      .then(([m, mins]) => { setFreshMeeting(m); setMinutes(mins); })
      .catch(() => {})
      .finally(() => setLoadingMin(false));
  }, [meeting.id]);

  const transcript = freshMeeting.transcript || meeting.transcript;

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const wordCount = transcript ? transcript.trim().split(/\s+/).length : 0;
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 200 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 500,
        background: "#F9F8F5", zIndex: 201, display: "flex", flexDirection: "column",
        boxShadow: "-6px 0 32px rgba(0,0,0,0.12)", fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ECEAE4", background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px", fontFamily: "'DM Serif Display', serif" }}>{freshMeeting.date}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>{freshMeeting.location}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {transcript && (
                <button onClick={handleCopy} style={{ background: copied ? "#E8F5E9" : "#F0EEE8", color: copied ? "#2E7D32" : "#555", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                  {copied ? "✓ Copied" : "⎘ Copy"}
                </button>
              )}
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#BBB", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
          </div>
          {(freshMeeting.proposer_name || freshMeeting.seconder_name) && (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {freshMeeting.proposer_name && <span style={{ fontSize: 10, background: "#E8F5E9", color: "#2E7D32", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>📝 {freshMeeting.proposer_name}</span>}
              {freshMeeting.seconder_name && <span style={{ fontSize: 10, background: "#E3F2FD", color: "#1565C0", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>🤝 {freshMeeting.seconder_name}</span>}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 32px" }}>

          {/* ── AI Summary ── */}
          {!loadingMin && minutes?.ai_summary && (
            <div style={{ background: "#1A1A1A", borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#C8A97E", letterSpacing: 0.8, marginBottom: 12 }}>AI MEETING SUMMARY</div>
              <p style={{ margin: 0, fontSize: 15, color: "#F0EDE6", lineHeight: 1.75 }}>{minutes.ai_summary.summary}</p>
              {minutes.ai_summary.key_points?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 8 }}>KEY POINTS</div>
                  {minutes.ai_summary.key_points.map((p, i) => (
                    <div key={i} style={{ fontSize: 14, color: "#D0CEC8", marginBottom: 6, paddingLeft: 14, borderLeft: "2px solid #333" }}>{p}</div>
                  ))}
                </div>
              )}
              {minutes.ai_summary.action_items?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 8 }}>ACTION ITEMS</div>
                  {minutes.ai_summary.action_items.map((a, i) => (
                    <div key={i} style={{ fontSize: 14, color: "#D0CEC8", marginBottom: 6, display: "flex", gap: 8 }}>
                      <span style={{ color: "#C8A97E" }}>→</span>{a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Attendance & Financials ── */}
          {!loadingMin && minutes && (
            <>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Present", value: minutes.attendance.present_count, sub: `of ${minutes.attendance.total_members}`, color: "#2E7D32" },
                  { label: "Apology", value: minutes.attendance.apology_count, sub: "members", color: "#E65100" },
                  { label: "Absent",  value: minutes.attendance.absent_count,  sub: "members", color: "#C62828" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "'DM Serif Display', serif" }}>{s.value}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginTop: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#BBB", marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Financial stats */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 12 }}>FINANCIALS · {minutes.month || "—"}</div>
                {[
                  { label: "Contributions", value: minutes.contributions.total_contributions, color: "#1565C0" },
                  { label: "Fines",         value: minutes.contributions.total_fines,         color: "#E65100" },
                  { label: "Lateness",      value: minutes.contributions.total_lateness,      color: "#E65100" },
                  { label: "Total Collected (Confirmed)", value: minutes.contributions.total_collected, color: "#2E7D32", bold: true },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F5F4F0" }}>
                    <div style={{ fontSize: 14, color: "#666", fontWeight: row.bold ? 600 : 400 }}>{row.label}</div>
                    <div style={{ fontSize: 14, fontWeight: row.bold ? 700 : 500, color: row.color }}>{fmt(row.value)}</div>
                  </div>
                ))}
              </div>

              {/* Present members list */}
              {minutes.attendance.present.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 12 }}>MEMBERS PRESENT</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {minutes.attendance.present.map(m => (
                      <span key={m.id} style={{ fontSize: 13, background: "#F0EDE6", color: "#1A1A1A", borderRadius: 6, padding: "5px 10px", fontWeight: 500 }}>{m.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contributions list */}
              {minutes.contributions.items.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 12 }}>CONTRIBUTIONS</div>
                  {minutes.contributions.items.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F9F8F5" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>{c.member_name}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>{c.type}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: c.type === "Contribution" ? "#1565C0" : "#E65100" }}>{fmt(c.amount)}</div>
                        <div style={{ fontSize: 12, color: c.status === "Confirmed" ? "#2E7D32" : "#999" }}>{c.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Raw Transcript ── */}
          <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 14 }}>RAW TRANSCRIPT</div>
            {loadingMin ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#CCC" }}>
                <div style={{ width: 20, height: 20, border: "2px solid #EEE", borderTopColor: "#C8A97E", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 10px" }} />
                <div style={{ fontSize: 13, color: "#BBB" }}>Loading transcript…</div>
              </div>
            ) : transcript ? (
              <p style={{ margin: 0, fontSize: 15, color: "#1A1A1A", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>
                {transcript}
              </p>
            ) : (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎙</div>
                <div style={{ fontSize: 15, color: "#999" }}>No transcript yet.</div>
                <div style={{ fontSize: 13, color: "#BBB", marginTop: 6 }}>Use the AI Recorder to generate one.</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {transcript && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid #ECEAE4", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#BBB" }}>{wordCount.toLocaleString()} words · AI transcribed</div>
            <div style={{ fontSize: 12, color: "#BBB" }}>{freshMeeting.status}</div>
          </div>
        )}
      </div>
    </>
  );
}

// ── PDF Preview Modal ─────────────────────────────────────────────────────────

function PDFModal({ meeting, members, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="slide-up modal-card" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #ECEAE4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Meeting Minutes</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} style={{ background: "#F0EEE8", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📥 Export PDF</button>
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
                    <td style={{ padding: "6px 8px", color: "#999", fontSize: 10 }}>—</td>
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
      <div className="fade-up modal-card" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
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
        <button className="btn" onClick={handleSubmit} disabled={saving || !form.name || !form.phone} style={{ width: "100%", background: "#1A1A1A", color: "#F7F6F2", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", opacity: !form.name || !form.phone ? 0.5 : 1 }}>
          {saving ? <><Spinner /> Adding…</> : "Add Member"}
        </button>
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>
          A WhatsApp onboarding message will be sent to the member's phone.
        </p>
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
      <div className="fade-up modal-card" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>

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
