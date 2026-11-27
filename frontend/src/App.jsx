import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as api from "./api.js";
import LoginPage    from "./LoginPage.jsx";
import ChangePinPage from "./ChangePinPage.jsx";
import { Icon } from "./Icons.jsx";
import "./app.css";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#f2efe9",
  surface: "#ffffff",
  sf2:     "#f8f6f2",
  fg:      "#1a1714",
  fg2:     "#6b6560",
  fg3:     "#a8a39d",
  border:  "#e5e0d9",
  border2: "#ece8e2",
  accent:  "#2563eb",
  accL:    "#eff6ff",
  accM:    "#bfdbfe",
  green:   "#16a34a",
  grnL:    "#f0fdf4",
  amber:   "#d97706",
  ambL:    "#fffbeb",
  red:     "#dc2626",
  redL:    "#fef2f2",
  serif:   "'DM Serif Display', Georgia, serif",
  sans:    "'Inter', system-ui, sans-serif",
};

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
  Contribution:       { icon: "◈", bg: "#E8F0FE", text: "#1565C0", border: "#90CAF9" },
  Fine:               { icon: "⚑", bg: "#FBE9E7", text: "#BF360C", border: "#FFAB91" },
  Lateness:           { icon: "◷", bg: "#FFF8E1", text: "#E65100", border: "#FFE082" },
  "Late Contribution":{ icon: "⚡", bg: "#FFF3E0", text: "#E65100", border: "#FFCC80" },
};

