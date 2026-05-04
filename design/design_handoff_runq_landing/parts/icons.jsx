// Inline SVG icons matching lucide style. Stroke 1.75, 24x24 viewBox.
const Icon = ({ d, paths, size = 18, className = '', strokeWidth = 1.75, fill = 'none', stroke = 'currentColor' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {d ? <path d={d} /> : paths}
  </svg>
);

const I = {
  Arrow: (p) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />,
  ArrowDown: (p) => <Icon {...p} d="M12 5v14M6 13l6 6 6-6" />,
  Check: (p) => <Icon {...p} d="M20 6 9 17l-5-5" />,
  CheckCircle: (p) => <Icon {...p} paths={<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>} />,
  X: (p) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Sparkle: (p) => <Icon {...p} d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
  Zap: (p) => <Icon {...p} d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" fill="none" />,
  Bot: (p) => <Icon {...p} paths={<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 8V4M8 4h8" /><circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" /></>} />,
  Phone: (p) => <Icon {...p} paths={<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>} />,
  Receipt: (p) => <Icon {...p} d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3l-3 2-2-2-2 2-2-2-2 2-3-2Z" />,
  Landmark: (p) => <Icon {...p} paths={<><path d="M3 21h18" /><path d="M3 10h18" /><path d="m12 3 9 7H3l9-7Z" /><path d="M6 13v5M10 13v5M14 13v5M18 13v5" /></>} />,
  FileText: (p) => <Icon {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6" />,
  TrendUp: (p) => <Icon {...p} d="M3 17 9 11l4 4 8-8M14 7h7v7" />,
  Users: (p) => <Icon {...p} paths={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
  ChevronDown: (p) => <Icon {...p} d="m6 9 6 6 6-6" />,
  ChevronRight: (p) => <Icon {...p} d="m9 6 6 6-6 6" />,
  Menu: (p) => <Icon {...p} d="M4 6h16M4 12h16M4 18h16" />,
  Search: (p) => <Icon {...p} paths={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />,
  Shield: (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  ShieldCheck: (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-11 2 2 4-4" />,
  Mobile: (p) => <Icon {...p} paths={<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>} />,
  Camera: (p) => <Icon {...p} paths={<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="4" /></>} />,
  Bell: (p) => <Icon {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M9 21a3 3 0 0 0 6 0" />,
  Wifi: (p) => <Icon {...p} d="M5 12.55a11 11 0 0 1 14 0M2 8.82a15 15 0 0 1 20 0M8.5 16.4a6 6 0 0 1 7 0M12 20h.01" />,
  Fingerprint: (p) => <Icon {...p} d="M12 11c-1 5-3 8-3 8M19 17c-2 5-3 5-3 5M5 13s.5-3 1-4M9 19s1-3 2-7M16 14c0-3-2-5-4-5s-4 2-4 5M9 13c0-2 1-3 3-3s3 1 3 3M11 22a13 13 0 0 0 0-9M3 17c0-3 1-7 4-9M21 13c0-3-1-7-4-9" />,
  Hash: (p) => <Icon {...p} d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  GitBranch: (p) => <Icon {...p} paths={<><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>} />,
  Inbox: (p) => <Icon {...p} d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />,
  Globe: (p) => <Icon {...p} paths={<><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></>} />,
  Clock: (p) => <Icon {...p} paths={<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>} />,
  Plus: (p) => <Icon {...p} d="M12 5v14M5 12h14" />,
  Send: (p) => <Icon {...p} d="m22 2-7 20-4-9-9-4 20-7Z" />,
  Apple: (p) => <Icon {...p} d="M16 4a4 4 0 0 1-3 4M11 9c-3.5 0-7 3-7 7.5 0 4 3 7.5 5 7.5 1.5 0 2-1 3.5-1s2 1 3.5 1c1.7 0 5-3 5-8 0-2.5-2-4-3.5-4S13 11 11 9Z" fill="none" />,
  Play: (p) => <Icon {...p} d="m6 4 14 8-14 8V4Z" fill="currentColor" stroke="none" />,
  Filter: (p) => <Icon {...p} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />,
  Eye: (p) => <Icon {...p} paths={<><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></>} />,
  Download: (p) => <Icon {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  Cloud: (p) => <Icon {...p} d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6.5 19h11Z" />,
  Refresh: (p) => <Icon {...p} d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />,
  Settings: (p) => <Icon {...p} paths={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.16.69.35 1 .59" /></>} />,
  Twitter: (p) => <Icon {...p} d="M22 5.8c-.7.3-1.5.5-2.4.6.9-.5 1.5-1.3 1.8-2.3-.8.5-1.7.8-2.6 1A4.1 4.1 0 0 0 12 8.7c0 .3 0 .6.1.9C8.3 9.4 5.1 7.7 3 5.1c-.4.7-.6 1.5-.6 2.3 0 1.4.7 2.7 1.8 3.4-.7 0-1.3-.2-1.9-.5v.05c0 2 1.4 3.7 3.3 4-.3.1-.7.2-1.1.2-.3 0-.5 0-.8-.1.5 1.6 2 2.8 3.8 2.8a8.2 8.2 0 0 1-6 1.7c2 1.2 4.3 2 6.7 2 8 0 12.5-6.7 12.5-12.5v-.6c.9-.6 1.6-1.4 2.2-2.3Z" />,
  Linkedin: (p) => <Icon {...p} paths={<><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></>} />,
  Github: (p) => <Icon {...p} d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.4 3.4 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.4 13.4 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />,
  Heart: (p) => <Icon {...p} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" fill="currentColor" stroke="none" />,
  Lock: (p) => <Icon {...p} paths={<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>} />,
  Building: (p) => <Icon {...p} d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" />,
  Layers: (p) => <Icon {...p} d="m12 2 10 6-10 6L2 8l10-6Zm0 14L2 10m20 0L12 16Zm0 6L2 16m20 0L12 22Z" />,
  Mic: (p) => <Icon {...p} d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />,
  Tally: (p) => <Icon {...p} d="M5 4v16M9 4v16M13 4v16M17 4v16" />,
  Battery: (p) => <Icon {...p} paths={<><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 11v2" /><rect x="4" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none" /></>} />,
  Signal: (p) => <Icon {...p} d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 20V4" />,
  Coins: (p) => <Icon {...p} paths={<><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></>} />,
};

window.I = I;
