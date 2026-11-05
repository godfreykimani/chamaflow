// ChamaFlow SVG icon set — duo-tone line style
// Primary stroke: currentColor (inherits text color)
// Accent stroke/fill: #2563eb blue

const BASE = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };

export function Icon({ name, size = 18, color = "currentColor" }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", ...BASE, stroke: color, strokeWidth: 1.5, display: "block", flexShrink: 0 };

  switch (name) {
    case "home":
      return <svg {...props}><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"/><path d="M9 21V15H15V21" stroke="#2563eb"/></svg>;
    case "users":
      return <svg {...props}><circle cx="9" cy="7" r="4"/><path d="M2 21C2 17.134 5.134 14 9 14s7 3.134 7 7"/><path d="M16 11c2.209 0 4 1.791 4 4v1" stroke="#2563eb"/><circle cx="17" cy="6" r="3" stroke="#2563eb"/></svg>;
    case "coins":
      return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M8 5v6M6 7h4"/><circle cx="16" cy="16" r="6" stroke="#2563eb"/><path d="M16 13v6M14 15h4" stroke="#2563eb"/></svg>;
    case "alert":
      return <svg {...props}><path d="M12 3L22 20H2L12 3Z"/><line x1="12" y1="10" x2="12" y2="14" stroke="#2563eb"/><circle cx="12" cy="17" r="1" fill="#2563eb" stroke="none"/></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10" stroke="#2563eb"/><rect x="7" y="13" width="3" height="3" rx="1" fill="#2563eb" stroke="none"/></svg>;
    case "chart":
      return <svg {...props}><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1" stroke="#2563eb" fill="#eff6ff"/></svg>;
    case "download":
      return <svg {...props}><path d="M12 3v12M8 11l4 4 4-4"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="#2563eb"/></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3" stroke="#2563eb"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    case "logout":
      return <svg {...props}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7" stroke="#2563eb"/><line x1="21" y1="12" x2="9" y2="12" stroke="#2563eb"/></svg>;
    case "mic":
      return <svg {...props}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0" stroke="#2563eb"/><line x1="12" y1="20" x2="12" y2="22"/></svg>;
    case "plus":
      return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "search":
      return <svg {...props}><circle cx="10" cy="10" r="7"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>;
    case "bell":
      return <svg {...props}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="#2563eb"/></svg>;
    case "chevron-right":
      return <svg {...props}><polyline points="9 18 15 12 9 6"/></svg>;
    case "chevron-left":
      return <svg {...props}><polyline points="15 18 9 12 15 6"/></svg>;
    case "edit":
      return <svg {...props}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#2563eb"/></svg>;
    case "upload":
      return <svg {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8" stroke="#2563eb"/><line x1="12" y1="3" x2="12" y2="15" stroke="#2563eb"/></svg>;
    case "export":
      return <svg {...props}><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6" stroke="#2563eb"/><line x1="12" y1="2" x2="12" y2="15" stroke="#2563eb"/></svg>;
    case "filter":
      return <svg {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case "refresh":
      return <svg {...props}><polyline points="23 4 23 10 17 10" stroke="#2563eb"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
    case "check":
      return <svg {...props}><polyline points="20 6 9 17 4 12" stroke="#2563eb"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>;
  }
}
