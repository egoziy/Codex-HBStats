// HBS Stats v2 — RTL Hebrew theme + shared components matching the brand.

function ilTheme(dark) {
  return dark ? {
    bg: '#0F0F12', surface: '#18181D', surface2: '#22222A',
    border: '#2A2A32', borderStrong: '#3A3A44',
    text: '#FAFAFA', muted: '#9A9AA2', faint: '#5E5E66',
    brand: '#E11D2A', brandDark: '#9B0E26', brandSoft: '#E11D2A22',
    win: '#22C55E', winSoft: '#22C55E22',
    draw: '#9CA3AF', drawSoft: '#9CA3AF22',
    loss: '#EF4444', lossSoft: '#EF444422',
    zoneChamp: '#FACC15',     // gold for #1
    zoneCl: '#DC2626',        // CL/EL slots → red dot in IL
    zoneEl: '#EA580C',
    zoneRel: '#DC2626',
    statusFt: '#16A34A', statusFtBg: '#16A34A20',
    statusSoon: '#1A1A1F', statusSoonBg: '#FFFFFF14',
    statusLive: '#E11D2A', statusLiveBg: '#E11D2A22',
    statusPlanned: '#1A1A1F', statusPlannedBg: '#FFFFFF10',
    eventCardBg: '#FEF3C7',
    matchScoreBg: '#0F0F12',
    matchScoreFg: '#FAFAFA',
    dark: true,
  } : {
    bg: '#F4F4F6', surface: '#FFFFFF', surface2: '#F9F9FB',
    border: '#E5E5EA', borderStrong: '#D1D1D6',
    text: '#1A1A1F', muted: '#6B6B70', faint: '#A1A1A6',
    brand: '#C8102E', brandDark: '#9B0E26', brandSoft: '#C8102E14',
    win: '#16A34A', winSoft: '#DCFCE7',
    draw: '#9CA3AF', drawSoft: '#F3F4F6',
    loss: '#DC2626', lossSoft: '#FEE2E2',
    zoneChamp: '#F59E0B',
    zoneCl: '#DC2626',
    zoneEl: '#EA580C',
    zoneRel: '#DC2626',
    statusFt: '#16A34A', statusFtBg: '#DCFCE7',
    statusSoon: '#1A1A1F', statusSoonBg: '#FFE4E6',
    statusLive: '#DC2626', statusLiveBg: '#FEE2E2',
    statusPlanned: '#1A1A1F', statusPlannedBg: '#F3F4F6',
    eventCardBg: '#FEF9C3',
    matchScoreBg: '#1A1A1F',
    matchScoreFg: '#FFFFFF',
    dark: false,
  };
}

