'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';

type SearchResult = {
  id: string;
  type: 'team' | 'player' | 'game' | 'venue';
  label: string;
  href: string;
  subtitle?: string;
};

type Viewer = {
  id: string;
  name: string;
  role: 'ADMIN' | 'USER' | 'GUEST';
} | null;

type NavItem = {
  href: string;
  label: string;
  iconSrc?: string;
};

type TickerItem =
  | { kind: 'live'; home: string; away: string; score: string }
  | { kind: 'ft';   home: string; away: string; score: string }
  | { kind: 'ns';   home: string; away: string; time: string };

const navLinks: NavItem[] = [
  { href: '/',            label: 'בית',           iconSrc: '/Icons/home-nav-96.png' },
  { href: '/games',       label: 'משחקים',         iconSrc: '/Icons/games-nav-96.png' },
  { href: '/standings',   label: 'טבלה',           iconSrc: '/Icons/standings-nav-96.png' },
  { href: '/players',     label: 'שחקנים',         iconSrc: '/Icons/players-nav-96.png' },
  { href: '/statistics',  label: 'כובשים',         iconSrc: '/Icons/stats-nav-96.png' },
  { href: '/predictions', label: 'תחזיות',         iconSrc: '/Icons/predictions-nav-96.svg' },
  { href: '/compare',     label: 'השוואה',         iconSrc: '/Icons/compare-nav-96.png' },
  { href: '/venues',      label: 'אצטדיונים',      iconSrc: '/Icons/venues-nav-96.png' },
  { href: '/live',        label: 'חי',             iconSrc: '/Icons/games-nav-96.png' },
  { href: '/admin',       label: 'אדמין',          iconSrc: '/Icons/admin-nav-96.png' },
];

