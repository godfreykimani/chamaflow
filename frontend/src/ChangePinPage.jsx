import { useState, useRef } from "react";

// Four individual digit boxes — auto-advance, backspace-back, show/hide toggle
function PinBoxes({ value, onChange, hasError }) {
  const [show, setShow] = useState(false);
  // C3: individual declarations — hooks must not be called inside array literals
  const r0 = useRef(null); const r1 = useRef(null); const r2 = useRef(null); const r3 = useRef(null);
  const refs = [r0, r1, r2, r3];

  const handleChange = (i, e) => {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const next = value.slice(0, i) + digit + value.slice(i + 1);
    onChange(next);
    if (i < 3) setTimeout(() => refs[i + 1].current?.focus(), 0);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      if (value[i]) {
        onChange(value.slice(0, i) + "" + value.slice(i + 1));
      } else if (i > 0) {
        refs[i - 1].current?.focus();
        onChange(value.slice(0, i - 1) + "" + value.slice(i));
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs[i - 1].current?.focus();
    } else if (e.key === "ArrowRight" && i < 3) {
      refs[i + 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted) {
      onChange(pasted.padEnd(4, value.slice(pasted.length)).slice(0, 4));
      const focusIdx = Math.min(pasted.length, 3);
      setTimeout(() => refs[focusIdx].current?.focus(), 0);
    }
    e.preventDefault();
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <input
            key={i}
            ref={refs[i]}
            type={show ? "text" : "password"}
            inputMode="numeric"
            maxLength={2}
            value={value[i] || ""}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={e => e.target.select()}
            style={{
              flex: 1,
              height: 60,
              textAlign: "center",
              fontSize: 24,
              fontWeight: 700,
              borderRadius: 14,
              border: `2px solid ${hasError ? "#EF5350" : value[i] ? "#1A1A1A" : "#ECEAE4"}`,
              background: value[i] ? "#F0EDE6" : "#F9F8F5",
              outline: "none",
              fontFamily: "inherit",
              transition: "border-color 0.15s, background 0.15s",
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        style={{ position: "absolute", right: -36, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", padding: 4 }}
        tabIndex={-1}
        aria-label={show ? "Hide PIN" : "Show PIN"}
      >
        {show ? "🙈" : "👁"}
      </button>
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

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>Current PIN</div>
          <PinBoxes value={current} onChange={setCurrent} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>New PIN</div>
          <PinBoxes value={next} onChange={setNext} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: mismatch ? "#EF5350" : "#555", marginBottom: 10 }}>
            Confirm New PIN {mismatch && "— PINs don't match"}
          </div>
          <PinBoxes value={confirm} onChange={setConfirm} hasError={mismatch} />
        </div>

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
