// Detail screens: Match, Team, Player

// ─── MATCH DETAIL ──────────────────────────────────────────────────────────
function ILMatchDetail({ theme, match, onBack, onTeam, onPlayer }) {
  const m = match || IL.MATCH_DETAIL;
  const home = IL.TEAMS[m.home];
  const away = IL.TEAMS[m.away];
  const [tab, setTab] = React.useState('overview');

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Hero gradient (purple→blue, like desktop) */}
      <div style={{
        background: 'linear-gradient(135deg, #5B2A86 0%, #2A6FB5 100%)',
        color: '#fff', padding: '16px 16px 18px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, opacity: 0.9,
            background: 'rgba(255,255,255,0.15)', padding: '3px 9px', borderRadius: 999,
          }}>מרכז משחק</div>
          <div style={{
            fontFamily: 'Heebo, system-ui', fontSize: 11, opacity: 0.85,
          }}>{m.comp}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center' }}>
          <button onClick={() => onTeam(m.home)} style={ilBtn({
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#fff',
          })}>
            <ILCrest team={home} size={56} radius={14}/>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 14, fontWeight: 800, textAlign: 'center',
            }}>{home.name}</div>
            <ILFormRow form={m.homeForm} theme={theme} size={12} gap={2}/>
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 36, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5,
            }}>{m.hs} – {m.as}</div>
            <div style={{
              marginTop: 8,
              display: 'inline-flex', padding: '3px 9px', borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              fontFamily: 'Heebo, system-ui', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
            }}>הסתיים</div>
            <div style={{
              marginTop: 8,
              fontFamily: 'Heebo, system-ui', fontSize: 11, opacity: 0.85,
            }}>{m.date}</div>
          </div>
          <button onClick={() => onTeam(m.away)} style={ilBtn({
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#fff',
          })}>
            <ILCrest team={away} size={56} radius={14}/>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 14, fontWeight: 800, textAlign: 'center',
            }}>{away.name}</div>
            <ILFormRow form={m.awayForm} theme={theme} size={12} gap={2}/>
          </button>
        </div>

        <div style={{
          marginTop: 16,
          fontFamily: 'Heebo, system-ui', fontSize: 11, opacity: 0.8, textAlign: 'center',
        }}>שופט: {m.ref}</div>
      </div>

      {/* Tabs */}
      <ILTabBar
        theme={theme} value={tab} onChange={setTab}
        items={[
          { id: 'overview',  label: 'סקירה' },
          { id: 'stats',     label: 'סטטיסטיקה' },
          { id: 'events',    label: 'אירועים' },
          { id: 'lineups',   label: 'הרכבים' },
        ]}
      />

      <div style={{ paddingTop: 14 }}>
        {tab === 'overview' && <MatchOverview theme={theme} m={m}/>}
        {tab === 'stats'    && <MatchStats theme={theme} m={m}/>}
        {tab === 'events'   && <MatchEvents theme={theme} m={m} onPlayer={onPlayer}/>}
        {tab === 'lineups'  && <MatchLineups theme={theme} m={m}/>}
      </div>
    </div>
  );
}

