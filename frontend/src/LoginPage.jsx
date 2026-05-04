import { useState } from "react";

/**
 * ChamaFlow Login Screen
 * Phone number + 4-digit PIN pad
 */
export default function LoginPage({ onLogin, loading, error }) {
  const [phone, setPhone]     = useState("");
  const [pin,   setPin]       = useState("");
  const [step,  setStep]      = useState("phone"); // "phone" | "pin"

  const phoneClean = phone.replace(/[\s\-]/g, "");
  const canNext    = phoneClean.length >= 9;
  const canLogin   = pin.length === 4;

  const handleKey = (digit) => {
    if (pin.length < 4) setPin(p => p + digit);
  };
  const handleBack = () => {
    if (pin.length > 0) setPin(p => p.slice(0, -1));
  };

  const handleSubmit = () => {
    if (!canLogin) return;
    onLogin(phoneClean, pin);
  };

  const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={{ minHeight:"100vh", background:"#F7F6F2", display:"flex", flexDirection:"column", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake  { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .shake   { animation: shake 0.4s ease; }
        * { box-sizing:border-box; margin:0; padding:0; }
        button { cursor:pointer; font-family:inherit; }
      `}</style>

      {/* Top dark panel */}
      <div style={{ background:"#1C1C1E", padding:"48px 32px 40px", textAlign:"center" }}>
        <div style={{ fontSize:13, color:"#555", letterSpacing:3, marginBottom:12 }}>WELCOME TO</div>
        <div style={{ fontSize:36, fontWeight:700, color:"#F7F6F2", letterSpacing:"-1.5px", fontFamily:"'DM Serif Display', serif", lineHeight:1 }}>
          ChamaFlow
        </div>
        <div style={{ fontSize:12, color:"#555", marginTop:8, letterSpacing:1 }}>SAVINGS · MEETINGS · ACCOUNTABILITY</div>

        {/* Gold divider */}
        <div style={{ width:48, height:2, background:"linear-gradient(90deg,#C8A97E,#A07850)", margin:"24px auto 0", borderRadius:2 }} />
      </div>

      {/* White form panel */}
      <div style={{ flex:1, padding:"32px 28px 40px", maxWidth:420, width:"100%", margin:"0 auto" }} className="fade-up">

        {step === "phone" ? (
          <>
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:22, fontWeight:700, color:"#1A1A1A", letterSpacing:"-0.5px" }}>Sign in</div>
              <div style={{ fontSize:13, color:"#999", marginTop:4 }}>Enter your registered phone number</div>
            </div>

            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:10, color:"#999", letterSpacing:1, display:"block", marginBottom:8 }}>PHONE NUMBER</label>
              <div style={{ position:"relative" }}>
                <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#BBB", pointerEvents:"none" }}>🇰🇪</div>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && canNext && setStep("pin")}
                  style={{ width:"100%", padding:"14px 14px 14px 42px", borderRadius:14, border:"1.5px solid #ECEAE4", background:"#F9F8F5", fontSize:16, color:"#1A1A1A", outline:"none", fontFamily:"inherit", letterSpacing:1, transition:"border-color 0.15s" }}
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={() => setStep("pin")}
              disabled={!canNext}
              style={{ width:"100%", background: canNext ? "#1A1A1A" : "#ECEAE4", color: canNext ? "#F7F6F2" : "#BBB", border:"none", borderRadius:14, padding:"15px", fontSize:15, fontWeight:700, transition:"all 0.2s", cursor: canNext ? "pointer" : "not-allowed" }}
            >
              Continue →
            </button>

            <div style={{ marginTop:24, padding:16, background:"#F0EEE8", borderRadius:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#A07850", marginBottom:4 }}>First time? Default PIN is 1234</div>
              <div style={{ fontSize:11, color:"#999" }}>You'll be asked to set a new PIN after your first login.</div>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setStep("phone"); setPin(""); }} style={{ background:"none", border:"none", color:"#999", fontSize:13, marginBottom:20, padding:0, display:"flex", alignItems:"center", gap:4 }}>
              ← {phone}
            </button>

            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:22, fontWeight:700, color:"#1A1A1A", letterSpacing:"-0.5px" }}>Enter your PIN</div>
              <div style={{ fontSize:13, color:"#999", marginTop:4 }}>4-digit security PIN</div>
            </div>

            {/* PIN dots */}
            <div className={error ? "shake" : ""} style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:32 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width:16, height:16, borderRadius:"50%", background: i < pin.length ? "#1A1A1A" : "#ECEAE4", transition:"background 0.15s", transform: i < pin.length ? "scale(1.15)" : "scale(1)" }} />
              ))}
            </div>

            {/* Error */}
            {error && (
              <div style={{ background:"#FBE9E7", borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:13, color:"#BF360C", textAlign:"center", fontWeight:500 }}>
                {error}
              </div>
            )}

            {/* Keypad */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
              {KEYS.map((k, i) => (
                <button
                  key={i}
                  disabled={k === ""}
                  onClick={() => k === "⌫" ? handleBack() : k !== "" ? handleKey(k) : null}
                  style={{
                    height:64, borderRadius:16, border:"none", fontSize: k === "⌫" ? 20 : 22, fontWeight:600,
                    background: k === "" ? "transparent" : k === "⌫" ? "#F0EEE8" : "#fff",
                    color: k === "⌫" ? "#999" : "#1A1A1A",
                    boxShadow: k !== "" && k !== "⌫" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                    cursor: k === "" ? "default" : "pointer",
                    transition:"all 0.1s",
                    transform:"scale(1)",
                  }}
                  onMouseDown={e => { if(k!=="")e.currentTarget.style.transform="scale(0.94)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform="scale(1)"; }}
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canLogin || loading}
              style={{ width:"100%", background: canLogin && !loading ? "#1A1A1A" : "#ECEAE4", color: canLogin && !loading ? "#F7F6F2" : "#BBB", border:"none", borderRadius:14, padding:"15px", fontSize:15, fontWeight:700, transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
            >
              {loading ? (
                <><div style={{ width:18, height:18, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> Signing in…</>
              ) : "Sign in"}
            </button>
          </>
        )}
      </div>

      <div style={{ textAlign:"center", padding:"0 0 24px", fontSize:11, color:"#CCC" }}>
        ChamaFlow v1.0 · Nairobi Professionals Chama
      </div>

      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