// ── Live Ticker ──────────────────────────────────────────────────────────────
function LiveTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    fetch('/api/ticker')
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const doubled = [...items, ...items]; // seamless loop

  return (
    <div className="ticker-bar overflow-hidden bg-stone-950 py-1.5 text-[11px] font-semibold text-white/80">
      <div className="ticker-track flex gap-8 whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 shrink-0">
            {item.kind === 'live' && (
              <>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                <span className="text-white/50">חי</span>
                <span className="text-white">{item.home}</span>
                <span className="text-red-400 font-black">{item.score}</span>
                <span className="text-white">{item.away}</span>
              </>
            )}
            {item.kind === 'ft' && (
              <>
                <span className="text-white/40">סיום:</span>
                <span className="text-white">{item.home}</span>
                <span className="text-stone-400 font-black">{item.score}</span>
                <span className="text-white">{item.away}</span>
              </>
            )}
            {item.kind === 'ns' && (
              <>
                <span className="text-white/40">בקרוב:</span>
                <span className="text-white">{item.home}</span>
                <span className="text-white/50">מול</span>
                <span className="text-white">{item.away}</span>
                <span className="text-stone-400">{item.time}</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── User avatar (initials) ────────────────────────────────────────────────────
function UserAvatar({ name, onClick }: { name: string; onClick: () => void }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-black text-white shadow-sm ring-2 ring-[var(--accent-glow)] transition hover:opacity-90"
    >
      {initials}
    </button>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────────
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isModern = theme === 'modern';

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((p) => setViewer(p.user || null))
      .catch(() => setViewer(null));
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setLoadingResults(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const p = await r.json();
        setResults(p.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoadingResults(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Close user menu on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const visibleLinks = useMemo(() => {
    return viewer?.role === 'ADMIN' ? navLinks : navLinks.filter((l) => l.href !== '/admin');
  }, [viewer]);

  async function handleLogout() {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setViewer(null);
    setShowUserMenu(false);
    router.push('/');
    router.refresh();
  }

  // ── Classic theme (unchanged) ───────────────────────────────────────────
  if (!isModern) {
    const headerClass =
      'navbar-root sticky top-0 z-50 border-b border-stone-900/50 bg-[linear-gradient(120deg,var(--navbar-gradient-from),var(--navbar-gradient-to))] text-white shadow-lg';
    return (
      <header className={headerClass}>
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
                Data Ball Israel
              </div>
              <div className="truncate text-xl font-black text-white md:text-2xl">
                הדופק של טרנר, במספרים.
              </div>
            </Link>
            <button
              type="button"
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xl text-white md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="פתח תפריט"
            >
              ☰
            </button>
            <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
              <GlobalSearch query={query} setQuery={setQuery} results={results} loading={loadingResults} clearResults={() => setResults([])} isModern={false} />
              <nav className="flex items-center gap-2">
                {visibleLinks.map((link) => (
                  <ClassicNavLink key={link.href} href={link.href} pathname={pathname} iconSrc={link.iconSrc}>
                    {link.label}
                  </ClassicNavLink>
                ))}
              </nav>
              <ClassicAuthArea viewer={viewer} onLogout={handleLogout} />
            </div>
          </div>
          {menuOpen && (
            <div className="navbar-mobile-panel mt-4 space-y-4 rounded-3xl border border-white/10 bg-black/10 p-4 md:hidden">
              <GlobalSearch query={query} setQuery={setQuery} results={results} loading={loadingResults} clearResults={() => setResults([])} isModern={false} />
              <nav className="grid gap-2">
                {visibleLinks.map((link) => (
                  <ClassicNavLink key={link.href} href={link.href} pathname={pathname} iconSrc={link.iconSrc} block>
                    {link.label}
                  </ClassicNavLink>
                ))}
              </nav>
              <ClassicAuthArea viewer={viewer} onLogout={handleLogout} mobile />
            </div>
          )}
        </div>
      </header>
    );
  }

  // ── Modern theme ────────────────────────────────────────────────────────
  return (
    <>
      <LiveTicker />
      <header className="navbar-root sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">

            {/* Brand — right side (RTL) */}
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[11px] font-black text-white shadow-sm">
                HBS
              </div>
              <div className="hidden sm:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
                  HBSStats
                </div>
                <div className="text-[10px] font-medium text-stone-400 leading-none">
                  ליגת העל
                </div>
              </div>
            </Link>

            {/* Nav links — center (desktop) */}
            <nav className="hidden flex-1 items-center justify-center gap-1 md:flex overflow-x-auto scrollbar-none">
              {visibleLinks.map((link) => {
                const active = link.href === '/'
                  ? pathname === '/'
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-all ${
                      active
                        ? 'navbar-link-active bg-[var(--accent)] text-white'
                        : 'navbar-link-inactive text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right area: Search + user (desktop) */}
            <div className="flex shrink-0 items-center gap-2">
              <GlobalSearch
                query={query}
                setQuery={setQuery}
                results={results}
                loading={loadingResults}
                clearResults={() => setResults([])}
                isModern
              />

              {/* Mobile hamburger */}
              <button
                type="button"
                className="navbar-mobile-toggle rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-stone-900 md:hidden"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="פתח תפריט"
              >
                ☰
              </button>

              {/* Auth / avatar */}
              {viewer ? (
                <div className="relative hidden md:block" ref={userMenuRef}>
                  <UserAvatar name={viewer.name} onClick={() => setShowUserMenu((v) => !v)} />
                  {showUserMenu && (
                    <div className="absolute left-0 top-[calc(100%+8px)] min-w-[140px] rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl z-50 text-right">
                      <Link
                        href="/account"
                        onClick={() => setShowUserMenu(false)}
                        className="block rounded-xl px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100"
                      >
                        {viewer.name}
                      </Link>
                      <Link
                        href="/account"
                        onClick={() => setShowUserMenu(false)}
                        className="block rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
                      >
                        הגדרות
                      </Link>
                      <div className="my-1 border-t border-stone-100" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full rounded-xl px-3 py-2 text-right text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        התנתקות
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden items-center gap-2 md:flex">
                  <Link
                    href="/login"
                    className="navbar-auth-primary rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
                  >
                    כניסה
                  </Link>
                  <Link
                    href="/register"
                    className="navbar-auth-secondary rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700"
                  >
                    הרשמה
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="navbar-mobile-panel border-t border-stone-100 pb-4 pt-3 md:hidden">
              <GlobalSearch
                query={query}
                setQuery={setQuery}
                results={results}
                loading={loadingResults}
                clearResults={() => setResults([])}
                isModern
              />
              <nav className="mt-3 flex flex-wrap gap-2">
                {visibleLinks.map((link) => {
                  const active = link.href === '/'
                    ? pathname === '/'
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? 'navbar-link-active bg-[var(--accent)] text-white'
                          : 'navbar-link-inactive border border-stone-200 text-stone-700'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-4 flex gap-2">
                {viewer ? (
                  <>
                    <Link href="/account" className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700">
                      {viewer.name}
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
                    >
                      התנתקות
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white">כניסה</Link>
                    <Link href="/register" className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700">הרשמה</Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

// ── Classic theme sub-components ──────────────────────────────────────────────
function ClassicNavLink({
  href, pathname, children, iconSrc, block = false,
}: {
  href: string; pathname: string; children: React.ReactNode; iconSrc?: string; block?: boolean;
}) {
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const activeClass = 'navbar-link-active bg-amber-300 text-stone-900';
  const inactiveClass = 'navbar-link-inactive border border-white/20 bg-white/10 text-white hover:bg-white/20';
  return (
    <Link
      href={href}
      title={typeof children === 'string' ? children : undefined}
      className={`text-sm font-bold transition ${
        iconSrc && !block
          ? `flex h-14 w-14 items-center justify-center rounded-full ${active ? activeClass : inactiveClass}`
          : `rounded-full px-4 py-2 ${active ? activeClass : inactiveClass} ${block ? 'text-center' : ''}`
      }`}
    >
      {iconSrc && !block ? (
        <span className="flex items-center justify-center">
          <img src={iconSrc} alt="" aria-hidden="true" className="h-12 w-12 rounded-full bg-white object-cover shadow-sm" />
          <span className="sr-only">{children}</span>
        </span>
      ) : (
        <span className={`flex items-center gap-2 ${block ? 'justify-center' : ''}`}>
          {iconSrc && block ? <img src={iconSrc} alt="" aria-hidden="true" className="h-5 w-5 rounded object-cover" /> : null}
          <span>{children}</span>
        </span>
      )}
    </Link>
  );
}

function ClassicAuthArea({ viewer, onLogout, mobile = false }: { viewer: Viewer; onLogout: () => void; mobile?: boolean }) {
  if (!viewer) {
    return (
      <div className={`flex ${mobile ? 'flex-col' : 'items-center'} gap-2`}>
        <Link href="/login" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-900">התחברות</Link>
        <Link href="/register" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white">הרשמה</Link>
      </div>
    );
  }
  return (
    <div className={`flex ${mobile ? 'flex-col' : 'items-center'} gap-2`}>
      <Link href="/account" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white">{viewer.name}</Link>
      <button type="button" onClick={onLogout} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-900">התנתקות</button>
    </div>
  );
}

// ── Global search (shared) ────────────────────────────────────────────────────
function GlobalSearch({
  query, setQuery, results, loading, clearResults, isModern,
}: {
  query: string; setQuery: (v: string) => void; results: SearchResult[];
  loading: boolean; clearResults: () => void; isModern: boolean;
}) {
  return (
    <div className="navbar-search relative w-full max-w-xs">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש קבוצה, שחקן או מש..."
        className={`w-full rounded-2xl border px-4 py-2 text-sm outline-none transition ${
          isModern
            ? 'border-stone-200 bg-stone-100 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:bg-white'
            : 'border-white/20 bg-white/10 text-white placeholder:text-white/70 focus:bg-white/15'
        }`}
      />
      {(loading || results.length > 0) && query.trim() ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-2xl border border-stone-200 bg-white p-2 text-stone-900 shadow-2xl z-50">
          {loading ? (
            <div className="px-3 py-2 text-sm text-stone-500">מחפש...</div>
          ) : (
            results.map((r) => (
              <Link
                key={`${r.type}-${r.id}`}
                href={r.href}
                onClick={clearResults}
                className="block rounded-xl px-3 py-2 transition hover:bg-stone-100"
              >
                <div className="font-semibold">
                  <span className="ml-2">{iconForType(r.type)}</span>
                  {r.label}
                </div>
                {r.subtitle ? <div className="text-xs text-stone-500">{r.subtitle}</div> : null}
              </Link>
            ))
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-stone-500">לא נמצאו תוצאות.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function iconForType(type: SearchResult['type']) {
  if (type === 'player') return '👤';
  if (type === 'team') return '🏆';
  return '⚽';
}
