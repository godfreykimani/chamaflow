import { useState } from "react";

function PinField({ label, value, onChange, hasError, errorText, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: hasError ? "#EF5350" : "#555", marginBottom: 8 }}>
        {label}{errorText && <span style={{ fontWeight: 400, marginLeft: 6 }}>— {errorText}</span>}
      </div>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          inputMode="numeric"
          maxLength={4}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
          autoFocus={autoFocus}
          placeholder="••••"
          style={{
            width: "100%", height: 56, padding: "0 48px 0 18px",
            fontSize: 24, fontWeight: 700, letterSpacing: 8,
            borderRadius: 14, border: `2px solid ${hasError ? "#EF5350" : value.length === 4 ? "#1A1A1A" : "#ECEAE4"}`,
            background: value ? "#F0EDE6" : "#F9F8F5",
            outline: "none", fontFamily: "inherit",
            transition: "border-color 0.15s, background 0.15s",
            boxSizing: "border-box",
          }}
        />
        <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
          style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", padding: 4 }}
          aria-label={show ? "Hide PIN" : "Show PIN"}>
          {show ? "🙈" : "👁"}
        </button>
      </div>
    </div>
  );
}

export default function ChangePinPage({ onSave, loading, error }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length === 4 && next !== confirm;
  const ready    = current.length === 4 && next.length === 4 && confirm.length === 4 && !mismatch;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F6F2", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", padding: "48px 24px" }}>
      <div style={{ maxWidth: 360, width: "100%", margin: "0 auto" }}>

        <div style={{ width: 52, height: 52, background: "#1A1A1A", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 28 }}>🔐</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.5px", marginBottom: 6 }}>Set your PIN</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 36, lineHeight: 1.5 }}>
          Your default PIN is <strong style={{ color: "#1A1A1A" }}>1234</strong>. Choose a new 4-digit PIN to secure your account.
        </div>

        <PinField label="Current PIN" value={current} onChange={setCurrent} autoFocus />
        <PinField label="New PIN"     value={next}    onChange={setNext} />
        <PinField label="Confirm New PIN" value={confirm} onChange={setConfirm}
          hasError={mismatch} errorText={mismatch ? "PINs don't match" : undefined} />

        {error && (
          <div style={{ background: "#FBE9E7", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#BF360C", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <button
          onClick={() => onSave(current, next)}
          disabled={!ready || loading}
          style={{ width: "100%", background: ready && !loading ? "#1A1A1A" : "#ECEAE4", color: ready && !loading ? "#F7F6F2" : "#BBB", border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 700, cursor: ready && !loading ? "pointer" : "default", transition: "all 0.2s" }}
        >
          {loading ? "Saving…" : "Set PIN & Continue"}
        </button>
      </div>
    </div>
  );
}
