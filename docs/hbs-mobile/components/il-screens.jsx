// Screens: Home, Standings, Matches, Players, Live

// ─── HOME ──────────────────────────────────────────────────────────────────
function ILHome({ theme, onTeam, onMatch, onPlayer }) {
  // Next/featured match — first upcoming, otherwise top live
  const featured = (() => {
    for (const d of IL.FIXTURES) {
      for (const m of d.matches) if (m.status === 'live') return { ...m, when: d.day };
    }
    for (const d of IL.FIXTURES) {
      for (const m of d.matches) if (m.status === 'upcoming') return { ...m, when: d.day };
    }
    return null;
  })();

  const top5 = IL.STANDINGS.slice(0, 5);
  const upperPlayoff = IL.FIXTURES[0].matches.filter((m) => m.comp?.includes('עליון'));

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Featured match hero */}
      {featured && (
        <div style={{
          background: `linear-gradient(180deg, ${theme.brand} 0%, ${theme.brandDark} 100%)`,
          color: '#fff', padding: '16px 16px 22px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', insetInline: 0, top: 12,
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 10, fontWeight: 700,
              letterSpacing: 0.5, opacity: 0.85,
              background: 'rgba(255,255,255,0.15)', padding: '3px 9px', borderRadius: 999,
            }}>המשחק הבא · ליגת העל</div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center', gap: 14, marginTop: 32,
          }}>
            <button onClick={() => onTeam(featured.home)} style={ilBtn({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#fff',
            })}>
              <ILCrest team={IL.TEAMS[featured.home]} size={52} radius={14}/>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 700, textAlign: 'center',
              }}>{IL.TEAMS[featured.home].name}</div>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 10, opacity: 0.75,
              }}>בית</div>
            </button>
            <div style={{ textAlign: 'center' }}>
              {featured.status === 'live' ? (
                <>
                  <div style={{
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: 28, fontWeight: 800, lineHeight: 1,
                  }}>{featured.hs} – {featured.as}</div>
                  <div style={{
                    marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'Heebo, system-ui', fontSize: 11, fontWeight: 700,
                    background: '#fff', color: theme.brand,
                    padding: '3px 8px', borderRadius: 999,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.brand, animation: 'ilPulse 1.4s infinite' }}/>
                    חי {featured.mins}'
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    fontFamily: 'Heebo, system-ui', fontSize: 26, fontWeight: 800, letterSpacing: -0.5,
                  }}>VS</div>
                  <div style={{
                    marginTop: 6,
                    fontFamily: 'Heebo, system-ui', fontSize: 11, fontWeight: 600, opacity: 0.85,
                  }}>{featured.when} · {featured.time}</div>
                </>
              )}
            </div>
            <button onClick={() => onTeam(featured.away)} style={ilBtn({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#fff',
            })}>
              <ILCrest team={IL.TEAMS[featured.away]} size={52} radius={14}/>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 700, textAlign: 'center',
              }}>{IL.TEAMS[featured.away].name}</div>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 10, opacity: 0.75,
              }}>חוץ</div>
            </button>
          </div>
          <button onClick={() => onMatch(featured)} style={ilBtn({
            display: 'block', margin: '18px auto 0',
            background: '#fff', color: theme.brand,
            padding: '10px 22px', borderRadius: 999,
            fontFamily: 'Heebo, system-ui', fontSize: 13, fontWeight: 800,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          })}>לעמוד המשחק</button>
        </div>
      )}

      <div style={{ height: 16 }}/>

      {/* Predictions card */}
      <ILSection theme={theme} title="תחזיות" action="למשחקים">
        <ILCard theme={theme}>
          <div style={{
            fontFamily: 'Heebo, system-ui', fontSize: 13, fontWeight: 700, color: theme.text,
            marginBottom: 12,
          }}>הפועל באר שבע · מכבי תל אביב</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PredBar label="בית" pct={48} color={theme.brand} theme={theme} bold/>
            <PredBar label="תיקו" pct={26} color={theme.draw} theme={theme}/>
            <PredBar label="חוץ" pct={26} color={theme.zoneEl} theme={theme}/>
          </div>
        </ILCard>
      </ILSection>

      {/* Standings preview */}
      <ILSection theme={theme} title="טבלת ליגת העל" action="טבלה מלאה">
        <ILCard theme={theme} p={0}>
          {top5.map((r, i) => {
            const z = ilZoneColor(r.pos, theme);
            return (
              <button key={r.abbr} onClick={() => onTeam(r.abbr)} style={ilBtn({
                display: 'grid', width: '100%',
                gridTemplateColumns: '22px 1fr auto auto',
                alignItems: 'center', gap: 10,
                padding: '11px 14px',
                borderBottom: i === top5.length - 1 ? 'none' : `1px solid ${theme.border}`,
                position: 'relative',
              })}>
                {z && <div style={{ position: 'absolute', insetBlock: 8, insetInlineEnd: 0, width: 3, background: z, borderRadius: 2 }}/>}
                <div style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 12, fontWeight: 700, color: theme.muted, textAlign: 'center',
                }}>{r.pos}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <ILCrest team={r} size={22}/>
                  <div style={{
                    fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 600, color: theme.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.name}</div>
                </div>
                <div style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 11, color: theme.muted,
                }}>{r.p}</div>
                <div style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 14, fontWeight: 800, color: theme.text,
                  background: theme.brandSoft,
                  borderRadius: 6, padding: '2px 8px', minWidth: 30, textAlign: 'center',
                }}>{r.pts}</div>
              </button>
            );
          })}
        </ILCard>
      </ILSection>

      {/* Upper playoff matches */}
      <ILSection theme={theme} title="פלייאוף עליון · מחזור 35" action="כל המשחקים">
        <ILCard theme={theme} p={0}>
          {upperPlayoff.slice(0, 3).map((m, i, arr) => (
            <MatchRow key={i} m={m} theme={theme} onClick={() => onMatch(m)}
                      isLast={i === arr.length - 1}/>
          ))}
        </ILCard>
      </ILSection>

      {/* Suspended */}
      <ILSection theme={theme} title="מורחקים" action="לסטטיסטיקות">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
          {IL.SUSPENDED.map((p) => (
            <div key={p.name} style={{
              background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12,
              padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: theme.lossSoft, color: theme.loss,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Heebo, system-ui', fontSize: 14, fontWeight: 800,
              }}>×</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 700, color: theme.text,
                }}>{p.name}</div>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 11.5, color: theme.muted,
                  marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </ILSection>

      {/* News */}
      <ILSection theme={theme} title="חדשות" action="לערוצי טלגרם">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
          {IL.NEWS.slice(0, 3).map((n, i) => (
            <div key={i} style={{
              background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12,
              padding: 12, display: 'flex', gap: 12,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                background: theme.brand, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Heebo, system-ui', fontSize: 22, fontWeight: 800,
              }}>V</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 12.5, fontWeight: 600, color: theme.text,
                  lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{n.title}</div>
                <div style={{
                  fontFamily: 'Heebo, system-ui', fontSize: 10.5, color: theme.faint, marginTop: 6,
                }}>{n.source} · {n.when}</div>
              </div>
            </div>
          ))}
        </div>
      </ILSection>
    </div>
  );
}