// ── Crest — Hebrew monogram on color block ─────────────────────────────────
function ILCrest({ team, size = 28, radius }) {
  const r = radius ?? size * 0.22;
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: team.bg, color: team.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Heebo, system-ui',
      fontWeight: 800, fontSize: size * 0.34, letterSpacing: -0.1,
      flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(135deg, transparent 60%, ${team.fg}1A 60%)`,
      }}/>
      <span style={{ position: 'relative' }}>{team.mono}</span>
    </div>
  );
}

// ── Form pill in Hebrew letters (נ / ת / ה) ────────────────────────────────
function ILFormPill({ result, theme, size = 20 }) {
  const map = {
    'נ': { c: theme.win,  label: 'נ' },
    'ת': { c: theme.draw, label: 'ת' },
    'ה': { c: theme.loss, label: 'ה' },
  };
  const { c, label } = map[result] || map['ת'];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Heebo, system-ui',
      fontSize: size * 0.55, fontWeight: 700, lineHeight: 1,
    }}>{label}</div>
  );
}

function ILFormRow({ form, theme, size = 20, gap = 4 }) {
  return (
    <div style={{ display: 'flex', gap, flexDirection: 'row' }}>
      {form.split('').map((r, i) => <ILFormPill key={i} result={r} theme={theme} size={size}/>)}
    </div>
  );
}

// ── Trend arrow (next to position) ──────────────────────────────────────────
function ILTrend({ move, theme }) {
  if (move > 0) return <span style={{ color: theme.win, display: 'inline-flex' }}>▲</span>;
  if (move < 0) return <span style={{ color: theme.loss, display: 'inline-flex' }}>▼</span>;
  return <span style={{ color: theme.faint, display: 'inline-flex' }}>–</span>;
}

// ── App header — solid red bar with HBS badge + live ticker stripe ─────────
function ILHeader({ theme, title, onBack, sub, ticker, dense = false }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Live ticker stripe */}
      {ticker && <ILTicker theme={theme}/>}

      {/* Red bar with logo */}
      <div style={{
        background: theme.brand, color: '#fff',
        padding: ticker ? '8px 14px 10px' : '54px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, position: 'relative',
      }}>
        {onBack ? (
          <button onClick={onBack} style={ilBtn({ color: '#fff', display: 'flex', padding: 6, margin: -6 })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l6 6M5 12l6-6M5 12h14"/>
            </svg>
          </button>
        ) : (
          <button style={ilBtn({ color: '#fff', display: 'flex', padding: 6, margin: -6 })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h10"/>
            </svg>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.4, opacity: 0.9,
          }}>ליגת העל</div>
          <div style={{
            background: '#fff', color: theme.brand,
            width: 36, height: 22, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Heebo, system-ui',
            fontSize: 12, fontWeight: 900, letterSpacing: -0.3,
          }}>HBS</div>
        </div>

        <button style={ilBtn({ color: '#fff', display: 'flex', padding: 6, margin: -6 })}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>
          </svg>
        </button>
      </div>

      {/* Title block under the red bar */}
      {title && (
        <div style={{
          background: theme.bg, color: theme.text,
          padding: dense ? '14px 16px 8px' : '18px 16px 12px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 24, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1,
          }}>{title}</div>
          {sub && (
            <div style={{
              marginTop: 4,
              fontFamily: 'Heebo, system-ui',
              fontSize: 12.5, color: theme.muted, fontWeight: 500,
            }}>{sub}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live results ticker stripe (black bar above the header) ────────────────
function ILTicker({ theme }) {
  // Loop the items twice for seamless marquee
  const items = [...IL.TICKER, ...IL.TICKER];
  return (
    <div style={{
      paddingTop: 44, background: '#0A0A0C',
      color: '#fff', overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        display: 'flex', gap: 22, padding: '8px 14px',
        animation: 'ilMarq 28s linear infinite', whiteSpace: 'nowrap',
        width: 'max-content',
      }}>
        {items.map((m, i) => {
          const home = IL.TEAMS[m.home], away = IL.TEAMS[m.away];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'Heebo, system-ui',
              fontSize: 11.5, fontWeight: 500,
            }}>
              {m.status === 'live' && (
                <span style={{
                  background: theme.brand, color: '#fff',
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  letterSpacing: 0.3,
                }}>חי {m.mins}'</span>
              )}
              {m.status === 'soon' && (
                <span style={{
                  color: '#9A9AA2', fontSize: 10, fontWeight: 600,
                }}>בקרוב</span>
              )}
              <span style={{ opacity: 0.95 }}>{home.name}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 11, fontWeight: 700,
                color: m.status === 'live' ? '#fff' : '#9A9AA2',
              }}>
                {m.status === 'live' ? `${m.hs}–${m.as}` : m.time}
              </span>
              <span style={{ opacity: 0.95 }}>{away.name}</span>
              <span style={{ color: '#3A3A44', marginInlineStart: 6 }}>·</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bottom nav ─────────────────────────────────────────────────────────────
function ILBottomNav({ theme, active, onNav }) {
  const tabs = [
    { id: 'home',      label: 'בית',     icon: <path d="M3 11l9-7 9 7M5 10v10h14V10"/> },
    { id: 'table',     label: 'טבלה',    icon: <path d="M4 4h16v4H4zM4 12h16v4H4zM4 20h16"/> },
    { id: 'matches',   label: 'משחקים',  icon: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/></> },
    { id: 'players',   label: 'שחקנים',  icon: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></> },
    { id: 'live',      label: 'חי',      icon: <><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0"/></> },
  ];
  return (
    <div style={{
      flexShrink: 0,
      background: theme.surface,
      borderTop: `1px solid ${theme.border}`,
      paddingBottom: 26, paddingTop: 6,
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onNav(t.id)} style={ilBtn({
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '6px 8px',
            color: on ? theme.brand : theme.muted,
          })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
            <div style={{
              fontFamily: 'Heebo, system-ui',
              fontSize: 10.5, fontWeight: on ? 700 : 600,
            }}>{t.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Status pill (FT / LIVE / SOON / PLANNED) ────────────────────────────────
function ILStatusPill({ status, mins, time, theme }) {
  const map = {
    ft:       { label: 'הסתיים',    fg: theme.statusFt,      bg: theme.statusFtBg },
    live:     { label: `חי ${mins}'`, fg: theme.statusLive,    bg: theme.statusLiveBg },
    upcoming: { label: 'בקרוב',     fg: theme.statusSoon,    bg: theme.statusSoonBg },
    planned:  { label: 'טרם שוחק', fg: theme.statusPlanned, bg: theme.statusPlannedBg },
  };
  const s = map[status] || map.planned;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', borderRadius: 999,
      background: s.bg, color: s.fg,
      fontFamily: 'Heebo, system-ui',
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.1,
    }}>
      {status === 'live' && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'currentColor', animation: 'ilPulse 1.4s infinite',
        }}/>
      )}
      {s.label}
    </div>
  );
}

