import { useState } from "react";

export default function ChangePinPage({ onSave, loading, error }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length === 4 && next !== confirm;
  const ready    = current.length === 4 && next.length === 4 && confirm.length === 4 && !mismatch;

  const PinInput = ({ label, value, onChange }) => (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:10, color:"#999", letterSpacing:1, display:"block", marginBottom:8 }}>{label}</label>
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={e => { if (/^\d*$/.test(e.target.value)) onChange(e.target.value); }}
        style={{ width:"100%", padding:"14px", borderRadius:12, border:`1.5px solid ${value.length===4&&label.includes("Confirm")&&mismatch?"#EF5350":"#ECEAE4"}`, background:"#F9F8F5", fontSize:20, letterSpacing:8, textAlign:"center", fontFamily:"inherit", outline:"none" }}
        placeholder="••••"
      />
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F7F6F2", display:"flex", flexDirection:"column", fontFamily:"'DM Sans', sans-serif", padding:"48px 28px" }}>
      <div style={{ maxWidth:400, width:"100%", margin:"0 auto" }}>
        <div style={{ width:48, height:48, background:"#1A1A1A", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:24 }}>🔐</div>
        <div style={{ fontSize:24, fontWeight:700, color:"#1A1A1A", letterSpacing:"-0.5px", marginBottom:8 }}>Set your PIN</div>
        <div style={{ fontSize:13, color:"#999", marginBottom:32 }}>Your default PIN is 1234. Choose a new 4-digit PIN to secure your account.</div>

        <PinInput label="CURRENT PIN (default: 1234)" value={current} onChange={setCurrent} />
        <PinInput label="NEW PIN" value={next} onChange={setNext} />
        <PinInput label="CONFIRM NEW PIN" value={confirm} onChange={setConfirm} />

        {mismatch && <div style={{ fontSize:12, color:"#EF5350", marginBottom:16, marginTop:-8 }}>PINs do not match</div>}
        {error     && <div style={{ background:"#FBE9E7", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#BF360C", fontWeight:500 }}>{error}</div>}

        <button onClick={() => onSave(current, next)} disabled={!ready||loading} style={{ width:"100%", background: ready&&!loading?"#1A1A1A":"#ECEAE4", color:ready&&!loading?"#F7F6F2":"#BBB", border:"none", borderRadius:14, padding:"15px", fontSize:15, fontWeight:700 }}>
          {loading ? "Saving…" : "Set PIN & Continue"}
        </button>
      </div>
    </div>
  );
}