function PredBar({ label, pct, color, theme, bold }) {
  return (
    <div style={{ flex: pct, minWidth: 0 }}>
      <div style={{ height: 8, borderRadius: 4, background: color, opacity: bold ? 1 : 0.6 }}/>
      <div style={{
        marginTop: 5,
        fontFamily: 'Heebo, system-ui',
        fontSize: 11, fontWeight: 700, color: theme.text,
        textAlign: 'center',
      }}>{pct}% · {label}</div>
    </div>
  );
}

function ilZoneColor(pos, theme) {
  if (pos === 1) return theme.zoneChamp;
  if (pos <= 2) return theme.zoneCl;
  if (pos <= 4) return theme.zoneEl;
  if (pos <= 6) return theme.brand;
  if (pos >= 13) return theme.zoneRel;
  return null;
}

// ─── STANDINGS ─────────────────────────────────────────────────────────────
function ILStandings({ theme, layout = 'classic', onTeam, zone, onZone, density }) {
  const filterFor = (z) => (r) => {
    if (z === 'all') return true;
    if (z === 'upper') return r.pos <= 6;
    if (z === 'lower') return r.pos > 6;
    if (z === 'rel') return r.pos >= 13;
    return true;
  };

  const rows = IL.STANDINGS.filter(filterFor(zone));

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Zone chip row */}
      <div style={{ padding: '12px 0 8px' }}>
        <ILChipRow
          theme={theme}
          value={zone} onChange={onZone}
          items={[
            { id: 'all',   label: 'כל הטבלה' },
            { id: 'upper', label: 'פלייאוף עליון',  dot: theme.brand },
            { id: 'lower', label: 'פלייאוף תחתון', dot: theme.zoneEl },
            { id: 'rel',   label: 'תחתית',          dot: theme.zoneRel },
          ]}
        />
      </div>

      {/* Notice */}
      <div style={{
        margin: '4px 16px 12px',
        padding: '8px 12px',
        background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10,
        fontFamily: 'Heebo, system-ui', fontSize: 11.5, color: theme.muted,
      }}>
        מוצגת טבלה מחושבת מתוך 221 משחקי ליגה שהסתיימו.
      </div>

      {layout === 'classic' && <ILTableClassic rows={rows} theme={theme} onTeam={onTeam} density={density}/>}
      {layout === 'cards'   && <ILTableCards   rows={rows} theme={theme} onTeam={onTeam}/>}
      {layout === 'bars'    && <ILTableBars    rows={rows} theme={theme} onTeam={onTeam}/>}

      {/* Legend */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { c: theme.zoneChamp, label: 'אלוף' },
          { c: theme.zoneCl,    label: 'מוקדמות ליגת האלופות' },
          { c: theme.zoneEl,    label: 'מוקדמות ליגת אירופה' },
          { c: theme.brand,     label: 'פלייאוף עליון' },
          { c: theme.zoneRel,   label: 'פלייאוף ירידה' },
        ].map((it) => (
          <div key={it.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'Heebo, system-ui', fontSize: 11.5, color: theme.muted, fontWeight: 500,
          }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: it.c }}/>
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Classic table — mirrors the desktop columns at mobile width.
// Visible cols at 393px: # | קבוצה | מש' | הפרש | נק' | כושר (5 form pills)
function ILTableClassic({ rows, theme, onTeam, density }) {
  const d = { compact: 38, regular: 44, spacious: 52 }[density] || 44;
  return (
    <div style={{ background: theme.surface, marginInline: 0 }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '26px 1fr 26px 38px 36px 86px',
        gap: 6, padding: '8px 14px',
        color: theme.faint, fontFamily: 'Heebo, system-ui',
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2,
        borderBlock: `1px solid ${theme.border}`,
        background: theme.surface2,
      }}>
        <div style={{ textAlign: 'center' }}>#</div>
        <div>קבוצה</div>
        <div style={{ textAlign: 'center' }}>מש'</div>
        <div style={{ textAlign: 'center' }}>הפרש</div>
        <div style={{ textAlign: 'center', color: theme.text }}>נק'</div>
        <div style={{ textAlign: 'start' }}>כושר</div>
      </div>
      {rows.map((r, i) => {
        const z = ilZoneColor(r.pos, theme);
        return (
          <button key={r.abbr} onClick={() => onTeam(r.abbr)} style={ilBtn({
            display: 'grid', width: '100%',
            gridTemplateColumns: '26px 1fr 26px 38px 36px 86px',
            gap: 6, padding: '0 14px',
            height: d, alignItems: 'center',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.border}`,
            position: 'relative',
          })}>
            {z && <div style={{ position: 'absolute', insetBlock: 6, insetInlineEnd: 0, width: 3, background: z, borderRadius: 2 }}/>}
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 12, fontWeight: 700, color: theme.muted, textAlign: 'center',
            }}>{r.pos}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, overflow: 'hidden' }}>
              <ILCrest team={r} size={22}/>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 600, color: theme.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              }}>{r.name}</div>
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 12, color: theme.muted, textAlign: 'center',
            }}>{r.p}</div>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 12, fontWeight: 600, textAlign: 'center',
              color: r.gd >= 0 ? theme.win : theme.loss,
            }}>{r.gd >= 0 ? '+' : ''}{r.gd}</div>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 14, fontWeight: 800, textAlign: 'center', color: theme.text,
            }}>{r.pts}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <ILFormRow form={r.form} theme={theme} size={14} gap={2}/>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ILTableCards({ rows, theme, onTeam }) {
  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const z = ilZoneColor(r.pos, theme);
        return (
          <button key={r.abbr} onClick={() => onTeam(r.abbr)} style={ilBtn({
            display: 'flex', alignItems: 'center', gap: 12,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 14, padding: '12px 14px',
            position: 'relative', overflow: 'hidden',
            width: '100%', textAlign: 'right',
          })}>
            {z && <div style={{ position: 'absolute', insetBlock: 0, insetInlineEnd: 0, width: 4, background: z }}/>}
            <div style={{
              width: 28, textAlign: 'center',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 18, fontWeight: 800, color: theme.text, letterSpacing: -0.5,
            }}>{r.pos}</div>
            <ILCrest team={r} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 14.5, fontWeight: 700, color: theme.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.name}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 11, color: theme.muted, fontWeight: 500,
              }}>
                <span>{r.w}-{r.d}-{r.l}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: r.gd >= 0 ? theme.win : theme.loss }}>
                  {r.gd >= 0 ? '+' : ''}{r.gd}
                </span>
              </div>
            </div>
            <ILFormRow form={r.form} theme={theme} size={15} gap={3}/>
            <div style={{ textAlign: 'center', minWidth: 36 }}>
              <div style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 22, fontWeight: 800, color: theme.text, lineHeight: 1, letterSpacing: -0.8,
              }}>{r.pts}</div>
              <div style={{
                fontFamily: 'Heebo, system-ui', fontSize: 9.5, fontWeight: 700, color: theme.faint,
                letterSpacing: 0.4, marginTop: 2,
              }}>נק'</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ILTableBars({ rows, theme, onTeam }) {
  const maxPts = Math.max(...rows.map((r) => r.pts));
  return (
    <div style={{ background: theme.surface }}>
      {rows.map((r, i) => {
        const z = ilZoneColor(r.pos, theme);
        const pct = (r.pts / maxPts) * 100;
        return (
          <button key={r.abbr} onClick={() => onTeam(r.abbr)} style={ilBtn({
            display: 'block', padding: '10px 16px', width: '100%', textAlign: 'right',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.border}`,
          })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 22, textAlign: 'center',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 13, fontWeight: 700, color: z || theme.muted,
              }}>{r.pos}</div>
              <ILCrest team={r} size={22}/>
              <div style={{
                flex: 1, minWidth: 0,
                fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 600, color: theme.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.name}</div>
              <div style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 14, fontWeight: 800, color: theme.text,
              }}>{r.pts}<span style={{ fontSize: 9, color: theme.faint, marginInlineStart: 3 }}>נק'</span></div>
            </div>
            <div style={{
              height: 4, borderRadius: 2, background: theme.surface2,
              marginInlineStart: 30, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0,
                width: pct + '%',
                background: z || theme.brand, borderRadius: 2,
              }}/>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginInlineStart: 30,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 10.5, color: theme.muted, fontWeight: 500, whiteSpace: 'nowrap',
            }}>
              <span>{r.w}נ {r.d}ת {r.l}ה</span>
              <span style={{ color: r.gd >= 0 ? theme.win : theme.loss }}>
                {r.gd >= 0 ? '+' : ''}{r.gd}
              </span>
              <span style={{ marginInlineStart: 'auto', display: 'inline-flex' }}>
                <ILFormRow form={r.form} theme={theme} size={12} gap={2}/>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── MATCHES ───────────────────────────────────────────────────────────────