const NAV_ITEMS = [
  { id: "dashboard",     label: "Dashboard",     icon: "home",     section: "Track" },
  { id: "contributions", label: "Contributions", icon: "coins",    section: "Track" },
  { id: "meetings",      label: "Meetings",      icon: "calendar", section: "Track" },
  { id: "mybalance",     label: "My Balance",    icon: "wallet",   section: "Track" },
  { id: "record",        label: "Import Data",   icon: "download", section: "Admin", adminOnly: true },
  { id: "members",       label: "Members",       icon: "users",    section: "Admin", adminOnly: true },
  { id: "capital",       label: "Capital Sheet", icon: "bank",     section: "Admin", adminOnly: true },
  { id: "report",        label: "Reports",       icon: "chart",    section: "Admin", adminOnly: true },
  { id: "settings",      label: "Settings",      icon: "settings", section: "Other" },
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
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:T.sans }}>
      <div style={{ width:40, height:40, background:T.fg, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:13, marginBottom:20 }}>KA</div>
      <div style={{ fontSize:24, fontFamily:T.serif, fontWeight:400, color:T.fg, letterSpacing:"-0.02em", marginBottom:20 }}>Kaabazim</div>
      <div style={{ width:20, height:20, border:`2px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Main App (only shown when authenticated) ──────────────────────────────────

// ── Floating Mobile Nav ───────────────────────────────────────────────────────

function MobileNav({ isAdmin, page, setPage, moreOpen, setMoreOpen }) {
  const PRIMARY_IDS = isAdmin
    ? ["dashboard", "contributions", "meetings", "members"]
    : ["dashboard", "contributions", "meetings", "members", "settings"];
  const MORE_IDS = isAdmin ? ["record", "report", "settings"] : [];

  const primaryItems = NAV_ITEMS.filter(n => PRIMARY_IDS.includes(n.id));
  const moreItems    = NAV_ITEMS.filter(n => MORE_IDS.includes(n.id));
  const moreActive   = moreItems.some(n => n.id === page);

  const navItems = [
    ...primaryItems,
    ...(isAdmin ? [{ id: "__more__", label: "More", icon: "⋯" }] : []),
  ];

  const activeIndex = moreOpen || moreActive
    ? navItems.length - 1
    : navItems.findIndex(n => n.id === page);

  const containerRef = useRef(null);
  const btnRefs      = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const update = () => {
      const btn       = btnRefs.current[activeIndex];
      const container = containerRef.current;
      if (!btn || !container) return;
      const b = btn.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setIndicator({ left: b.left - c.left, width: b.width });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeIndex]);

  return (
    <>
      <div style={{ position: "fixed", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 100, width: "calc(100% - 28px)", maxWidth: 480 }}>
        <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center", background: T.surface, borderRadius: 999, padding: "6px 4px", boxShadow: "0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06)", border: `1px solid ${T.border}` }}>
          <div style={{ position: "absolute", top: 4, bottom: 4, left: indicator.left, width: indicator.width, background: T.accL, borderRadius: 999, transition: "left 0.25s cubic-bezier(.4,0,.2,1),width 0.25s cubic-bezier(.4,0,.2,1)", pointerEvents: "none" }} />
          {navItems.map((item, i) => {
            const isActive = item.id === "__more__" ? (moreOpen || moreActive) : page === item.id;
            return (
              <button key={item.id} ref={el => btnRefs.current[i] = el}
                onClick={() => { if (item.id === "__more__") { setMoreOpen(v => !v); } else { setMoreOpen(false); setPage(item.id); } }}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: "7px 4px", borderRadius: 999, cursor: "pointer", color: isActive ? T.accent : T.fg3, transition: "color 0.15s", position: "relative", zIndex: 1, fontFamily: T.sans }}>
                {item.id === "__more__"
                  ? <span style={{ fontSize: 18, lineHeight: 1 }}>⋯</span>
                  : <Icon name={item.icon} size={20} color={isActive ? T.accent : T.fg3} />
                }
                <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, lineHeight: 1, marginTop: 1 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Admin "More" sheet */}
      {moreOpen && (
        <>
          <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
          <div className="slide-up" style={{ position: "fixed", bottom: 84, left: 12, right: 12, background: T.surface, borderRadius: 16, padding: "6px 6px 4px", zIndex: 99, boxShadow: "0 -4px 24px rgba(0,0,0,.12)", border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.fg3, letterSpacing: ".05em", textTransform: "uppercase", padding: "8px 12px 6px", fontWeight: 500 }}>Admin</div>
            {moreItems.map(item => (
              <button key={item.id} onClick={() => { setPage(item.id); setMoreOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px", border: "none", background: page === item.id ? T.accL : "transparent", borderRadius: 10, color: page === item.id ? T.accent : T.fg2, fontSize: 13, fontWeight: page === item.id ? 600 : 400, cursor: "pointer", fontFamily: T.sans, textAlign: "left", marginBottom: 2 }}>
                <Icon name={item.icon} size={18} color={page === item.id ? T.accent : T.fg2} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ChamaFlow({ onLogout }) {
  // ── Auth — derive role from stored token ──
  const [role,        setRole]        = useState("Member");
  const [currentUser, setCurrentUser] = useState(null);

  // ── Navigation & layout ──
  const [page,     setPage]     = useState("dashboard");
  const [viewMode, setViewMode] = useState(() => window.innerWidth >= 640 ? "desktop" : "mobile");
  const [moreOpen, setMoreOpen] = useState(false);

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
  const loadMembers = useCallback(() => {
    setLoad("members", true);
    api.getMembers()
      .then(setMembers)
      .catch(() => showToast("Could not load members", "error"))
      .finally(() => setLoad("members", false));
  }, []);
  useEffect(() => { loadMembers(); }, [loadMembers]);

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
  const loadContributions = useCallback(() => {
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

  useEffect(() => { loadContributions(); }, [loadContributions]);

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

  const [deletingContribId, setDeletingContribId] = useState(null);
  const [deleteContribTarget, setDeleteContribTarget] = useState(null); // { id, member_name, month, type, amount }
  const handleDeleteContrib = async () => {
    if (!deleteContribTarget) return;
    const { id } = deleteContribTarget;
    setDeletingContribId(id);
    try {
      await api.deleteContribution(id);
      setContributions(prev => prev.filter(c => c.id !== id));
      showToast("Record deleted");
      setDeleteContribTarget(null);
    } catch (e) {
      showToast("Failed to delete", "error");
    } finally {
      setDeletingContribId(null);
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
  // Group nav items by section for desktop sidebar
  const navSections = ["Track","Admin","Other"];
  const visibleNav  = NAV_ITEMS.filter(n => isAdmin || !n.adminOnly);

  // Compute cycle progress (% of year elapsed)
  const cycleProgress = Math.round(((now.getMonth() + 1) / 12) * 100);
  const activeMemberCount = members.filter(m => m.active).length;

  return (
    <div className="app-shell">

      {/* Desktop sidebar */}
      {viewMode === "desktop" && (
        <nav className="nav">
          <div className="nav-logo">
            <div className="logomark">KA</div>
            <div>
              <div className="brand-name">Kaabazim</div>
              <div className="brand-sub">Self Help Group</div>
            </div>
          </div>

          <div className="nav-body">
            {navSections.map(sec => {
              const items = visibleNav.filter(n => n.section === sec);
              if (items.length === 0) return null;
              return (
                <div key={sec} className="nav-sec">
                  <div className="nav-sec-lbl">{sec}</div>
                  {items.map(item => {
                    const active = page === item.id;
                    return (
                      <button key={item.id} className={`nl${active ? " on" : ""}`} onClick={() => setPage(item.id)}>
                        <Icon name={item.icon} size={17} color={active ? "var(--accent)" : "var(--fg3)"} className="nl-icon" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="nav-foot">
            {/* Cycle progress */}
            <div className="cycle-bar">
              <div className="cycle-lbl">{now.getFullYear()} · Month {now.getMonth() + 1} of 12</div>
              <div className="cycle-track"><div className="cycle-fill" style={{ width: `${cycleProgress}%` }} /></div>
              <div className="cycle-pct">{cycleProgress}% through the year</div>
            </div>
            {/* API status */}
            {apiOnline !== null && (
              <div className="api-dot">
                <div className="api-dot-ind" style={{ background: apiOnline ? "var(--green)" : "var(--red)" }} />
                <span style={{ fontSize: 11, color: apiOnline ? "var(--green)" : "var(--red)" }}>{apiOnline ? "Connected" : "API offline"}</span>
                <button onClick={onLogout} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--fg3)", fontSize: 11, cursor: "pointer", padding: 0 }}>
                  <Icon name="logout" size={13} color="var(--fg3)" />
                </button>
              </div>
            )}
            {currentUser && (
              <div className="nav-user">
                <div className="uav">{currentUser.name?.slice(0,2).toUpperCase()}</div>
                <div style={{ overflow: "hidden" }}>
                  <div className="uname">{currentUser.name}</div>
                  <div className="urole">{role}</div>
                </div>
              </div>
            )}
          </div>
        </nav>
      )}

      {/* Main area */}
      <div className="main-area">
        {/* Mobile header */}
        {viewMode === "mobile" && (
          <div className="mobile-header">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 26, height: 26, background: "var(--fg)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 9 }}>KA</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Kaabazim</div>
                <div style={{ fontSize: 10, color: "var(--fg3)" }}>{role}</div>
              </div>
            </div>
            {currentUser && (
              <div className="uav">{currentUser.name?.slice(0,2).toUpperCase()}</div>
            )}
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", padding: viewMode === "mobile" ? "0 0 96px" : 0 }}>
          {!apiOnline && apiOnline !== null && (
            <div className="api-offline">
              <div style={{ fontWeight: 700, color: "#e65100", marginBottom: 4 }}>API server is offline</div>
              <div style={{ fontSize: 12, color: "#bf360c" }}>Run <code style={{ background: "#ffe0b2", padding: "1px 6px", borderRadius: 4 }}>node server.js</code> in the backend folder to start the API.</div>
            </div>
          )}

          <div className={viewMode === "desktop" ? "main" : ""} style={viewMode === "mobile" ? { padding: 0 } : {}}>
            {page === "dashboard"     && <DashboardPage dashboard={dashboard} loading={loading.dashboard} member={currentUser} role={role} setPage={setPage} viewMode={viewMode} onRefresh={loadDashboard} members={members} showToast={showToast} />}
            {page === "contributions" && <ContributionsPage contributions={contributions} members={members} isAdmin={isAdmin} loading={loading.contributions} filterYear={filterYear} setFilterYear={setFilterYear} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterMember={filterMember} setFilterMember={setFilterMember} filterType={filterType} setFilterType={setFilterType} onConfirm={handleConfirmContrib} confirmingId={confirmingId} onDelete={c => setDeleteContribTarget(c)} deletingContribId={deletingContribId} selectStyle={selectStyle} onRefresh={loadContributions} setPage={setPage} />}
            {page === "meetings"      && <MeetingsPage meetings={meetings} loading={loading.meetings} isAdmin={isAdmin} currentUser={currentUser} setSelectedMeeting={setSelectedMeeting} setTranscriptMeeting={setTranscriptMeeting} showToast={showToast} onRefresh={loadMeetings} viewMode={viewMode} />}
            {page === "record"  && isAdmin && <RecordPage members={members} summary={monthlySummary} loading={loading.summary || loading.record} recordForm={recordForm} setRecordForm={setRecordForm} onSubmit={handleRecordContrib} onBulkImport={handleBulkImport} selectStyle={selectStyle} />}
            {page === "members" && isAdmin && <MembersPage members={members} loading={loading.members} onAdd={() => setAddMemberModal(true)} onToggle={handleToggleActive} onEdit={m => setEditMember(m)} viewMode={viewMode} showToast={showToast} onRefresh={loadMembers} />}
            {page === "report"  && isAdmin && <AnnualReportPage report={annualReport} loading={loading.report} year={reportYear} setYear={setReportYear} />}
            {page === "settings"      && <SettingsPage role={role} currentUser={currentUser} onLogout={onLogout} memberCount={activeMemberCount} />}
            {page === "capital"  && isAdmin && <CapitalSheetPage members={members} showToast={showToast} onRefresh={loadMembers} />}
            {page === "mybalance"             && <MyBalancePage currentUser={currentUser} showToast={showToast} />}
          </div>
        </div>

        {/* Mobile floating nav */}
        {viewMode === "mobile" && (
          <MobileNav isAdmin={isAdmin} page={page} setPage={setPage} moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
        )}
      </div>

      {/* Modals & Overlays */}
      {selectedMeeting   && <PDFModal meeting={selectedMeeting} members={members} onClose={() => setSelectedMeeting(null)} />}
      {transcriptMeeting && <TranscriptPanel meeting={transcriptMeeting} onClose={() => setTranscriptMeeting(null)} />}
      {addMemberModal    && <AddMemberModal onClose={() => setAddMemberModal(false)} onAdd={handleAddMember} members={members} />}
      {editMember      && <EditMemberModal member={editMember} onClose={() => setEditMember(null)} onSave={handleEditMember} />}
      {deleteContribTarget && <DeleteContribModal contrib={deleteContribTarget} onClose={() => setDeleteContribTarget(null)} onConfirm={handleDeleteContrib} deleting={!!deletingContribId} />}

      {/* Toast */}
      {toast && (
        <div className="toast-in" style={{ position: "fixed", bottom: 100, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--fg)" : "var(--red)", color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 28px rgba(0,0,0,0.25)", maxWidth: 300 }}>
          {toast.type === "success" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}


// ── Dashboard Page ─────────────────────────────────────────────────────────────

const AVATAR_CLASSES = ["a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11"];

function DashboardPage({ dashboard, loading, member, role, setPage, viewMode, onRefresh, members, showToast }) {
  const isDesktop = viewMode === "desktop";
  const [myBal,     setMyBal]     = useState(null);
  const [unpaid,    setUnpaid]    = useState(null);
  const [fineApply, setFineApply] = useState(false);
  const isAdmin = role === "Chairman" || role === "Secretary";

  useEffect(() => {
    api.getMyBalance().then(setMyBal).catch(() => {});
  }, [member?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getUnpaidCheck(CURRENT_MONTH).then(setUnpaid).catch(() => {});
  }, [isAdmin]);

  const handleApplyFines = async () => {
    setFineApply(true);
    try {
      const res = await api.autoMonthlyFines(CURRENT_MONTH);
      onRefresh();
      api.getUnpaidCheck(CURRENT_MONTH).then(setUnpaid).catch(() => {});
      showToast
        ? showToast(`${res.generated.length} fine${res.generated.length !== 1 ? "s" : ""} applied for ${CURRENT_MONTH}`, "success")
        : alert(`${res.generated.length} fines applied`);
    } catch (e) {
      showToast ? showToast(e.message, "error") : alert(e.message);
    } finally {
      setFineApply(false);
    }
  };

  if (loading) return (
    <div style={{ padding: isDesktop ? 0 : 20 }}>
      <div style={{ marginBottom: 24 }}><Skeleton h={14} w={80} /><div style={{ marginTop: 8 }}><Skeleton h={28} w={200} /></div></div>
      <Skeleton h={100} r={12} />
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>{[1,2,3,4].map(k=><Skeleton key={k} h={90} r={12}/>)}</div>
    </div>
  );

  const totalSavings    = dashboard?.total_savings    ?? 0;
  const monthlyExpected = dashboard?.monthly_expected ?? (member?.shares || 1) * 5000;
  const monthlyPaid     = dashboard?.monthly_paid     ?? 0;
  const isPaid          = dashboard?.contribution_status === "Paid";
  const pct             = Math.min((monthlyPaid / monthlyExpected) * 100, 100);
  const circumference   = 2 * Math.PI * 24; // r=24
  const strokeOffset    = circumference - (pct / 100) * circumference;
  const activeMembers   = members ? members.filter(m => m.active) : [];
  const paidThisMonth   = dashboard?.monthly_paid_members ?? 0;
  const pendingCount    = activeMembers.length - paidThisMonth;

  const pad = isDesktop ? 0 : 20;

  return (
    <div style={{ padding: pad }} className="fade-up">
      {/* Topbar */}
      {isDesktop && (
        <div className="topbar">
          <input className="search-box" placeholder="Search members, contributions…" readOnly />
          <div className="tbr">
            <div className="icon-btn">🔔<span className="dot"/></div>
            <button className="btn btn-o btn-sm" onClick={() => setPage("record")}>Import Data</button>
            <button className="btn btn-p btn-sm" onClick={() => setPage("record")}>+ Add Contribution</button>
          </div>
        </div>
      )}

      <div className="page-h">Dashboard</div>
      <div className="page-sub">{CURRENT_MONTH} · Kaabazim Self Help Group</div>

      {/* Auto-fine alert for admins */}
      {isAdmin && unpaid && unpaid.unpaid.filter(m => !m.already_fined).length > 0 && (
        <div style={{ background: "#fff8e1", border: "1px solid #ffc107", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#7c5700" }}>
                {unpaid.unpaid.filter(m => !m.already_fined).length} member{unpaid.unpaid.filter(m => !m.already_fined).length !== 1 ? "s" : ""} haven't contributed for {CURRENT_MONTH}
              </div>
              <div style={{ fontSize: 11, color: "#9a6900", marginTop: 2 }}>
                10% interest fine per share · Total: KES {unpaid.total_fine.toLocaleString()} pending
                {" · "}
                {unpaid.unpaid.filter(m => !m.already_fined).map(m => m.name.split(" ")[0]).join(", ")}
              </div>
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={handleApplyFines}
            disabled={fineApply}
            style={{ background: "#e65100", color: "#fff", border: "none", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {fineApply ? "Applying…" : "Apply Fines"}
          </button>
        </div>
      )}
      {isAdmin && unpaid && unpaid.unpaid.filter(m => !m.already_fined).length === 0 && unpaid.unpaid.length > 0 && (
        <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#2e7d32", display: "flex", gap: 8, alignItems: "center" }}>
          <span>✓</span> Interest fines already applied for {CURRENT_MONTH} ({unpaid.unpaid.length} unpaid member{unpaid.unpaid.length !== 1 ? "s" : ""})
        </div>
      )}

      {/* Status banner */}
      <div className="status-banner">
        <div className="ring-wrap">
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle className="rt" cx="30" cy="30" r="24"/>
            <circle className={`rf${isPaid ? " paid" : ""}`} cx="30" cy="30" r="24"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}/>
          </svg>
          <div className="ring-lbl">
            <span className="ring-pct">{Math.round(pct)}%</span>
            <span className="ring-sub">PAID</span>
          </div>
        </div>
        <div className="sb-body">
          <div className="sb-lbl">{CURRENT_MONTH} · Collection Status</div>
          <div className="sb-title">
            {isPaid ? `You are paid up for ${CURRENT_MONTH}` : `${fmt(monthlyPaid)} of ${fmt(monthlyExpected)} collected`}
          </div>
          <div className="sb-hint">
            {isPaid ? "Great work — all contributions confirmed." : `${pendingCount} member${pendingCount !== 1 ? "s" : ""} pending · Due ${CURRENT_MONTH}`}
          </div>
        </div>
        <div className="sb-actions">
          <button className="btn btn-o btn-sm" onClick={onRefresh}>↻ Refresh</button>
          <button className="btn btn-p btn-sm" onClick={() => setPage("record")}>Record</button>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="metrics">
        {[
          { lbl: "Total Savings", val: fmt(totalSavings), ch: "All-time", ico: "💰" },
          { lbl: "Monthly Target", val: fmt(monthlyExpected), ch: CURRENT_MONTH, ico: "📅" },
          { lbl: "Active Members", val: activeMembers.length, ch: `${paidThisMonth} paid this month`, ico: "👥" },
          { lbl: "Pending", val: pendingCount, ch: "need to pay", ico: "⏳" },
        ].map(m => (
          <div key={m.lbl} className="metric">
            <div className="m-ico">{m.ico}</div>
            <div className="m-lbl">{m.lbl}</div>
            <div className="m-val">{m.val}</div>
            <div className="m-ch">{m.ch}</div>
          </div>
        ))}
      </div>

      {/* My Balance card */}
      {myBal && (
        <div className="card" style={{ marginBottom: 16, background: "var(--fg)", color: "#fff", borderColor: "transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", opacity: .65, marginBottom: 4 }}>My Balance</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 400, lineHeight: 1 }}>
                {fmt(myBal.net_balance)}
              </div>
              <div style={{ fontSize: 12, opacity: .6, marginTop: 4 }}>{member?.shares} share{member?.shares !== 1 ? "s" : ""} · {member?.role}</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { lbl: "Contributions", val: myBal.confirmed_contributions, color: "#4ade80" },
                { lbl: "Deductions",    val: myBal.total_deductions,         color: "#f87171" },
                { lbl: "Pending",       val: myBal.pending_contributions,    color: "#fbbf24" },
              ].map(({ lbl, val, color }) => (
                <div key={lbl} style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, opacity: .6, letterSpacing: ".05em", textTransform: "uppercase" }}>{lbl}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 2 }}>{fmt(val)}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setPage("mybalance")}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
              View details →
            </button>
          </div>
        </div>
      )}

      {/* Member grid */}
      <div className="sec-row">
        Member activity <span className="ccount">{activeMembers.length}</span>
        <button className="sec-link" onClick={() => setPage("members")}>View all →</button>
      </div>
      <div className="mg">
        {activeMembers.slice(0, 6).map((m, i) => {
          const initials = m.name?.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
          const avCls = AVATAR_CLASSES[i % AVATAR_CLASSES.length];
          return (
            <div key={m.id} className="mc">
              <div className="mc-top">
                <div className={`mc-av ${avCls}`}>{initials}</div>
                <div>
                  <div className="mc-name">{m.name}</div>
                  <div className="mc-role">{m.role}</div>
                </div>
                <span className="pill pill-b" style={{ marginLeft: "auto" }}>
                  {m.shares} share{m.shares > 1 ? "s" : ""}
                </span>
              </div>
              <div className="mc-desc">{m.phone}</div>
              <div className="mc-ft">
                <div className="mc-kv"><div className="k">Monthly</div><div className="v">{fmt(m.shares * 5000)}</div></div>
                <div className="mc-kv"><div className="k">Status</div><div className="v" style={{ color: "var(--fg2)" }}>—</div></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lower: recent contributions + quick actions */}
      <div className="lower">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">Recent Contributions</span>
            <button className="sec-link" onClick={() => setPage("contributions")}>View all →</button>
          </div>
          {dashboard?.recent_contributions?.length > 0 ? (
            <table className="contrib-table">
              <thead>
                <tr>
                  <th>Member</th><th>Month</th><th>Type</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent_contributions.slice(0, 8).map(c => {
                  const tm = TYPE_META[c.type] || TYPE_META.Contribution;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.member_name || member?.name}</td>
                      <td style={{ color: "var(--fg2)" }}>{c.month}</td>
                      <td><span className="pill pill-n">{c.type}</span></td>
                      <td className="amount-col" style={{ color: tm.text }}>{fmt(c.amount)}</td>
                      <td>
                        <span className={`pill ${c.status === "Confirmed" ? "pill-g" : "pill-a"}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState type="activity" title="No recent activity" subtitle="Contributions will appear here." />
          )}
        </div>

        <div className="card tasks-panel">
          <div className="card-hd">
            <span className="card-title">Quick Actions</span>
          </div>
          <div className="task-list">
            {[
              { lbl: "Record this month's contributions", p: "ph", onClick: () => setPage("record") },
              { lbl: "Review pending payments", p: "pm", onClick: () => setPage("contributions") },
              { lbl: "Schedule next meeting", p: "pn", onClick: () => setPage("meetings") },
              { lbl: "View annual report", p: "pn", onClick: () => setPage("report") },
            ].map((t, i) => (
              <div key={i} className="task" style={{ cursor: "pointer" }} onClick={t.onClick}>
                <div className="tck"/>
                <span className="tsk-lbl">{t.lbl}</span>
                <span className={`tsk-p ${t.p}`}>{t.p === "ph" ? "High" : t.p === "pm" ? "Med" : "Low"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contributions Page ────────────────────────────────────────────────────────

function ContributionsPage({ contributions, members, isAdmin, loading, filterYear, setFilterYear, filterStatus, setFilterStatus, filterMember, setFilterMember, filterType, setFilterType, onConfirm, confirmingId, onDelete, deletingContribId, selectStyle, onRefresh, setPage }) {
  const totalShares      = members.filter(m => m.active).reduce((s,m) => s + (m.shares || 1), 0);
  const totalFines       = contributions.filter(c => c.type === "Fine").reduce((s,c) => s+c.amount, 0);
  const totalLateness    = contributions.filter(c => c.type === "Lateness").reduce((s,c) => s+c.amount, 0);
  const grandTotal       = contributions.reduce((s,c) => s+c.amount, 0);
  const selectedMemberName = members.find(m => m.id === parseInt(filterMember))?.name;

  return (
    <div style={{ padding: 20 }} className="fade-up">
      {/* Topbar */}
      <div className="topbar">
        <div className="page-h" style={{ marginBottom: 0 }}>Contributions</div>
        <div className="tbr">
          <button className="btn btn-o btn-sm" onClick={onRefresh} disabled={loading}>↻ Refresh</button>
          {isAdmin && <button className="btn btn-p btn-sm" onClick={() => setPage("record")}>+ Record</button>}
        </div>
      </div>
      <div className="page-sub">
        {isAdmin ? (filterMember !== "All" ? `Viewing: ${selectedMemberName}` : "All members") : "Your payment history"}
      </div>

      {/* Summary card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="summary-year">{filterYear} TOTAL</div>
            <div className="summary-total">{fmt(grandTotal)}</div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
            {[["SHARES", `${totalShares}`, "var(--accent)"], ["FINES", totalFines > 0 ? fmt(totalFines) : "—", "var(--red)"], ["LATENESS", totalLateness > 0 ? fmt(totalLateness) : "—", "var(--amber)"]].map(([k,v,c]) => (
              <div key={k}>
                <div style={{ fontSize: 9, color: "var(--fg3)", letterSpacing: .5 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 10, padding: 3 }}>
          {[String(now.getFullYear()-1), String(now.getFullYear())].map(y => (
            <button key={y} onClick={() => setFilterYear(y)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: filterYear === y ? "#fff" : "transparent", color: filterYear === y ? "var(--fg)" : "var(--fg3)", boxShadow: filterYear === y ? "var(--shadow)" : "none" }}>{y}</button>
          ))}
        </div>
        <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 10, padding: 3 }}>
          {["All","Confirmed","Pending"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 10px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s", background: filterStatus === s ? "#fff" : "transparent", color: filterStatus === s ? "var(--fg)" : "var(--fg3)", boxShadow: filterStatus === s ? "var(--shadow)" : "none" }}>{s}</button>
          ))}
        </div>
        {isAdmin && (
          <>
            <select className="filter-select" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
              <option value="All">All Members</option>
              {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="All">All Types</option>
              <option value="Contribution">Contribution</option>
              <option value="Fine">Fine</option>
              <option value="Lateness">Lateness</option>
              <option value="Late Contribution">Late Contribution</option>
            </select>
          </>
        )}
        {(filterMember !== "All" || filterType !== "All") && (
          <>
            {filterMember !== "All" && <Chip label={`👤 ${selectedMemberName?.split(" ")[0]}`} onRemove={() => setFilterMember("All")} dark />}
            {filterType !== "All" && <Chip label={filterType} onRemove={() => setFilterType("All")} />}
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 12 }}>
        {loading ? "Loading…" : `${contributions.length} record${contributions.length !== 1 ? "s" : ""}`}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(k => <Skeleton key={k} h={48} r={8} />)}
        </div>
      ) : contributions.length === 0 ? (
        <EmptyState
          type="contributions"
          title="No contributions found"
          subtitle={filterMember !== "All" || filterStatus !== "All" || filterType !== "All"
            ? "Try adjusting your filters." : "No payments recorded yet."}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="contrib-table">
            <thead>
              <tr>
                {isAdmin && <th>Member</th>}
                <th>Month</th>
                <th>Type</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {contributions.map((c, i) => {
                const tm = TYPE_META[c.type] || TYPE_META.Contribution;
                return (
                  <tr key={c.id} style={{ animation: `fadeUp 0.2s ease ${Math.min(i,12)*0.03}s both` }}>
                    {isAdmin && <td style={{ fontWeight: 500 }}>{c.member_name}</td>}
                    <td style={{ color: "var(--fg2)" }}>{c.month}</td>
                    <td><span className="pill pill-n">{c.type}</span></td>
                    <td style={{ color: "var(--fg2)" }}>{c.method}</td>
                    <td className="amount-col" style={{ color: tm.text }}>{fmt(c.amount)}</td>
                    <td>
                      <span className={`pill ${c.status === "Confirmed" ? "pill-g" : "pill-a"}`}>{c.status}</span>
                    </td>
                    {isAdmin && (
                      <td style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                        {c.status === "Pending" && (
                          <button className="btn btn-p btn-sm" onClick={() => onConfirm(c.id)} disabled={confirmingId === c.id} style={{ padding: "4px 10px", fontSize: 11 }}>
                            {confirmingId === c.id ? "…" : "Confirm"}
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(c)}
                          disabled={deletingContribId === c.id}
                          style={{ padding: "4px 8px", fontSize: 11, background: "none", border: "1px solid var(--red)", color: "var(--red)", borderRadius: 6, cursor: "pointer", lineHeight: 1, opacity: deletingContribId === c.id ? 0.5 : 1 }}
                        >
                          {deletingContribId === c.id ? "…" : "✕"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Delete Contribution Modal ─────────────────────────────────────────────────

function ModalCloseBtn({ onClick }) {
  return (
    <button className="modal-close" onClick={onClick} aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M1 1l12 12M13 1L1 13"/>
      </svg>
    </button>
  );
}

function DeleteContribModal({ contrib, onClose, onConfirm, deleting }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Delete Record</div>
            <div className="modal-sub">This action cannot be undone</div>
          </div>
          <ModalCloseBtn onClick={onClose} />
        </div>

        <div className="modal-body" style={{ paddingTop: 20 }}>
          <div className="modal-danger-card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div className="modal-danger-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>Permanently deleting:</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>{contrib.member_name}</div>
              <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ background: "var(--sf3)", borderRadius: 6, padding: "2px 8px", fontWeight: 500 }}>{contrib.month}</span>
                <span style={{ background: "var(--sf3)", borderRadius: 6, padding: "2px 8px", fontWeight: 500 }}>{contrib.type}</span>
                <span style={{ fontWeight: 700, color: "var(--red)" }}>{fmt(contrib.amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="modal-btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <><Spinner /> Deleting…</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Delete Record
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onRemove, dark, bg, color, border }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: dark ? "var(--fg)" : (bg || "var(--sf2)"), color: dark ? "#f0ede6" : (color || "var(--fg2)"), border: border ? `1px solid ${border}` : "none", padding: "4px 10px 4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {label}
      <button onClick={onRemove} style={{ background: "rgba(128,128,128,0.2)", border: "none", color: "inherit", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, cursor: "pointer", padding: 0 }}>✕</button>
    </div>
  );
}

// ── Meetings Page ─────────────────────────────────────────────────────────────

function lastThursdayOf(year, month) {
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay(); // 0=Sun … 4=Thu … 6=Sat
  const offset = (dow >= 4) ? dow - 4 : dow + 3;
  return new Date(year, month, lastDay.getDate() - offset);
}

function MeetingsPage({ meetings, loading, isAdmin, currentUser, setSelectedMeeting, setTranscriptMeeting, showToast, onRefresh, viewMode }) {
  const [showRec,           setShowRec]           = useState(false);
  const [recMonth,          setRecMonth]          = useState("");
  const [recording,         setRecording]         = useState(false);
  const [transcribing,      setTranscribing]      = useState(false);
  const [waveform,          setWaveform]          = useState([]);
  const [aiProvider]                              = useState("groq");
  const [transcribeDone,    setTranscribeDone]    = useState(false);
  const [transcribedMtg,    setTranscribedMtg]    = useState(null);
  const [endorseTarget,    setEndorseTarget]    = useState(null);
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [deleteConfirm,    setDeleteConfirm]    = useState(null);
  const [deleting,         setDeleting]         = useState(false);
  const [calView,          setCalView]          = useState(false);
  const [calDate,          setCalDate]          = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [scheduleDay,      setScheduleDay]      = useState(null);
  const [scheduling,       setScheduling]       = useState(false);
  const [schedLoc,         setSchedLoc]         = useState("");
  const [schedAgenda,      setSchedAgenda]      = useState("");
  const [showSchedGen,     setShowSchedGen]     = useState(false);
  const [schedGenLoc,      setSchedGenLoc]      = useState("");
  const [schedGenCreating, setSchedGenCreating] = useState(false);

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
        const updatedMeeting = await api.transcribeMeeting(meetingId, audioBlob, aiProvider);
        showToast("Transcript saved — AI minutes generating…");
        onRefresh();
        setTranscribedMtg(updatedMeeting || capturedMeeting || { id: meetingId });
        setTranscribeDone(true);
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
          <div style={{ fontSize: 24, fontWeight: 400, color: T.fg, fontFamily: T.serif }}>Meetings</div>
          <div style={{ fontSize: 12, color: T.fg3, marginTop: 2 }}>{meetings.length} meetings</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={() => setCalView(v => !v)}
            style={{ background: calView ? T.fg : T.sf2, color: calView ? "#fff" : T.fg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 500 }}>
            {calView ? "☰ List" : "📅 Calendar"}
          </button>
          {isAdmin && (
            <button className="btn" onClick={() => { setShowRec(v => !v); setRecording(false); setTranscribing(false); setTranscribeDone(false); setTranscribedMtg(null); setRecMonth(""); }}
              style={{ background: showRec ? T.fg : T.accent, color: "#fff", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600 }}>
              {showRec ? "✕ Close" : "🎙 Record Meeting"}
            </button>
          )}
        </div>
      </div>

      {/* AI Recorder Modal — admin only */}
      {showRec && isAdmin && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget && !recording && !transcribing) { setShowRec(false); setRecMonth(""); setTranscribeDone(false); setTranscribedMtg(null); } }}>
          <div style={{ background: T.surface, borderRadius: 20, padding: 28, width: "100%", maxWidth: 540, fontFamily: T.sans, border: `1px solid ${T.border}`, boxShadow: "0 24px 48px rgba(0,0,0,.2)" }} className="fade-up">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: T.fg }}>Record Meeting</div>
              {!recording && !transcribing && (
                <button onClick={() => { setShowRec(false); setRecMonth(""); setTranscribeDone(false); setTranscribedMtg(null); }}
                  style={{ background: T.sf2, border: "none", borderRadius: 8, width: 30, height: 30, color: T.fg2, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              )}
            </div>

            {transcribeDone ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.fg, marginBottom: 8 }}>Transcription complete!</div>
                <div style={{ fontSize: 13, color: T.fg2, marginBottom: 28, lineHeight: 1.6 }}>
                  AI meeting minutes are being generated by Claude.<br />They'll be ready in a few seconds.
                </div>
                <button className="btn" onClick={() => { setTranscriptMeeting(transcribedMtg); setShowRec(false); setTranscribeDone(false); setTranscribedMtg(null); setRecMonth(""); }}
                  style={{ width: "100%", background: T.accent, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, fontFamily: "inherit", marginBottom: 10 }}>
                  View Minutes
                </button>
                <button onClick={() => { setTranscribeDone(false); setTranscribedMtg(null); setRecMonth(""); }}
                  style={{ background: "none", border: "none", color: T.fg3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Record another meeting
                </button>
              </div>
            ) : (
              <>
                {/* Month selector */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, color: T.fg3, letterSpacing: ".05em", marginBottom: 6, fontWeight: 500 }}>SELECT MEETING MONTH</div>
                  <select value={recMonth} onChange={e => setRecMonth(e.target.value)} disabled={recording || transcribing}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.sf2, color: T.fg, fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                    <option value="">Choose month…</option>
                    {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {recMeeting && (
                    <div style={{ fontSize: 12, color: T.green, marginTop: 6 }}>✓ {recMeeting.date} — {recMeeting.location}</div>
                  )}
                  {recMonth && !recMeeting && (
                    <div style={{ fontSize: 12, color: T.amber, marginTop: 6 }}>◎ No meeting scheduled yet — a placeholder will be created automatically</div>
                  )}
                </div>

                {/* Waveform */}
                <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginBottom: 18, overflow: "hidden", background: T.sf2, borderRadius: 12, border: `1px solid ${T.border}` }}>
                  {recording
                    ? waveform.map((h, i) => <div key={i} style={{ width: 3, height: h, background: T.accent, borderRadius: 2, transition: "height 0.05s" }} />)
                    : Array.from({ length: 40 }).map((_, i) => <div key={i} style={{ width: 3, height: 6, background: T.border, borderRadius: 2 }} />)
                  }
                </div>

                {/* Controls */}
                {transcribing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", padding: 14 }}>
                    <div style={{ width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    <span style={{ fontSize: 14, color: T.fg2 }}>Transcribing audio…</span>
                  </div>
                ) : recording ? (
                  <button className="btn" onClick={handleStopRecording}
                    style={{ width: "100%", background: T.red, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, fontFamily: "inherit", animation: "pulse 1.5s infinite" }}>
                    ⏹ Stop &amp; Transcribe
                  </button>
                ) : (
                  <button className="btn" onClick={handleStartRecording} disabled={!recMonth}
                    style={{ width: "100%", background: recMonth ? T.accent : T.sf2, color: recMonth ? "#fff" : T.fg3, border: recMonth ? "none" : `1px solid ${T.border}`, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
                    ⏺ Start Recording
                  </button>
                )}
                <div style={{ fontSize: 11, color: T.fg3, textAlign: "center", marginTop: 12 }}>
                  Audio transcribed by Groq Whisper · Minutes generated by Claude AI
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Meeting cards — newest first */}
      {/* ── Calendar view ─────────────────────────────────────────── */}
      {calView && (() => {
        const CAL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const CAL_DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        const cy = calDate.getFullYear();
        const cm = calDate.getMonth();
        const firstDow  = new Date(cy, cm, 1).getDay();
        const daysInMo  = new Date(cy, cm + 1, 0).getDate();
        const todayDate = new Date();

        const dayMtgMap = {};
        meetings.forEach(m => {
          const mi = CAL_MONTHS.findIndex(mn => m.date.toLowerCase().includes(mn.toLowerCase()));
          const yr = (m.date.match(/\d{4}/) || [])[0];
          const dy = (m.date.match(/\b(\d{1,2})\b/) || [])[1];
          if (mi === cm && parseInt(yr) === cy && dy) dayMtgMap[parseInt(dy)] = m;
        });

        const cells = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMo; d++) cells.push(d);

        return (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={() => setCalDate(new Date(cy, cm - 1, 1))} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", padding: "2px 8px", lineHeight: 1 }}>‹</button>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1A1A1A" }}>{CAL_MONTHS[cm]} {cy}</div>
              <button onClick={() => setCalDate(new Date(cy, cm + 1, 1))} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", padding: "2px 8px", lineHeight: 1 }}>›</button>
            </div>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
              {CAL_DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#BBB", padding: "2px 0", letterSpacing: 0.3 }}>{d}</div>)}
            </div>
            {/* Day cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} />;
                const hasMtg   = !!dayMtgMap[day];
                const isToday  = cy === todayDate.getFullYear() && cm === todayDate.getMonth() && day === todayDate.getDate();
                const cellDate = new Date(cy, cm, day);
                const isPast   = cellDate < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
                const canSched = isAdmin && !hasMtg && !isPast;
                return (
                  <div key={day}
                    onClick={() => {
                      if (hasMtg) setTranscriptMeeting(dayMtgMap[day]);
                      else if (canSched) setScheduleDay(cellDate);
                    }}
                    style={{
                      textAlign: "center",
                      padding: "6px 2px 4px",
                      borderRadius: 10,
                      cursor: (hasMtg || canSched) ? "pointer" : "default",
                      background: isToday ? "#1A1A1A" : hasMtg ? "#FBF5EC" : "transparent",
                      transition: "background 0.12s",
                    }}>
                    <div style={{ fontSize: 13, fontWeight: (isToday || hasMtg) ? 700 : 400, color: isToday ? "#fff" : hasMtg ? "#A07850" : isPast ? "#CCC" : "#333" }}>{day}</div>
                    {hasMtg && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C8A97E", margin: "2px auto 0" }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              {isAdmin
                ? <div style={{ fontSize: 10, color: "#CCC" }}>Tap a future date to schedule a meeting</div>
                : <div />}
              {isAdmin && (
                <button onClick={() => setShowSchedGen(true)}
                  style={{ background: "none", border: "1px solid #E0D8CC", borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 600, color: "#A07850", cursor: "pointer" }}>
                  🔁 Generate schedule
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Recurring schedule generator ───────────────────────────── */}
      {showSchedGen && isAdmin && createPortal((() => {
        const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Next 12 last-Thursdays from this month onward
        const slots = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          return lastThursdayOf(d.getFullYear(), d.getMonth());
        }).filter(d => d >= today);

        // Which slots already have a meeting in that month+year?
        const existingKeys = new Set(
          meetings.map(m => {
            const mi = MN.findIndex(mn => m.date.toLowerCase().includes(mn.toLowerCase()));
            const yr = (m.date.match(/\d{4}/) || [])[0];
            return (mi >= 0 && yr) ? `${mi}-${yr}` : null;
          }).filter(Boolean)
        );

        const newSlots = slots.filter(d => !existingKeys.has(`${d.getMonth()}-${d.getFullYear()}`));
        const skipCount = slots.length - newSlots.length;

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9997, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowSchedGen(false); }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420 }} className="fade-up">
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>🔁 Generate Meeting Schedule</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
                Last Thursday of each month — next {slots.length} months
              </div>

              {/* Date list */}
              <div style={{ background: "#F7F6F2", borderRadius: 12, padding: "10px 14px", marginBottom: 18, maxHeight: 220, overflowY: "auto" }}>
                {slots.map(d => {
                  const key = `${d.getMonth()}-${d.getFullYear()}`;
                  const exists = existingKeys.has(key);
                  const label = `${MN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #ECEAE4" }}>
                      <span style={{ fontSize: 13, color: exists ? "#BBB" : "#1A1A1A", fontWeight: exists ? 400 : 500 }}>{label}</span>
                      {exists
                        ? <span style={{ fontSize: 10, color: "#BBB", fontStyle: "italic" }}>already scheduled</span>
                        : <span style={{ fontSize: 10, color: "#4CAF50", fontWeight: 600 }}>+ new</span>}
                    </div>
                  );
                })}
              </div>

              {/* Default location */}
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>Default location for all meetings</div>
              <input value={schedGenLoc} onChange={e => setSchedGenLoc(e.target.value)}
                placeholder="e.g. Village Hall, Zoom, Member's Home"
                style={{ width: "100%", border: "1.5px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 6, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
              {skipCount > 0 && (
                <div style={{ fontSize: 11, color: "#BBB", marginBottom: 14 }}>
                  {skipCount} month{skipCount > 1 ? "s" : ""} already have a meeting and will be skipped.
                </div>
              )}
              {!skipCount && <div style={{ marginBottom: 14 }} />}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowSchedGen(false); setSchedGenLoc(""); }}
                  style={{ flex: 1, border: "1.5px solid #E5E5E5", background: "#fff", borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#555", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button
                  disabled={!schedGenLoc.trim() || schedGenCreating || newSlots.length === 0}
                  onClick={async () => {
                    setSchedGenCreating(true);
                    let created = 0;
                    for (const d of newSlots) {
                      const dateStr = `${MN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                      try {
                        await api.addMeeting({ date: dateStr, location: schedGenLoc.trim(), agenda: `${MN[d.getMonth()]} ${d.getFullYear()} monthly meeting` });
                        created++;
                      } catch {}
                    }
                    showToast(`${created} meeting${created !== 1 ? "s" : ""} scheduled`);
                    onRefresh();
                    setShowSchedGen(false);
                    setSchedGenLoc("");
                    setSchedGenCreating(false);
                  }}
                  style={{ flex: 2, background: (schedGenLoc.trim() && newSlots.length > 0) ? "linear-gradient(135deg,#C8A97E,#A07850)" : "#E5E5E5", color: (schedGenLoc.trim() && newSlots.length > 0) ? "#fff" : "#AAA", border: "none", borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: (schedGenLoc.trim() && newSlots.length > 0) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  {schedGenCreating ? "Creating…" : `Create ${newSlots.length} meeting${newSlots.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ── Schedule meeting modal ─────────────────────────────────── */}
      {scheduleDay && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setScheduleDay(null); setSchedLoc(""); setSchedAgenda(""); } }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400 }} className="fade-up">
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>📅 Schedule Meeting</div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
              {scheduleDay.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>Location *</div>
            <input value={schedLoc} onChange={e => setSchedLoc(e.target.value)}
              placeholder="e.g. Village Hall, Zoom, Member's Home"
              style={{ width: "100%", border: "1.5px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>Agenda (optional)</div>
            <textarea value={schedAgenda} onChange={e => setSchedAgenda(e.target.value)}
              rows={3} placeholder="What will be discussed?"
              style={{ width: "100%", border: "1.5px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 22, boxSizing: "border-box", outline: "none", resize: "none", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setScheduleDay(null); setSchedLoc(""); setSchedAgenda(""); }}
                style={{ flex: 1, border: "1.5px solid #E5E5E5", background: "#fff", borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#555", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button
                disabled={!schedLoc.trim() || scheduling}
                onClick={async () => {
                  setScheduling(true);
                  const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  const dateStr = `${MN[scheduleDay.getMonth()]} ${scheduleDay.getDate()}, ${scheduleDay.getFullYear()}`;
                  try {
                    await api.addMeeting({ date: dateStr, location: schedLoc.trim(), agenda: schedAgenda.trim() || `${MN[scheduleDay.getMonth()]} ${scheduleDay.getFullYear()} meeting` });
                    showToast(`Meeting scheduled for ${dateStr}`);
                    onRefresh();
                    setScheduleDay(null);
                    setSchedLoc("");
                    setSchedAgenda("");
                  } catch (e) {
                    showToast(e.message || "Failed to schedule", "error");
                  } finally {
                    setScheduling(false);
                  }
                }}
                style={{ flex: 2, background: schedLoc.trim() ? "linear-gradient(135deg,#C8A97E,#A07850)" : "#E5E5E5", color: schedLoc.trim() ? "#fff" : "#AAA", border: "none", borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: schedLoc.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                {scheduling ? "Scheduling…" : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1,2,3].map(k => <Skeleton key={k} h={160} r={16} />)}</div>
      ) : meetings.length === 0 ? (
        <EmptyState
          type="meetings"
          title="No meetings yet"
          subtitle="Meeting records will appear here once they are created. Use the AI Recorder to capture and transcribe your first meeting."
        />
      ) : [...meetings]
          .sort((a, b) => {
            const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
            const parse = s => {
              if (!s) return 0;
              const lower = s.toLowerCase();
              const month = MONTHS.findIndex(mn => lower.includes(mn));
              const year  = (s.match(/\d{4}/) || [])[0];
              const day   = (s.match(/\b(\d{1,2})\b/) || [])[1];
              if (month < 0 || !year) return new Date(s).getTime() || 0;
              return new Date(+year, month, +(day || 1)).getTime();
            };
            return parse(b.date) - parse(a.date);
          })
          .map((m, i) => {
        const userHasEndorsed = currentUser && (m.proposer_id === currentUser.id || m.seconder_id === currentUser.id);
        const bothSlotsFilled = m.proposer_id && m.seconder_id;
        const canEndorse      = m.transcript && !userHasEndorsed && !bothSlotsFilled;
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
                onClick={() => setTranscriptMeeting(m)}
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
                ) : bothSlotsFilled ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#2E7D32", fontWeight: 600 }}>
                    ✅ Approved
                  </div>
                ) : null
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
              const result = await api.endorseMeeting(endorseTarget.id, type);
              showToast(result?.approved ? "✅ Meeting approved!" : `Meeting ${type === "propose" ? "proposed" : "seconded"} successfully`);
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
  const [rows,         setRows]         = useState(null);
  const [saving,       setSaving]       = useState(null);
  const [fines,        setFines]        = useState([]);
  const [lateFining,   setLateFining]   = useState(false);

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

        <div style={{ padding: "12px 24px 28px", borderTop: "1px solid #F0EEE8", display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn" disabled={lateFining}
            onClick={async () => {
              setLateFining(true);
              try {
                const res = await api.autoLateFines(meeting.id);
                if (res.generated.length === 0) {
                  showToast("All members have paid — no late fines needed ✓");
                } else {
                  const msgs = res.generated.map(f => `⚡ ${f.name} (${f.shares} share${f.shares > 1 ? "s" : ""}) — KES ${f.amount.toLocaleString()} late contribution fine`);
                  setFines(prev => [...prev, ...msgs]);
                  showToast(`${res.generated.length} late payment fine${res.generated.length > 1 ? "s" : ""} generated`);
                }
              } catch (e) {
                showToast(e.message || "Failed to generate late fines", "error");
              } finally {
                setLateFining(false);
              }
            }}
            style={{ width: "100%", background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082", borderRadius: 14, padding: 13, fontSize: 13, fontWeight: 700 }}>
            {lateFining ? "Checking…" : "⚡ Auto Late Payment Fines"}
          </button>
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
    win.document.write(`<!DOCTYPE html><html><head><title>Kaabazim Self Help Group — ${year} Annual Report</title>
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
          <div style={{ fontSize: 24, fontWeight: 400, color: T.fg, fontFamily: T.serif }}>Annual Report</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Kaabazim Self Help Group · {year} Summary</div>
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
            <h1>Kaabazim Self Help Group — {year} Annual Report</h1>
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

  const minAmount = F.type === "Contribution" ? 5000 : F.type === "Fine" ? 500 : F.type === "Lateness" ? 200 : 0;

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 400, color: T.fg, fontFamily: T.serif }}>Import Data</div>
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
          <select value={F.type} onChange={e => { const t = e.target.value; setF("type", t); setF("amount", t === "Contribution" ? "5000" : t === "Fine" ? "500" : t === "Lateness" ? "200" : ""); }} style={{ ...selectStyle, width: "100%", color: TYPE_META[F.type]?.text, background: TYPE_META[F.type]?.bg, borderColor: TYPE_META[F.type]?.border }}>
            <option value="Contribution">Contribution (min KES 5,000)</option>
            <option value="Fine">Fine (KES 500)</option>
            <option value="Lateness">Lateness — meeting (KES 200)</option>
            <option value="Late Contribution">Late Contribution (10% per share)</option>
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

// ── Import Data Modal ─────────────────────────────────────────────────────────

function ImportDataModal({ onClose, showToast, onRefresh }) {
  const [tab, setTab] = useState("members");
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const TEMPLATES = {
    members:       { headers: ["name","phone","shares","role"],         hint: "role: Member/Secretary/Chairman; shares defaults to 1" },
    contributions: { headers: ["member_phone","type","month","amount","method"], hint: "type: Contribution; month: e.g. January 2025; method: M-Pesa" },
    fines:         { headers: ["member_phone","type","month","amount","notes"],  hint: "type: Fine/Lateness/Late Contribution; month: January 2025" },
    meetings:      { headers: ["date","location","agenda","status"],    hint: "date: January 30, 2025; status: Pending/Completed" },
  };

  function downloadTemplate() {
    const { headers: h } = TEMPLATES[tab];
    const csv = h.join(",") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `template_${tab}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const hdrs = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const data = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const obj = {};
      hdrs.forEach((h, i) => { obj[h] = vals[i] || ""; });
      return obj;
    });
    return { headers: hdrs, rows: data };
  }

  function onFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers: h, rows: r } = parseCSV(ev.target.result);
      setHeaders(h); setRows(r);
    };
    reader.readAsText(f);
  }

  async function doImport() {
    if (!rows.length) return;
    setImporting(true); setResult(null);
    try {
      let res;
      if (tab === "members")       res = await api.importMembers(rows);
      else if (tab === "fines")    res = await api.importContributions(rows);
      else if (tab === "contributions") res = await api.importContributions(rows);
      else                         res = await api.importMeetings(rows);
      setResult({ ok: true, inserted: res.inserted, skipped: res.skipped, errors: res.errors || [] });
      showToast(`Imported ${res.inserted} record${res.inserted !== 1 ? "s" : ""}${res.skipped ? `, ${res.skipped} skipped` : ""}`, "success");
      onRefresh();
    } catch (err) {
      setResult({ ok: false, error: err.message });
      showToast("Import failed: " + err.message, "error");
    } finally {
      setImporting(false);
    }
  }

  const TABS = [["members","Members"],["contributions","Contributions"],["fines","Fines"],["meetings","Meetings"]];

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 540, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>📥 Import Data</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, padding: "14px 20px 0" }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setFile(null); setRows([]); setHeaders([]); setResult(null); }}
              style={{ background: tab === k ? "#1A1A1A" : "#F0EEE8", color: tab === k ? "#F7F6F2" : "#555", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ background: "#F8F7F3", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 6, fontWeight: 600 }}>CSV format hint</div>
            <code style={{ fontSize: 11, color: "#777", display: "block" }}>{TEMPLATES[tab].headers.join(", ")}</code>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{TEMPLATES[tab].hint}</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button className="btn" onClick={downloadTemplate}
              style={{ flex: 1, background: "#F0EEE8", color: "#1A1A1A", border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              ⬇ Download Template
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}
              style={{ flex: 1, background: "#F0EEE8", color: "#1A1A1A", border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              📂 Choose CSV File
            </button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFileChange} />
          </div>

          {file && (
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
              <strong>{file.name}</strong> — {rows.length} row{rows.length !== 1 ? "s" : ""} detected
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 14, border: "1px solid #EEE", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#F8F7F3" }}>
                    {headers.map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #F0EEE8" }}>
                      {headers.map(h => <td key={h} style={{ padding: "6px 10px", color: "#333", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && <div style={{ padding: "6px 10px", fontSize: 11, color: "#999" }}>…and {rows.length - 5} more row{rows.length - 5 !== 1 ? "s" : ""}</div>}
            </div>
          )}

          {result && (
            <div style={{ background: result.ok ? "#E8F5E9" : "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              {result.ok ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#2E7D32" }}>✓ Import complete</div>
                  <div style={{ fontSize: 12, color: "#388E3C", marginTop: 4 }}>
                    {result.inserted} inserted{result.skipped ? `, ${result.skipped} skipped (duplicates)` : ""}
                  </div>
                  {result.errors?.length > 0 && (
                    <div style={{ fontSize: 11, color: "#E65100", marginTop: 6 }}>
                      {result.errors.slice(0, 5).map((e, i) => <div key={i}>⚠ {e}</div>)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#C62828", fontWeight: 600 }}>✗ {result.error}</div>
              )}
            </div>
          )}

          <button className="btn" onClick={doImport} disabled={importing || rows.length === 0}
            style={{ width: "100%", background: rows.length > 0 ? "#1A1A1A" : "#CCC", color: "#F7F6F2", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 13, fontWeight: 700, cursor: rows.length > 0 ? "pointer" : "default" }}>
            {importing ? "Importing…" : `Import ${rows.length} row${rows.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Members Page ──────────────────────────────────────────────────────────────

function MembersPage({ members, loading, onAdd, onToggle, onEdit, viewMode, showToast, onRefresh }) {
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const active = members.filter(m => m.active);
  const filtered = active.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search));

  return (
    <div style={{ padding: 20 }} className="fade-up">
      {/* Topbar */}
      <div className="topbar">
        <div className="page-h" style={{ marginBottom: 0 }}>Members</div>
        <div className="tbr">
          <button className="btn btn-o btn-sm" onClick={() => setShowImport(true)}>📥 Import</button>
          <button className="btn btn-p btn-sm" onClick={onAdd}>+ Add Member</button>
        </div>
      </div>
      <div className="page-sub">{active.length} active members</div>
      {showImport && <ImportDataModal onClose={() => setShowImport(false)} showToast={showToast} onRefresh={onRefresh} />}

      {/* Stats row */}
      <div className="metrics" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
        {[["Chairman", members.filter(m=>m.role==="Chairman"&&m.active).length, "var(--amber)", "var(--amb-l)"],
          ["Secretary", members.filter(m=>m.role==="Secretary"&&m.active).length, "var(--green)", "var(--grn-l)"],
          ["Members", members.filter(m=>m.role==="Member"&&m.active).length, "var(--accent)", "var(--acc-l)"]].map(([r,c,col,bg]) => (
          <div key={r} className="metric" style={{ background: bg, borderColor: "transparent" }}>
            <div className="m-val" style={{ color: col, fontSize: 28 }}>{c}</div>
            <div className="m-lbl" style={{ color: col }}>{r}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input className="search-box" style={{ maxWidth: "100%", flex: 1 }} placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="mg">{[1,2,3,4,5,6].map(k => <Skeleton key={k} h={120} r={12} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState type="members" title="No members found" subtitle={search ? "Try a different search." : "Add your first member."} action="+ Add Member" onAction={onAdd} />
      ) : (
        <div className="mg">
          {filtered.map((m, i) => {
            const initials = m.name?.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
            const avCls = AVATAR_CLASSES[i % AVATAR_CLASSES.length];
            return (
              <div key={m.id} className="mc" style={{ animation: `fadeUp 0.2s ease ${Math.min(i,10)*0.04}s both`, opacity: m.active ? 1 : 0.5 }}>
                <div className="mc-top">
                  <div className={`mc-av ${avCls}`}>{initials}</div>
                  <div>
                    <div className="mc-name">{m.name}</div>
                    <div className="mc-role">{m.role}</div>
                  </div>
                  <span className="pill pill-n" style={{ marginLeft: "auto" }}>{m.shares}sh</span>
                </div>
                <div className="mc-desc">{m.phone}</div>
                <div className="mc-ft">
                  <div className="mc-kv"><div className="k">Monthly</div><div className="v">{fmt(m.shares * 5000)}</div></div>
                  <div className="mc-kv"><div className="k">Status</div><div className="v" style={{ color: m.active ? "var(--green)" : "var(--fg3)" }}>{m.active ? "Active" : "Inactive"}</div></div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="btn btn-o btn-sm" style={{ flex: 1 }} onClick={() => onEdit(m)}>Edit</button>
                  <button className="btn btn-sm" style={{ flex: 1, background: m.active ? "var(--amb-l)" : "var(--acc-l)", color: m.active ? "var(--amber)" : "var(--accent)" }} onClick={() => onToggle(m.id, !!m.active)}>
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [settingsTab, setSettingsTab] = useState("chama");

  const tabs = [
    { id: "chama", label: "Chama Details" },
    { id: "profile", label: "My Profile" },
    { id: "system", label: "System" },
  ];

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div className="page-h">Settings</div>
      <div className="page-sub">Chama configuration</div>

      <div className="settings-grid">
        {/* Nav */}
        <div className="settings-nav">
          {tabs.map(t => (
            <button key={t.id} className={`snl${settingsTab === t.id ? " on" : ""}`} onClick={() => setSettingsTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {settingsTab === "chama" && (
            <div className="card">
              <div className="card-hd"><span className="card-title">Chama Details</span></div>
              {[["Name","Kaabazim Self Help Group"],["Meeting Day","Monthly (Last Thursday)"],["Active Members", String(memberCount ?? "—")],["Share Value","KES 5,000 / month"],["Year Founded","2023"]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: 12, color: "var(--fg2)" }}>{k}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {settingsTab === "profile" && (
            <div className="card">
              <div className="card-hd"><span className="card-title">My Profile</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div className="uav" style={{ width: 50, height: 50, fontSize: 18 }}>{currentUser?.name?.charAt(0) ?? "?"}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>{currentUser?.name ?? "Loading…"}</div>
                  <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>{role} · {currentUser?.phone}</div>
                </div>
              </div>
              <button className="btn btn-o" style={{ width: "100%", marginBottom: 10, justifyContent: "center" }} onClick={() => setShowPinModal(true)}>
                🔑 Change PIN
              </button>
              <button className="btn btn-p" style={{ width: "100%", justifyContent: "center" }} onClick={onLogout}>
                Sign Out
              </button>
            </div>
          )}

          {settingsTab === "system" && (
            <div className="card">
              <div className="card-hd"><span className="card-title">System</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border2)" }}>
                <div style={{ fontSize: 12, color: "var(--fg2)" }}>Backend</div>
                <span className="pill pill-g">Connected · Railway</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border2)" }}>
                <div style={{ fontSize: 12, color: "var(--fg2)" }}>Frontend</div>
                <span className="pill pill-g">Vercel</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <div style={{ fontSize: 12, color: "var(--fg2)" }}>Database</div>
                <span className="pill pill-b">SQLite</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPinModal && <SettingsPinModal onClose={() => setShowPinModal(false)} />}
    </div>
  );
}

// ── Transcript Side Panel (desktop) ──────────────────────────────────────────

function TranscriptPanel({ meeting, onClose }) {
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
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 200 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(500px, 100vw)",
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

          {loadingMin ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ width: 24, height: 24, border: "2px solid #EEE", borderTopColor: "#C8A97E", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 14, color: "#BBB" }}>Loading minutes…</div>
            </div>
          ) : minutes ? (
            <>
              {/* 1 ── Attendance */}
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

              {/* 2 ── Financials */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 12 }}>FINANCIALS · {minutes.month || "—"}</div>
                {[
                  { label: "Contributions",        value: minutes.contributions.total_contributions,      color: "#1565C0" },
                  { label: "Fines",                value: minutes.contributions.total_fines,              color: "#BF360C" },
                  { label: "Lateness (meeting)",   value: minutes.contributions.total_lateness,           color: "#E65100" },
                  { label: "Late Contributions",   value: minutes.contributions.total_late_contribution,  color: "#E65100" },
                  { label: "Total Collected (Confirmed)", value: minutes.contributions.total_collected, color: "#2E7D32", bold: true },
                ].filter(row => row.value > 0 || row.bold).map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F5F4F0" }}>
                    <div style={{ fontSize: 14, color: "#666", fontWeight: row.bold ? 600 : 400 }}>{row.label}</div>
                    <div style={{ fontSize: 14, fontWeight: row.bold ? 700 : 500, color: row.color }}>{fmt(row.value)}</div>
                  </div>
                ))}
              </div>

              {/* 3 ── Contributions (member detail) */}
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

              {/* 4 ── AI-extracted member savings & penalties */}
              {minutes.ai_summary?.members_financial?.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 12 }}>MEMBER SAVINGS & PENALTIES</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#F9F8F5" }}>
                        {["#", "Member", "Savings (KES)", "Penalty (KES)"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: h === "#" ? "center" : "left", fontWeight: 700, color: "#555", borderBottom: "2px solid #ECEAE4", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {minutes.ai_summary.members_financial.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F5F4F0" }}>
                          <td style={{ padding: "8px 10px", textAlign: "center", color: "#BBB", fontWeight: 500 }}>{i + 1}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 500, color: "#1A1A1A" }}>{row.name}</td>
                          <td style={{ padding: "8px 10px", color: row.savings > 0 ? "#1565C0" : "#CCC", fontWeight: row.savings > 0 ? 600 : 400 }}>
                            {row.savings > 0 ? Number(row.savings).toLocaleString() : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", color: row.penalty > 0 ? "#E65100" : "#CCC", fontWeight: row.penalty > 0 ? 600 : 400 }}>
                            {row.penalty > 0 ? Number(row.penalty).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F9F8F5" }}>
                        <td colSpan={2} style={{ padding: "9px 10px", fontWeight: 700, color: "#1A1A1A", fontSize: 12 }}>TOTAL</td>
                        <td style={{ padding: "9px 10px", fontWeight: 700, color: "#1565C0" }}>
                          {minutes.ai_summary.members_financial.reduce((s, r) => s + (Number(r.savings) || 0), 0).toLocaleString()}
                        </td>
                        <td style={{ padding: "9px 10px", fontWeight: 700, color: "#E65100" }}>
                          {minutes.ai_summary.members_financial.reduce((s, r) => s + (Number(r.penalty) || 0), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* 5 ── Key Points */}
              {minutes.ai_summary?.key_points?.length > 0 && (
                <div style={{ background: "#1A1A1A", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C8A97E", letterSpacing: 0.5, marginBottom: 12 }}>KEY POINTS</div>
                  {minutes.ai_summary.key_points.map((p, i) => (
                    <div key={i} style={{ fontSize: 14, color: "#D0CEC8", marginBottom: 8, paddingLeft: 14, borderLeft: "2px solid #333", lineHeight: 1.6 }}>{p}</div>
                  ))}
                </div>
              )}

              {/* 6 ── Action Items */}
              {minutes.ai_summary?.action_items?.length > 0 && (
                <div style={{ background: "#1A1A1A", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C8A97E", letterSpacing: 0.5, marginBottom: 12 }}>ACTION ITEMS</div>
                  {minutes.ai_summary.action_items.map((a, i) => (
                    <div key={i} style={{ fontSize: 14, color: "#D0CEC8", marginBottom: 8, display: "flex", gap: 10, lineHeight: 1.6 }}>
                      <span style={{ color: "#C8A97E", flexShrink: 0 }}>→</span>{a}
                    </div>
                  ))}
                </div>
              )}

              {/* 7 ── Full Transcript */}
              {transcript && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: 0.5, marginBottom: 14 }}>FULL TRANSCRIPT</div>
                  <p style={{ margin: 0, fontSize: 14, color: "#1A1A1A", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{transcript}</p>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎙</div>
              <div style={{ fontSize: 15, color: "#999" }}>No minutes yet.</div>
              <div style={{ fontSize: 13, color: "#BBB", marginTop: 6 }}>Use the Record Meeting button to generate them.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #ECEAE4", background: "#fff", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#BBB" }}>Minutes generated by Claude AI · {freshMeeting.status}</div>
        </div>
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
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1A1A1A", fontFamily: T.serif }}>Kameme Chama</div>
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
  const canSubmit = form.name.trim() && form.phone.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onAdd({ ...form, shares: parseInt(form.shares) || 1 });
    } finally {
      setSaving(false);
    }
  };

  const roleColor = { Chairman: "#b45309", Secretary: "#15803d", Member: "var(--accent)" };
  const roleBg    = { Chairman: "#fef3c7", Secretary: "#dcfce7", Member: "var(--acc-l)" };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add New Member</div>
            <div className="modal-sub">Fill in the details below</div>
          </div>
          <ModalCloseBtn onClick={onClose} />
        </div>

        <div className="modal-body">
          {/* Avatar preview strip */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--sf2)", borderRadius: 14, padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg,${roleColor[form.role]},${roleBg[form.role]})`, border: `2px solid ${roleBg[form.role]}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: roleColor[form.role], flexShrink: 0 }}>
              {form.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: form.name ? "var(--fg)" : "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{form.name || "Member name"}</div>
              <div style={{ display: "inline-block", marginTop: 4, padding: "2px 10px", borderRadius: 20, background: roleBg[form.role], color: roleColor[form.role], fontSize: 10, fontWeight: 700 }}>{form.role}</div>
            </div>
          </div>

          {/* Text fields */}
          {[["Full Name","text","e.g. Alice Mwangi","name",null],["Phone","tel","07XX XXX XXX","phone","Used to log in"],["Email (optional)","email","alice@email.com","email",null]].map(([label,type,placeholder,key,hint]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div className="mf-label">{label}</div>
              <input className="mf-input" type={type} placeholder={placeholder} value={form[key]} onChange={e => setF(key, e.target.value)} />
              {hint && <div className="mf-hint">{hint}</div>}
            </div>
          ))}

          {/* Shares + Role */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <div>
              <div className="mf-label">Shares</div>
              <input className="mf-input" type="number" min={1} value={form.shares} onChange={e => setF("shares", e.target.value)} />
            </div>
            <div>
              <div className="mf-label">Role</div>
              <select className="mf-input" value={form.role} onChange={e => setF("role", e.target.value)} style={{ cursor: "pointer" }}>
                <option>Member</option><option>Secretary</option><option>Chairman</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal-divider" />
        <div className="modal-footer" style={{ flexDirection: "column", gap: 10 }}>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={saving || !canSubmit} style={{ width: "100%" }}>
            {saving ? <><Spinner /> Adding…</> : "Add Member"}
          </button>
          <p style={{ fontSize: 11, color: "var(--fg3)", textAlign: "center", lineHeight: 1.5 }}>
            A WhatsApp onboarding message will be sent to the member's phone.
          </p>
        </div>
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Member</div>
            <div className="modal-sub">Changes are saved to the database</div>
          </div>
          <ModalCloseBtn onClick={onClose} />
        </div>

        <div className="modal-body">
          {/* Avatar preview */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--sf2)", borderRadius: 14, padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: form.role === "Chairman" ? "linear-gradient(135deg,#fbbf24,#b45309)" : form.role === "Secretary" ? "linear-gradient(135deg,#4ade80,#15803d)" : "linear-gradient(135deg,#60a5fa,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {form.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{form.name || "—"}</div>
              <div style={{ display: "inline-block", marginTop: 4, padding: "2px 10px", borderRadius: 20, background: roleBg[form.role], color: roleColor[form.role], fontSize: 10, fontWeight: 700 }}>{form.role}</div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="mf-label">Full Name</div>
            <input className="mf-input" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Full name" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="mf-label">Phone Number</div>
            <input className="mf-input" type="tel" value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="07XX XXX XXX" />
            <div className="mf-hint">This is the number used to log in</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <div>
              <div className="mf-label">Shares</div>
              <input className="mf-input" type="number" min={1} max={10} value={form.shares} onChange={e => setF("shares", e.target.value)} />
            </div>
            <div>
              <div className="mf-label">Role</div>
              <select className="mf-input" value={form.role} onChange={e => setF("role", e.target.value)} style={{ cursor: "pointer" }}>
                <option value="Member">Member</option>
                <option value="Secretary">Secretary</option>
                <option value="Chairman">Chairman</option>
              </select>
            </div>
          </div>

          {error && (
            <div style={{ background: "var(--red-l)", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginTop: 14, fontSize: 12, color: "var(--red)", fontWeight: 500 }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-divider" />
        <div className="modal-footer">
          <button className="modal-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={saving || !changed}>
            {saving ? <><Spinner /> Saving…</> : changed ? "Save Changes" : "No Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Capital Sheet Page ────────────────────────────────────────────────────────

function CapitalSheetPage({ members, showToast, onRefresh }) {
  const [deposits,     setDeposits]     = useState({});
  const [saved,        setSaved]        = useState({});
  const [saving,       setSaving]       = useState(false);
  const [balances,     setBalances]     = useState([]);
  const [loadingB,     setLoadingB]     = useState(true);
  const [perShare,     setPerShare]     = useState("");

  useEffect(() => {
    const init = {};
    members.forEach(m => { init[m.id] = m.initial_deposit != null ? String(m.initial_deposit) : "0"; });
    setDeposits(init);
  }, [members]);

  const applyPerShare = (rate) => {
    const r = parseFloat(rate) || 0;
    if (!r) return;
    const next = {};
    members.filter(m => m.active).forEach(m => { next[m.id] = String(r * (m.shares || 1)); });
    setDeposits(p => ({ ...p, ...next }));
    setSaved({});
  };

  useEffect(() => {
    setLoadingB(true);
    api.getMemberBalances()
      .then(setBalances)
      .catch(() => {})
      .finally(() => setLoadingB(false));
  }, [members]);

  const handleChange = (id, val) => {
    setDeposits(p => ({ ...p, [id]: val }));
    setSaved(p => ({ ...p, [id]: false }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const rows = Object.entries(deposits).map(([id, v]) => ({ id: Number(id), amount: parseFloat(v) || 0 }));
    try {
      await api.bulkSetInitialDeposits(rows);
      const next = {};
      rows.forEach(r => { next[r.id] = true; });
      setSaved(next);
      showToast("Initial deposits saved", "success");
      onRefresh();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const fmt = v => "KES " + Number(v || 0).toLocaleString();
  const totalDeposit = Object.values(deposits).reduce((a, v) => a + (parseFloat(v) || 0), 0);
  const activeMembers = members.filter(m => m.active);

  return (
    <div className="fade-up">
      <div className="topbar">
        <input className="search-box" placeholder="Search members, contributions…" readOnly />
        <div className="tbr">
          <button className="btn btn-p btn-sm" onClick={handleSaveAll} disabled={saving}>
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>

      <div className="page-h">Capital Sheet</div>
      <div className="page-sub">Record each member's initial deposit as starting capital</div>

      <div className="cs-banner" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>💡</span>
          <span>Enter each member's starting capital, or set a <b>per-share rate</b> to auto-fill all deposits.</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>KES per share:</label>
          <input
            className="cs-input"
            type="number"
            min="0"
            step="500"
            placeholder="e.g. 5000"
            value={perShare}
            onChange={e => setPerShare(e.target.value)}
            style={{ width: 120 }}
          />
          <button
            className="btn btn-o btn-sm"
            onClick={() => applyPerShare(perShare)}
            disabled={!parseFloat(perShare)}
            style={{ whiteSpace: "nowrap" }}
          >
            Apply to All
          </button>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            {parseFloat(perShare) ? `(${members.filter(m=>m.active).map(m=>`${m.shares}sh → KES ${(parseFloat(perShare)*(m.shares||1)).toLocaleString()}`).slice(0,2).join(", ")}…)` : ""}
          </span>
        </div>
      </div>

      <div className="metrics" style={{ marginBottom: 20 }}>
        <div className="metric">
          <div className="metric-lbl">Total Starting Capital</div>
          <div className="metric-val">{fmt(totalDeposit)}</div>
          <div className="metric-sub">{activeMembers.length} members</div>
        </div>
        <div className="metric">
          <div className="metric-lbl">Avg per Member</div>
          <div className="metric-val">{fmt(activeMembers.length ? totalDeposit / activeMembers.length : 0)}</div>
          <div className="metric-sub">initial deposit</div>
        </div>
        <div className="metric">
          <div className="metric-lbl">Total Net Balance</div>
          <div className="metric-val">{loadingB ? "…" : fmt(balances.reduce((a, b) => a + b.net_balance, 0))}</div>
          <div className="metric-sub">capital + contributions</div>
        </div>
        <div className="metric">
          <div className="metric-lbl">Members Set</div>
          <div className="metric-val">{Object.values(deposits).filter(v => parseFloat(v) > 0).length}</div>
          <div className="metric-sub">of {activeMembers.length} active</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="capital-sheet">
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Member</th>
              <th>Role</th>
              <th>Shares</th>
              <th>Initial Deposit (KES)</th>
              <th>Net Balance</th>
              <th style={{ paddingRight: 20 }}></th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m, i) => {
              const bal = balances.find(b => b.id === m.id);
              const initials = m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              const cls = AVATAR_CLASSES[i % AVATAR_CLASSES.length];
              return (
                <tr key={m.id}>
                  <td style={{ paddingLeft: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className={`cs-av ${cls}`}>{initials}</div>
                      <div>
                        <div className="cs-name">{m.name}</div>
                        <div className="cs-role">{m.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="pill pill-b">{m.role}</span></td>
                  <td style={{ color: "var(--fg2)", fontSize: 13 }}>{m.shares}</td>
                  <td>
                    <input
                      className="cs-input"
                      type="number"
                      min="0"
                      step="500"
                      value={deposits[m.id] ?? "0"}
                      onChange={e => handleChange(m.id, e.target.value)}
                    />
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 14, color: bal ? (bal.net_balance >= 0 ? "var(--green)" : "var(--red)") : "var(--fg3)" }}>
                    {bal ? fmt(bal.net_balance) : "—"}
                  </td>
                  <td style={{ paddingRight: 20 }}>
                    {saved[m.id] && <span className="cs-saved">✓ saved</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="cs-total">
              <td style={{ paddingLeft: 20, paddingTop: 12, paddingBottom: 12 }} colSpan={2}><b>Total</b></td>
              <td style={{ fontWeight: 700, fontSize: 13 }}>{activeMembers.reduce((a,m)=>a+(m.shares||1),0)} shares</td>
              <td style={{ fontWeight: 700, fontSize: 15 }}>{fmt(totalDeposit)}</td>
              <td style={{ fontWeight: 700, fontSize: 15, color: "var(--green)" }}>
                {loadingB ? "…" : fmt(balances.reduce((a, b) => a + b.net_balance, 0))}
              </td>
              <td style={{ paddingRight: 20 }}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── My Balance Page ───────────────────────────────────────────────────────────

function MyBalancePage({ currentUser, showToast }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getMyBalance()
      .then(setData)
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = v => "KES " + Number(v || 0).toLocaleString();
  const isDeduction = t => ["Fine", "Lateness"].includes(t);
  const typeLabel = t => ({ Contribution: "Contribution", Fine: "Fine", Lateness: "Lateness Fine" })[t] || t;

  if (loading) return (
    <div style={{ padding: 20 }}>
      <Skeleton h={160} r={12} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
        {[1,2,3].map(k => <Skeleton key={k} h={90} r={12} />)}
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="fade-up">
      <div className="topbar">
        <input className="search-box" placeholder="Search transactions…" readOnly />
        <div className="tbr">
          <span style={{ fontSize: 13, color: "var(--fg3)" }}>Updated just now</span>
        </div>
      </div>

      <div className="page-h">My Balance</div>
      <div className="page-sub">{data.name} · {data.role}</div>

      <div className="balance-hero">
        <div className="balance-hero-label">Net Balance</div>
        <div className="balance-hero-amount">{fmt(data.net_balance)}</div>
        <div className="balance-hero-sub">
          Initial deposit: KES {Number(data.initial_deposit || 0).toLocaleString()}
          &nbsp;·&nbsp;{data.shares} share{data.shares !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="balance-cards">
        <div className="balance-card green">
          <div className="balance-card-label">Confirmed Contributions</div>
          <div className="balance-card-val">{fmt(data.confirmed_contributions)}</div>
          <div className="balance-card-sub">paid &amp; confirmed</div>
        </div>
        <div className="balance-card red">
          <div className="balance-card-label">Fines &amp; Deductions</div>
          <div className="balance-card-val">{fmt(data.total_deductions)}</div>
          <div className="balance-card-sub">confirmed deductions</div>
        </div>
        <div className="balance-card blue">
          <div className="balance-card-label">Pending</div>
          <div className="balance-card-val">{fmt(data.pending_contributions)}</div>
          <div className="balance-card-sub">awaiting confirmation</div>
        </div>
      </div>

      <div className="balance-hist">
        <div className="balance-hist-head">Transaction History</div>
        {data.transactions.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--fg3)", fontSize: 13 }}>No transactions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Type</th>
                <th>Method</th>
                <th>Status</th>
                <th style={{ textAlign: "right", paddingRight: 20 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t, i) => (
                <tr key={i}>
                  <td>{t.month}</td>
                  <td>{typeLabel(t.type)}</td>
                  <td style={{ color: "var(--fg3)" }}>{t.method}</td>
                  <td>
                    <span className={`pill ${t.status === "Confirmed" ? "pill-g" : t.status === "Pending" ? "pill-a" : "pill-r"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 20 }} className={isDeduction(t.type) ? "amt-neg" : (t.status === "Confirmed" ? "amt-pos" : "")}>
                    {isDeduction(t.type) ? "−" : "+"}{fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