function MatchOverview({ theme, m }) {
  return (
    <>
      {/* Stat tiles 2x2 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        padding: '0 16px 14px',
      }}>
        {[
          ['כדורגל שליטה', `${m.stats.possession[0]}% / ${m.stats.possession[1]}%`],
          ['בעיטות למסגרת', `${m.stats.shotsOnTarget[0]} / ${m.stats.shotsOnTarget[1]}`],
          ['קרנות', `${m.stats.corners[0]} / ${m.stats.corners[1]}`],
          ['כרטיסים צהובים', `${m.stats.cards[0]} / ${m.stats.cards[1]}`],
        ].map(([label, val]) => (
          <div key={label} style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 14, padding: '14px 12px',
          }}>
            <div style={{
              fontFamily: 'Heebo, system-ui',
              fontSize: 10.5, color: theme.muted, fontWeight: 600, letterSpacing: 0.3,
            }}>{label}</div>
            <div style={{
              marginTop: 6,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 22, fontWeight: 800, color: theme.text, letterSpacing: -0.6,
            }}>{val}</div>
          </div>
        ))}
      </div>
      <ILSection theme={theme} title="אירועים מרכזיים" dense>
        <ILCard theme={theme} p={0}>
          {m.events.slice(0, 3).map((e, i, arr) => (
            <EventRow key={i} e={e} theme={theme} m={m} isLast={i === arr.length - 1}/>
          ))}
        </ILCard>
      </ILSection>
    </>
  );
}

function MatchStats({ theme, m }) {
  const rows = [
    ['כדורגל שליטה',   m.stats.possession,   true],
    ['בעיטות',         m.stats.shots,        false],
    ['בעיטות למסגרת',  m.stats.shotsOnTarget,false],
    ['xG',             m.stats.xg,           false, true],
    ['קרנות',          m.stats.corners,      false],
    ['כרטיסים',        m.stats.cards,        false],
    ['חילופים',        m.stats.subs,         false],
  ];
  return (
    <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(([label, [h, a], pct, dec]) => {
        const total = h + a;
        const hPct = total > 0 ? (h / total) * 100 : 50;
        const fmt = (v) => dec ? v.toFixed(2) : pct ? `${v}%` : v;
        return (
          <div key={label}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 6,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 13, fontWeight: 700, color: theme.text,
              }}>{fmt(h)}</span>
              <span style={{
                fontFamily: 'Heebo, system-ui',
                fontSize: 11.5, fontWeight: 600, color: theme.muted,
              }}>{label}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 13, fontWeight: 700, color: theme.text,
              }}>{fmt(a)}</span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: theme.surface2, overflow: 'hidden',
              display: 'flex', direction: 'ltr',
            }}>
              <div style={{ width: hPct + '%', background: theme.brand }}/>
              <div style={{ width: (100 - hPct) + '%', background: '#2A6FB5' }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ e, theme, m, isLast, onPlayer }) {
  const icons = {
    goal:   <span style={{ color: theme.win, fontSize: 18 }}>⚽</span>,
    yellow: <div style={{ width: 12, height: 16, background: '#FACC15', borderRadius: 2 }}/>,
    red:    <div style={{ width: 12, height: 16, background: theme.loss, borderRadius: 2 }}/>,
    sub:    <span style={{ color: theme.brand, fontSize: 16 }}>⇄</span>,
  };
  const labels = { goal: 'שער', yellow: 'כרטיס צהוב', red: 'כרטיס אדום', sub: 'חילוף' };
  const team = e.team === 'home' ? IL.TEAMS[m.home] : IL.TEAMS[m.away];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${theme.border}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: theme.brandSoft, color: theme.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11, fontWeight: 700,
        position: 'relative', flexShrink: 0,
      }}>
        {e.mins}'
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'Heebo, system-ui', fontSize: 11, color: theme.muted, fontWeight: 500,
          marginBottom: 2,
        }}>
          {icons[e.type]} {labels[e.type]}
        </div>
        <div style={{
          fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 700, color: theme.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {e.type === 'sub' ? `${e.on} ← ${e.off}` : e.player}
          {e.assist && (
            <span style={{ fontWeight: 500, color: theme.muted, fontSize: 12 }}> · בישול: {e.assist}</span>
          )}
        </div>
      </div>
      <ILCrest team={team} size={20}/>
    </div>
  );
}

function MatchEvents({ theme, m, onPlayer }) {
  return (
    <div style={{ padding: '0 16px 14px' }}>
      <ILCard theme={theme} p={0} m="0">
        {m.events.map((e, i) => (
          <EventRow key={i} e={e} theme={theme} m={m} isLast={i === m.events.length - 1} onPlayer={onPlayer}/>
        ))}
      </ILCard>
    </div>
  );
}

function MatchLineups({ theme, m }) {
  // simplified: just show captain/key players list per team
  const home = IL.TEAMS[m.home];
  const away = IL.TEAMS[m.away];
  const homeStarters = [
    'אופיר מרציאנו #1', 'הלדר לופס #22', 'אור בלוריאן #5', 'גיבריל דיופ #44',
    'גיא מזרחי #2', 'קינגס קנגוואה #17', 'לוקאס וטורה #25', 'אליאל פרץ #7',
    'אמיר גנאח #11', 'איגור זלאטנוביץ #66', 'מוחמד אבו רומי #45',
  ];
  const awayStarters = [
    "ג'ו מקדו #55", 'ירדן כהן #16', 'לוקה גדרני #44', 'ברין קרבלי #4',
    'ן אנטוי #2', 'זיב בן שימול #6', 'ירון לוי #8', 'בוריס אנו #40',
    "ג'והנבסקו קלו #9", 'ירדן שועה #7', 'עומר אצילי #77',
  ];
  return (
    <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Pitch theme={theme} team={home} title="הרכב פותח" players={homeStarters} formation="4-3-3"/>
      <Pitch theme={theme} team={away} title="הרכב פותח" players={awayStarters} formation="4-3-3"/>
    </div>
  );
}

function Pitch({ theme, team, title, players, formation }) {
  // 4-3-3 dot positions on a pitch (RTL safe — pitch is symmetric)
  const positions = [
    [50, 92],                                  // GK
    [12, 75], [38, 78], [62, 78], [88, 75],    // back 4
    [25, 55], [50, 52], [75, 55],              // mid 3
    [22, 28], [50, 22], [78, 28],              // front 3
  ];
  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ILCrest team={team} size={22}/>
          <div style={{
            fontFamily: 'Heebo, system-ui', fontSize: 13, fontWeight: 800, color: theme.text,
          }}>{team.name}</div>
        </div>
        <div style={{
          fontFamily: 'Heebo, system-ui', fontSize: 11, color: theme.muted, fontWeight: 600,
        }}>{title} · {formation}</div>
      </div>
      <div style={{
        position: 'relative', height: 220,
        background: `linear-gradient(180deg, #1F7A38, #0E5722)`,
        margin: '0 10px 10px', borderRadius: 12, overflow: 'hidden',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.12)',
      }}>
        {/* pitch lines */}
        <div style={{ position: 'absolute', inset: 8, border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: 4 }}/>
        <div style={{ position: 'absolute', insetInline: 8, top: '50%', height: 1.5, background: 'rgba(255,255,255,0.25)' }}/>
        <div style={{
          position: 'absolute', insetInline: '40%', top: '50%', transform: 'translateY(-50%)',
          aspectRatio: 1, border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: '50%',
        }}/>
        {positions.map(([x, y], i) => (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            transform: 'translate(-50%, -50%)',
            width: 22, height: 22, borderRadius: '50%',
            background: team.bg, color: team.fg,
            border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 9.5, fontWeight: 800,
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}>{(players[i] || '').match(/#(\d+)/)?.[1] || ''}</div>
        ))}
      </div>
      <div style={{
        padding: '0 14px 12px',
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        {players.map((p, i) => (
          <div key={i} style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 11, color: theme.text, fontWeight: 600,
            padding: '3px 8px',
            background: theme.bg, borderRadius: 999,
          }}>{p}</div>
        ))}
      </div>
    </div>
  );
}

// ─── TEAM DETAIL ───────────────────────────────────────────────────────────
function ILTeamDetail({ theme, abbr, onBack, onMatch }) {
  const row = IL.STANDINGS.find((r) => r.abbr === abbr);
  if (!row) return null;
  const t = row;
  const results = [];
  for (const day of IL.FIXTURES) {
    for (const m of day.matches) {
      if (m.status !== 'ft') continue;
      if (m.home === abbr) results.push({ vs: m.away, home: true, hs: m.hs, as: m.as, m });
      else if (m.away === abbr) results.push({ vs: m.home, home: false, hs: m.hs, as: m.as, m });
    }
  }
  const next = t.next ? IL.TEAMS[t.next] : null;

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Hero in team colors */}
      <div style={{
        padding: '20px 16px 18px',
        background: `linear-gradient(180deg, ${t.bg}, ${t.bg}E0)`,
        color: t.fg, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', insetInlineEnd: -30, top: 16, opacity: 0.18,
          fontFamily: 'Heebo, system-ui',
          fontSize: 180, fontWeight: 900, letterSpacing: -6, color: t.fg, lineHeight: 1,
        }}>{t.mono}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <ILCrest team={t} size={64} radius={16}/>
          <div>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 22, fontWeight: 800, letterSpacing: -0.5,
            }}>{t.name}</div>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 12, fontWeight: 600, opacity: 0.75, marginTop: 4,
            }}>ליגת העל · מקום {t.pos}</div>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        background: theme.surface, borderBottom: `1px solid ${theme.border}`,
      }}>
        {[
          { label: "נק'",   v: t.pts },
          { label: 'מש"',   v: t.p },
          { label: 'הפרש',  v: (t.gd>=0?'+':'')+t.gd, color: t.gd>=0?theme.win:theme.loss },
          { label: 'מקום', v: t.pos },
        ].map((s, i, arr) => (
          <div key={s.label} style={{
            padding: '14px 6px', textAlign: 'center',
            borderInlineStart: i === 0 ? 'none' : `1px solid ${theme.border}`,
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 22, fontWeight: 800, color: s.color || theme.text, letterSpacing: -0.6, lineHeight: 1,
            }}>{s.v}</div>
            <div style={{
              fontFamily: 'Heebo, system-ui',
              fontSize: 10.5, fontWeight: 700, color: theme.faint, letterSpacing: 0.4, marginTop: 6,
            }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Next match */}
      {next && (
        <ILSection theme={theme} title="המשחק הבא" dense>
          <ILCard theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ILCrest team={t} size={36}/>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 13, fontWeight: 700, color: theme.muted,
              }}>נגד</div>
              <ILCrest team={next} size={36}/>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 14, fontWeight: 700, color: theme.text,
                }}>{next.name}</div>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 11, color: theme.muted, marginTop: 2,
                }}>שבת · 16 במאי · 20:00</div>
              </div>
              <ILStatusPill status="upcoming" theme={theme}/>
            </div>
          </ILCard>
        </ILSection>
      )}

      {/* Record */}
      <ILSection theme={theme} title="מאזן" dense>
        <ILCard theme={theme}>
          <div style={{
            height: 10, borderRadius: 5, background: theme.surface2, overflow: 'hidden',
            display: 'flex', direction: 'ltr',
          }}>
            <div style={{ width: (t.w/t.p*100)+'%', background: theme.win }}/>
            <div style={{ width: (t.d/t.p*100)+'%', background: theme.draw }}/>
            <div style={{ width: (t.l/t.p*100)+'%', background: theme.loss }}/>
          </div>
          <div style={{
            display: 'flex', gap: 14, marginTop: 12,
            fontFamily: 'Heebo, system-ui', fontSize: 12, color: theme.muted, fontWeight: 500,
          }}>
            <span><b style={{ color: theme.win }}>{t.w}</b> נצחונות</span>
            <span><b style={{ color: theme.draw }}>{t.d}</b> תיקו</span>
            <span><b style={{ color: theme.loss }}>{t.l}</b> הפסדים</span>
            <span style={{ marginInlineStart: 'auto' }}>
              <span style={{ color: theme.text, fontWeight: 700 }}>{t.gf}</span>
              <span style={{ opacity: 0.5 }}> זכות · </span>
              <span style={{ color: theme.text, fontWeight: 700 }}>{t.ga}</span>
              <span style={{ opacity: 0.5 }}> חובה</span>
            </span>
          </div>
        </ILCard>
      </ILSection>

      {/* Form */}
      <ILSection theme={theme} title="כושר אחרון" dense>
        <div style={{ padding: '0 16px' }}>
          <ILFormRow form={t.form} theme={theme} size={28} gap={6}/>
        </div>
      </ILSection>

      {/* Recent results */}
      {results.length > 0 && (
        <ILSection theme={theme} title="תוצאות אחרונות">
          <ILCard theme={theme} p={0}>
            {results.map((r, i) => {
              const ours = r.home ? r.hs : r.as;
              const opp = r.home ? r.as : r.hs;
              const won = ours > opp;
              const drew = ours === opp;
              const oppTeam = IL.TEAMS[r.vs];
              return (
                <button key={i} onClick={() => onMatch(r.m)} style={ilBtn({
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', width: '100%',
                  borderBottom: i === results.length - 1 ? 'none' : `1px solid ${theme.border}`,
                  textAlign: 'right',
                })}>
                  <ILFormPill result={won?'נ':drew?'ת':'ה'} theme={theme} size={22}/>
                  <ILCrest team={oppTeam} size={22}/>
                  <div style={{
                    flex: 1, fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 600, color: theme.text,
                  }}>{r.home ? 'בית' : 'חוץ'} מול {oppTeam.name}</div>
                  <div style={{
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: 13.5, fontWeight: 800, color: theme.text,
                  }}>{ours}–{opp}</div>
                </button>
              );
            })}
          </ILCard>
        </ILSection>
      )}
    </div>
  );
}