function ILMatches({ theme, onMatch, onTeam }) {
  const [filter, setFilter] = React.useState('all');
  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: '12px 0' }}>
        <ILChipRow
          theme={theme} value={filter} onChange={setFilter}
          items={[
            { id: 'all',  label: 'הכל' },
            { id: 'live', label: 'חי', dot: theme.brand },
            { id: 'soon', label: 'משחקים קרובים' },
            { id: 'ft',   label: 'תוצאות' },
          ]}
        />
      </div>
      {IL.FIXTURES.map((day) => {
        const matches = day.matches.filter((m) => {
          if (filter === 'all') return true;
          if (filter === 'live') return m.status === 'live';
          if (filter === 'soon') return m.status === 'upcoming';
          if (filter === 'ft') return m.status === 'ft';
          return true;
        });
        if (matches.length === 0) return null;
        return (
          <div key={day.day} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              padding: '0 16px 8px',
            }}>
              <div style={{
                fontFamily: 'Heebo, system-ui',
                fontSize: 15, fontWeight: 800, color: theme.text, letterSpacing: -0.3,
              }}>{day.day}</div>
              <div style={{
                fontFamily: 'Heebo, system-ui',
                fontSize: 11.5, color: theme.faint,
              }}>{day.date}</div>
            </div>
            <ILCard theme={theme} p={0}>
              {matches.map((m, i) => (
                <MatchRow key={i} m={m} theme={theme}
                  onClick={() => onMatch(m)}
                  onTeam={onTeam}
                  isLast={i === matches.length - 1}/>
              ))}
            </ILCard>
          </div>
        );
      })}
    </div>
  );
}

