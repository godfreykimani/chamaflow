import { useState } from "react";

const T = {
  bg:      "#f2efe9",
  surface: "#ffffff",
  fg:      "#1a1714",
  fg2:     "#6b6560",
  fg3:     "#a8a39d",
  border:  "#e5e0d9",
  accent:  "#2563eb",
  accL:    "#eff6ff",
  red:     "#dc2626",
  redL:    "#fef2f2",
  serif:   "'DM Serif Display', Georgia, serif",
  sans:    "'Inter', system-ui, sans-serif",
};

export default function LoginPage({ onLogin, loading, error }) {
  const [phone,     setPhone]     = useState("");
  const [pin,       setPin]       = useState("");
  const [step,      setStep]      = useState("phone");
  const [attempted, setAttempted] = useState(false);

  const phoneClean = phone.replace(/[\s\-]/g, "");
  const canNext    = phoneClean.length >= 9;
  const canLogin   = pin.length === 4;

  const handleKey = (digit) => {
    if (pin.length < 4) setPin(p => p + digit);
  };
  const handleBack = () => { if (pin.length > 0) setPin(p => p.slice(0, -1)); };
  const handleSubmit = () => {
    if (!canLogin) return;
    setAttempted(true);
    onLogin(phoneClean, pin);
  };

  const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: T.sans, padding: "24px 16px" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake  { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        button { cursor:pointer; font-family:'Inter',system-ui,sans-serif; }
        .pk:hover { background: #e5e0d9 !important; }
        .pk:active { transform:scale(.94); }
      `}</style>

      {/* Logo area */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ width: 48, height: 48, background: T.fg, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-0.5px" }}>CF</div>
        <h1 style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 400, color: T.fg, letterSpacing: "-0.02em", marginBottom: 4 }}>ChamaFlow</h1>
        <p style={{ fontSize: 13, color: T.fg2 }}>Kameme Chama · Savings &amp; Accountability</p>
      </div>

      {/* Card */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 4px 24px rgba(0,0,0,.08)", animation: "fadeUp .35s ease both" }}>

        {step === "phone" ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.fg, marginBottom: 3 }}>Sign in</div>
              <div style={{ fontSize: 12, color: T.fg2 }}>Enter your registered phone number</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.fg2, letterSpacing: ".05em", marginBottom: 6 }}>PHONE NUMBER</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: "9px 12px", background: T.bg, transition: "border-color .15s" }}>
                <span style={{ fontSize: 16 }}>🇰🇪</span>
                <input
                  type="tel" inputMode="numeric" placeholder="07XX XXX XXX"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && canNext && setStep("pin")}
                  autoFocus
                  style={{ border: "none", outline: "none", background: "transparent", fontFamily: T.sans, fontSize: 14, color: T.fg, width: "100%", letterSpacing: "1px" }}
                />
              </div>
            </div>

            <button
              onClick={() => setStep("pin")} disabled={!canNext}
              style={{ width: "100%", background: canNext ? T.fg : T.border, color: canNext ? "#fff" : T.fg3, border: "none", borderRadius: 9, padding: "11px", fontSize: 13, fontWeight: 600, transition: "all .2s", cursor: canNext ? "pointer" : "not-allowed" }}>
              Continue →
            </button>

            <div style={{ marginTop: 16, padding: 14, background: T.accL, borderRadius: 9, border: `1px solid #bfdbfe` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, marginBottom: 2 }}>First time?</div>
              <div style={{ fontSize: 11, color: T.fg2 }}>Default PIN is 1234. You'll be asked to set a new one after first login.</div>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setStep("phone"); setPin(""); setAttempted(false); }}
              style={{ background: "none", border: "none", color: T.fg2, fontSize: 12, marginBottom: 18, padding: 0, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              ← {phone}
            </button>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.fg, marginBottom: 3 }}>Enter your PIN</div>
              <div style={{ fontSize: 12, color: T.fg2 }}>4-digit security PIN</div>
            </div>

            {/* PIN dots */}
            <div className={error && attempted ? "shake" : ""} style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 20 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: "50%", border: `1.5px solid ${i < pin.length ? T.accent : T.border}`, background: i < pin.length ? T.accent : "transparent", transition: "all .2s" }} />
              ))}
            </div>

            {error && attempted && (
              <div style={{ background: T.redL, borderRadius: 8, padding: "9px 12px", marginBottom: 16, fontSize: 12, color: T.red, textAlign: "center", fontWeight: 500, border: `1px solid #fecaca` }}>
                {error}
              </div>
            )}

            {/* Keypad */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {KEYS.map((k, i) => (
                <button key={i} className={k !== "" ? "pk" : ""} disabled={k === ""}
                  onClick={() => k === "⌫" ? handleBack() : k !== "" ? handleKey(k) : null}
                  style={{
                    height: 56, borderRadius: 10, border: "none",
                    fontSize: k === "⌫" ? 18 : 20, fontWeight: 500,
                    background: k === "" ? "transparent" : T.bg,
                    color: k === "⌫" ? T.fg2 : T.fg,
                    cursor: k === "" ? "default" : "pointer",
                    transition: "all .12s",
                    fontFamily: T.sans,
                  }}>
                  {k}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit} disabled={!canLogin || loading}
              style={{ width: "100%", background: canLogin && !loading ? T.accent : T.border, color: canLogin && !loading ? "#fff" : T.fg3, border: "none", borderRadius: 9, padding: "11px", fontSize: 13, fontWeight: 600, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading
                ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }}/> Signing in…</>
                : "Sign in →"
              }
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: T.fg3 }}>ChamaFlow · Kameme Chama</div>
    </div>
  );
}