// ── Score capsule (black pill with score) ───────────────────────────────────
function ILScore({ hs, as, theme, mode = 'capsule' }) {
  if (mode === 'capsule') {
    return (
      <div style={{
        background: theme.matchScoreBg, color: theme.matchScoreFg,
        padding: '7px 14px', borderRadius: 8,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 16, fontWeight: 700, letterSpacing: 0.3,
        display: 'inline-flex', gap: 4,
      }}>
        <span>{hs}</span><span>–</span><span>{as}</span>
      </div>
    );
  }
  return (
    <div style={{
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 22, fontWeight: 800, color: theme.text,
    }}>{hs} – {as}</div>
  );
}

// ── Chip row (scrollable filters) ──────────────────────────────────────────
function ILChipRow({ items, value, onChange, theme }) {
  return (
    <div style={{
      display: 'flex', gap: 8,
      overflowX: 'auto', scrollbarWidth: 'none',
      padding: '0 16px',
    }}>
      {items.map((it) => {
        const id = typeof it === 'string' ? it : it.id;
        const label = typeof it === 'string' ? it : it.label;
        const dot = typeof it === 'object' ? it.dot : null;
        const on = value === id;
        return (
          <button key={id} onClick={() => onChange(id)} style={ilBtn({
            padding: '7px 14px', borderRadius: 999,
            background: on ? theme.text : theme.surface,
            color: on ? theme.bg : theme.text,
            border: `1px solid ${on ? theme.text : theme.border}`,
            fontFamily: 'Heebo, system-ui',
            fontSize: 12.5, fontWeight: 600,
            whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            flexShrink: 0,
          })}>
            {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }}/>}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Underline tabs ─────────────────────────────────────────────────────────
function ILTabBar({ items, value, onChange, theme }) {
  return (
    <div style={{
      display: 'flex', gap: 20,
      borderBottom: `1px solid ${theme.border}`,
      padding: '0 16px',
      background: theme.surface,
    }}>
      {items.map((it) => {
        const id = typeof it === 'string' ? it : it.id;
        const label = typeof it === 'string' ? it : it.label;
        const on = value === id;
        return (
          <button key={id} onClick={() => onChange(id)} style={ilBtn({
            padding: '12px 0', position: 'relative',
            color: on ? theme.brand : theme.muted,
            fontFamily: 'Heebo, system-ui',
            fontSize: 13.5, fontWeight: on ? 700 : 600,
          })}>
            {label}
            {on && <div style={{
              position: 'absolute', insetInline: 0, bottom: -1, height: 2,
              background: theme.brand, borderRadius: 1,
            }}/>}
          </button>
        );
      })}
    </div>
  );
}

// ── Section header (red bar accent, like the desktop site) ─────────────────
function ILSection({ theme, title, action, children, dense = false }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: `0 16px ${dense ? 8 : 10}px`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'Heebo, system-ui',
          fontSize: 15, fontWeight: 800, color: theme.text, letterSpacing: -0.3,
        }}>
          <span style={{ width: 3, height: 16, background: theme.brand, borderRadius: 2 }}/>
          {title}
        </div>
        {action && (
          <button style={ilBtn({
            color: theme.brand,
            fontFamily: 'Heebo, system-ui',
            fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          })}>
            {action}
            <span style={{ fontSize: 10 }}>←</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Common card wrapper (white, rounded, hairline border) ──────────────────
function ILCard({ theme, children, p = 14, m = '0 16px', style = {} }) {
  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14, margin: m, padding: p,
      ...style,
    }}>{children}</div>
  );
}

function ilBtn(extra = {}) {
  return {
    appearance: 'none', border: 0, background: 'transparent',
    cursor: 'pointer', padding: 0, margin: 0,
    fontFamily: 'inherit', fontSize: 'inherit',
    color: 'inherit',
    ...extra,
  };
}

Object.assign(window, {
  ilTheme, ILCrest, ILFormPill, ILFormRow, ILTrend,
  ILHeader, ILTicker, ILBottomNav, ILStatusPill, ILScore,
  ILChipRow, ILTabBar, ILSection, ILCard, ilBtn,
});