function MatchRow({ m, theme, onClick, onTeam, isLast }) {
  const home = IL.TEAMS[m.home];
  const away = IL.TEAMS[m.away];
  const isFinal = m.status === 'ft';
  const isLive = m.status === 'live';
  const winnerHome = isFinal && m.hs > m.as;
  const winnerAway = isFinal && m.as > m.hs;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${theme.border}`,
    }}>
      {/* status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ILStatusPill status={m.status} mins={m.mins} theme={theme}/>
        {m.comp && (
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 10, color: theme.faint, fontWeight: 500,
          }}>{m.comp}</div>
        )}
      </div>
      {/* main row */}
      <button onClick={onClick} style={ilBtn({
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: 10, width: '100%',
      })}>
        <TeamCell t={home} side="home" winner={winnerHome} dimmed={winnerAway} theme={theme} onTeam={onTeam}/>
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          {(isLive || isFinal) ? (
            <ILScore hs={m.hs} as={m.as} theme={theme}/>
          ) : (
            <div style={{
              fontFamily: 'Heebo, system-ui',
              fontSize: 15, fontWeight: 800, color: theme.text,
            }}>{m.time}</div>
          )}
        </div>
        <TeamCell t={away} side="away" winner={winnerAway} dimmed={winnerHome} theme={theme} onTeam={onTeam}/>
      </button>
    </div>
  );
}

function TeamCell({ t, side, winner, dimmed, theme, onTeam }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      justifyContent: side === 'home' ? 'flex-start' : 'flex-end',
      minWidth: 0,
    }}>
      {side === 'home' ? (
        <>
          <ILCrest team={t} size={26}/>
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 13.5, fontWeight: winner ? 800 : 600,
            color: dimmed ? theme.muted : theme.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: -0.2,
          }}>{t.name}</div>
        </>
      ) : (
        <>
          <div style={{
            fontFamily: 'Heebo, system-ui',
            fontSize: 13.5, fontWeight: winner ? 800 : 600,
            color: dimmed ? theme.muted : theme.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: -0.2, textAlign: 'end',
          }}>{t.name}</div>
          <ILCrest team={t} size={26}/>
        </>
      )}
    </div>
  );
}

// ─── PLAYERS ───────────────────────────────────────────────────────────────
function ILPlayers({ theme, onPlayer, onTeam }) {
  const [view, setView] = React.useState('scorers');
  const list = view === 'scorers' ? IL.SCORERS : IL.ASSISTERS;
  return (
    <div style={{ paddingBottom: 24 }}>
      <ILTabBar
        theme={theme} value={view} onChange={setView}
        items={[
          { id: 'scorers',   label: 'מלכי השערים' },
          { id: 'assisters', label: 'מלכי הבישולים' },
          { id: 'cards',     label: 'כרטיסים' },
        ]}
      />
      {/* Top 3 podium */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        padding: '14px 16px 0',
      }}>
        {list.slice(0, 3).map((p, i) => {
          const team = IL.TEAMS[p.team];
          const stat = view === 'scorers' ? p.goals : p.assists;
          return (
            <button key={p.name} onClick={() => onPlayer(p)} style={ilBtn({
              background: theme.surface, border: `1px solid ${theme.border}`,
              borderRadius: 14, padding: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              position: 'relative',
            })}>
              <div style={{
                position: 'absolute', insetInlineEnd: 8, top: 6,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 10, fontWeight: 800,
                color: i === 0 ? theme.zoneChamp : theme.muted,
              }}>#{i + 1}</div>
              <PlayerAvatar size={44} name={p.name} theme={theme}/>
              <div style={{
                fontFamily: 'Heebo, system-ui',
                fontSize: 12, fontWeight: 700, color: theme.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                width: '100%', textAlign: 'center', letterSpacing: -0.2,
              }}>{p.name}</div>
              <ILCrest team={team} size={14} radius={3}/>
              <div style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 20, fontWeight: 800, color: theme.brand, lineHeight: 1, letterSpacing: -0.5,
                marginTop: 2,
              }}>{stat}</div>
            </button>
          );
        })}
      </div>
      {/* Full list */}
      <ILSection theme={theme} title="טבלה מלאה">
        <ILCard theme={theme} p={0}>
          {list.map((p, i) => {
            const team = IL.TEAMS[p.team];
            const stat = view === 'scorers' ? p.goals : p.assists;
            const max = list[0].goals; // for bar
            const pct = ((view === 'scorers' ? p.goals : p.assists) / max) * 100;
            return (
              <button key={p.name} onClick={() => onPlayer(p)} style={ilBtn({
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '11px 14px',
                borderBottom: i === list.length - 1 ? 'none' : `1px solid ${theme.border}`,
                textAlign: 'right',
              })}>
                <div style={{
                  width: 18, textAlign: 'center',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: 11, fontWeight: 700, color: theme.muted,
                }}>{i + 1}</div>
                <PlayerAvatar size={32} name={p.name} theme={theme}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'Heebo, system-ui', fontSize: 13.5, fontWeight: 700, color: theme.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <ILCrest team={team} size={12} radius={2}/>
                    <div style={{
                      fontFamily: 'Heebo, system-ui', fontSize: 11, color: theme.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{team.name}</div>
                  </div>
                </div>
                <div style={{ minWidth: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <div style={{
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: 16, fontWeight: 800, color: theme.brand, lineHeight: 1,
                  }}>{stat}</div>
                  <div style={{
                    width: 70, height: 3, borderRadius: 2,
                    background: theme.surface2, overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0,
                      width: pct + '%', background: theme.brand,
                    }}/>
                  </div>
                </div>
              </button>
            );
          })}
        </ILCard>
      </ILSection>
    </div>
  );
}

function PlayerAvatar({ size, name, theme }) {
  const init = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `repeating-linear-gradient(135deg, ${theme.surface2}, ${theme.surface2} 4px, ${theme.bg} 4px, ${theme.bg} 8px)`,
      border: `1px solid ${theme.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Heebo, system-ui',
      fontSize: size * 0.32, fontWeight: 700, color: theme.faint,
    }}>{init}</div>
  );
}

