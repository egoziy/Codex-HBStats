// HBS Stats v2 — main app (Hebrew RTL, Israeli Premier League)

const TWEAK_DEFAULTS_IL = /*EDITMODE-BEGIN*/{
  "dark": false,
  "layout": "classic",
  "density": "regular",
  "showTicker": true,
  "brand": "#C8102E"
}/*EDITMODE-END*/;

function ILApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS_IL);
  const theme = React.useMemo(() => {
    const base = ilTheme(t.dark);
    return { ...base, brand: t.brand, brandSoft: t.brand + (t.dark ? '22' : '14') };
  }, [t.dark, t.brand]);

  const [tab, setTab] = React.useState('table'); // start on Standings since that's the user's main page
  const [zone, setZone] = React.useState('all');

  // navigation stack: drills through team / match / player
  const [stack, setStack] = React.useState([]); // [{kind, payload}]
  const top = stack[stack.length - 1] || null;
  const push = (kind, payload) => setStack([...stack, { kind, payload }]);
  const pop = () => setStack(stack.slice(0, -1));
  const reset = () => setStack([]);

  const onTeam   = (abbr)   => push('team',   abbr);
  const onMatch  = (m)      => push('match',  m);
  // Player list rows only carry summary fields. Layer them on top of the
  // detailed-stat defaults so the detail screen has every field it expects.
  const onPlayer = (p)      => {
    const team = IL.TEAMS[p.team] || {};
    const merged = {
      ...IL.PLAYER_DETAIL, ...p,
      shirt: p.shirt ?? IL.PLAYER_DETAIL.shirt,
      pos:   p.pos   ?? IL.PLAYER_DETAIL.pos,
      nat:   p.nat   ?? '—',
      age:   p.age   ?? IL.PLAYER_DETAIL.age,
      starts: p.starts ?? Math.max(0, (p.apps || 0) - 4),
      mins:  p.mins  ?? IL.PLAYER_DETAIL.mins,
    };
    push('player', merged);
  };

  let screen;
  let title = null, sub = null;
  let hasBack = stack.length > 0;
  let onBack = pop;

  if (top?.kind === 'team') {
    screen = <ILTeamDetail theme={theme} abbr={top.payload} onBack={onBack} onMatch={onMatch}/>;
  } else if (top?.kind === 'match') {
    screen = <ILMatchDetail theme={theme} match={top.payload} onBack={onBack} onTeam={onTeam} onPlayer={onPlayer}/>;
  } else if (top?.kind === 'player') {
    screen = <ILPlayerDetail theme={theme} player={top.payload} onBack={onBack} onTeam={onTeam}/>;
  } else if (tab === 'home') {
    title = 'בית'; sub = 'ליגת העל · 2025/26';
    screen = <ILHome theme={theme} onTeam={onTeam} onMatch={onMatch} onPlayer={onPlayer}/>;
  } else if (tab === 'table') {
    title = 'טבלת הליגה'; sub = 'ליגת העל · 14 קבוצות · 221 משחקים';
    screen = <ILStandings theme={theme} layout={t.layout} density={t.density}
                          onTeam={onTeam} zone={zone} onZone={setZone}/>;
  } else if (tab === 'matches') {
    title = 'משחקים'; sub = 'ליגת העל · מחזור 35';
    screen = <ILMatches theme={theme} onMatch={onMatch} onTeam={onTeam}/>;
  } else if (tab === 'players') {
    title = 'שחקנים'; sub = 'מרכז השחקנים · 2025/26';
    screen = <ILPlayers theme={theme} onPlayer={onPlayer} onTeam={onTeam}/>;
  } else if (tab === 'live') {
    title = 'חי'; sub = 'משחקי חי וקרובים';
    screen = <ILLive theme={theme} onMatch={onMatch}/>;
  }

  // Detail screens own their own header padding; show ticker+red bar only on tabs.
  const showHeader = !top;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text, direction: 'rtl',
      fontFamily: 'Heebo, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {showHeader && <ILHeader theme={theme} title={title} sub={sub} ticker={t.showTicker}/>}
      {!showHeader && (
        <div style={{
          flexShrink: 0,
          paddingTop: 48,
          background: theme.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '50px 14px 10px',
          color: '#fff',
        }}>
          <button onClick={onBack} style={ilBtn({ color: '#fff', display: 'flex', padding: 6, margin: -6 })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6"/>
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontFamily: 'Heebo, system-ui', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, opacity: 0.9,
            }}>ליגת העל</div>
            <div style={{
              background: '#fff', color: theme.brand,
              width: 36, height: 22, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Heebo, system-ui',
              fontSize: 12, fontWeight: 900, letterSpacing: -0.3,
            }}>HBS</div>
          </div>
          <button onClick={reset} style={ilBtn({ color: '#fff', display: 'flex', padding: 6, margin: -6 })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12l9-9 9 9M5 10v10h14V10"/>
            </svg>
          </button>
        </div>
      )}

      <div key={(top?.kind || tab)} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {screen}
      </div>

      <ILBottomNav theme={theme} active={top ? null : tab} onNav={(id) => { reset(); setTab(id); }}/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="מראה / Appearance"/>
        <TweakToggle label="Dark mode" value={t.dark}
                     onChange={(v) => setTweak('dark', v)}/>
        <TweakColor label="Brand" value={t.brand}
                    options={['#C8102E', '#1D4ED8', '#15803D', '#7C3AED']}
                    onChange={(v) => setTweak('brand', v)}/>
        <TweakToggle label="Live ticker stripe" value={t.showTicker}
                     onChange={(v) => setTweak('showTicker', v)}/>

        <TweakSection label="טבלה / Standings"/>
        <TweakRadio label="Layout" value={t.layout}
                    options={[
                      { value: 'classic', label: 'Table' },
                      { value: 'cards',   label: 'Cards' },
                      { value: 'bars',    label: 'Bars' },
                    ]}
                    onChange={(v) => setTweak('layout', v)}/>
        <TweakRadio label="Density" value={t.density}
                    options={[
                      { value: 'compact',  label: 'Compact' },
                      { value: 'regular',  label: 'Regular' },
                      { value: 'spacious', label: 'Spacious' },
                    ]}
                    onChange={(v) => setTweak('density', v)}/>
      </TweaksPanel>
    </div>
  );
}

// ── Mount inside iOS frame, centered + responsive ──────────────────────────
function ILPage() {
  const [scale, setScale] = React.useState(1);
  const W = 393, H = 852;
  React.useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth / (W + 80);
      const sy = window.innerHeight / (H + 80);
      setScale(Math.min(1, sx, sy));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #2A2825 0%, #15130F 60%, #0A0907 100%)',
      overflow: 'hidden',
    }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
        <IOSDevice width={W} height={H} dark={false}>
          <ILApp/>
        </IOSDevice>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ILPage/>);