// ─── PLAYER DETAIL ─────────────────────────────────────────────────────────
function ILPlayerDetail({ theme, player, onBack, onTeam }) {
  const p = { ...IL.PLAYER_DETAIL, ...(player || {}) };
  const cards = Array.isArray(p.cards) ? p.cards : IL.PLAYER_DETAIL.cards;
  const team = IL.TEAMS[p.team] || { name: '—', bg: theme.brand, fg: '#fff', mono: '?' };
  const [tab, setTab] = React.useState('stats');
  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Red gradient header card */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: `linear-gradient(135deg, ${team.bg} 0%, ${team.bg}D0 100%)`,
          color: team.fg,
          borderRadius: 16, padding: 16,
          display: 'flex', alignItems: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', insetInlineStart: -10, bottom: -20, opacity: 0.15,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 110, fontWeight: 800, lineHeight: 1, color: team.fg,
          }}>{p.shirt}</div>
          <PlayerAvatar size={84} name={p.name} theme={theme}/>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 22, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.1,
            }}>{p.name}</div>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 12, fontWeight: 600, marginTop: 6, opacity: 0.85,
            }}>{team.name} · #{p.shirt} · {p.pos}</div>
            <div style={{
              marginTop: 6,
              fontFamily: 'Heebo, system-ui', fontSize: 11, opacity: 0.7,
            }}>{p.nat} · גיל {p.age}</div>
          </div>
        </div>
      </div>

      <ILTabBar
        theme={theme} value={tab} onChange={setTab}
        items={[
          { id: 'overview', label: 'סקירה' },
          { id: 'stats',    label: 'סטטיסטיקה' },
          { id: 'career',   label: 'קריירה' },
          { id: 'history',  label: 'היסטוריה' },
        ]}
      />

      <div style={{ paddingTop: 14 }}>
        {/* Big stat cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          padding: '0 16px',
        }}>
          {[
            { label: 'הופעות', v: p.apps, sub: `(${p.starts} פתיחות)` },
            { label: 'שערים',  v: p.goals },
            { label: 'בישולים', v: p.assists },
          ].map((s) => (
            <div key={s.label} style={{
              background: theme.surface, border: `1px solid ${theme.border}`,
              borderRadius: 14, padding: '14px 12px', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 28, fontWeight: 800, color: theme.text, lineHeight: 1, letterSpacing: -0.6,
              }}>{s.v}</div>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 11, fontWeight: 700, color: theme.muted,
                marginTop: 6,
              }}>{s.label}</div>
              {s.sub && (
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 9.5, color: theme.faint, marginTop: 2,
                }}>{s.sub}</div>
              )}
            </div>
          ))}
        </div>

        {/* Two-column stats */}
        <div style={{
          padding: '14px 16px 0',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <StatCard theme={theme} title="התקפה" rows={[
            ['שערים', p.goals],
            ['בישולים', p.assists],
            ['בעיטות', p.shots],
            ['מסירות מפתח', p.keyPasses],
            ['דריבלים', `${p.dribblesWon} (${p.dribblesTried})`],
          ]}/>
          <StatCard theme={theme} title="החזקת כדור" rows={[
            ['מסירות', `${p.passes} (${p.passPct}%)`],
            ['ניצוחי הצמדה', `${p.won}/${p.won + p.lost}`],
          ]}/>
          <StatCard theme={theme} title="פיזיות" rows={[
            ['דקות', p.mins],
            ['פתיחות', p.starts],
            ['הוחלף', 22],
          ]}/>
          <StatCard theme={theme} title="משמעת" rows={[
            ['צהובים', p.yellows],
            ['עבירות שביצע', p.foulsCommitted],
            ['עבירות שספג', p.foulsSuffered],
          ]}/>
        </div>

        {/* Cards history */}
        <ILSection theme={theme} title="כרטיסים — היסטוריה">
          <ILCard theme={theme} p={0}>
            {cards.map((c, i, arr) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px',
                borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${theme.border}`,
                background: i % 2 === 0 ? theme.eventCardBg : 'transparent',
              }}>
                <div style={{ width: 11, height: 14, background: '#FACC15', borderRadius: 2, flexShrink: 0 }}/>
                <div style={{
                  flex: 1, fontFamily: 'Heebo, system-ui', fontSize: 12.5, fontWeight: 600, color: theme.text,
                }}>{c.date} · {c.text}</div>
                <div style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 12, fontWeight: 700, color: theme.muted,
                }}>{c.min}'</div>
              </div>
            ))}
          </ILCard>
        </ILSection>
      </div>
    </div>
  );
}

function StatCard({ theme, title, rows }) {
  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: '10px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'Heebo, system-ui',
        fontSize: 11.5, fontWeight: 700, color: theme.text, marginBottom: 8,
      }}>
        <span style={{ width: 2.5, height: 12, background: theme.brand, borderRadius: 2 }}/>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(([label, v]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{
              fontFamily: 'Heebo, system-ui', fontSize: 11.5, color: theme.muted,
            }}>{label}</span>
            <span style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 12, fontWeight: 700, color: theme.text,
            }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ILMatchDetail, ILTeamDetail, ILPlayerDetail });