// ─── LIVE ──────────────────────────────────────────────────────────────────
function ILLive({ theme, onMatch }) {
  const live = IL.FIXTURES.flatMap((d) => d.matches.filter((m) => m.status === 'live'));
  const soon = IL.FIXTURES.flatMap((d) => d.matches.filter((m) => m.status === 'upcoming')).slice(0, 4);
  return (
    <div style={{ paddingBottom: 24 }}>
      <ILSection theme={theme} title="כרגע משחקים" dense>
        {live.length === 0 ? (
          <ILCard theme={theme}>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 13, color: theme.muted, textAlign: 'center',
              padding: '14px 0',
            }}>נכון לעכשיו אין משחקים בלייב</div>
          </ILCard>
        ) : (
          <ILCard theme={theme} p={0}>
            {live.map((m, i) => (
              <MatchRow key={i} m={m} theme={theme} onClick={() => onMatch(m)}
                        isLast={i === live.length - 1}/>
            ))}
          </ILCard>
        )}
      </ILSection>
      <ILSection theme={theme} title="קרובים">
        <ILCard theme={theme} p={0}>
          {soon.map((m, i) => (
            <MatchRow key={i} m={m} theme={theme} onClick={() => onMatch(m)}
                      isLast={i === soon.length - 1}/>
          ))}
        </ILCard>
      </ILSection>
    </div>
  );
}

Object.assign(window, { ILHome, ILStandings, ILMatches, ILPlayers, ILLive, MatchRow, PlayerAvatar, ilZoneColor });
