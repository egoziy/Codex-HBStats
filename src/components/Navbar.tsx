'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type SearchResult = {
  id: string;
  type: 'team' | 'player' | 'game';
  label: string;
  href: string;
  subtitle?: string;
};

type Viewer = {
  id: string;
  name: string;
  role: 'ADMIN' | 'USER' | 'GUEST';
} | null;

const navLinks = [
  { href: '/', label: 'ראשי' },
  { href: '/standings', label: 'טבלאות' },
  { href: '/games', label: 'משחקים' },
  { href: '/players', label: 'שחקנים' },
  { href: '/statistics', label: 'סטטיסטיקות' },
  { href: '/compare', label: 'השוואת עונות' },
  { href: '/admin', label: 'אדמין' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [viewer, setViewer] = useState<Viewer>(null);

  useEffect(() => {
    fetch('/api/auth')
      .then((response) => response.json())
      .then((payload) => setViewer(payload.user || null))
      .catch(() => setViewer(null));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoadingResults(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const payload = await response.json();
        setResults(payload.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoadingResults(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [query]);

  const visibleLinks = useMemo(() => {
    if (viewer?.role === 'ADMIN') {
      return navLinks;
    }

    return navLinks.filter((link) => link.href !== '/admin');
  }, [viewer]);

  async function handleLogout() {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setViewer(null);
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-stone-900/50 bg-[linear-gradient(120deg,#7f1d1d,#111827)] text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Data Ball Israel</div>
            <div className="truncate text-xl font-black md:text-2xl">הדופק של טרנר, במספרים.</div>
          </Link>

          <button
            type="button"
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xl md:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="פתח תפריט"
          >
            ☰
          </button>

          <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
            <GlobalSearch
              query={query}
              setQuery={setQuery}
              results={results}
              loading={loadingResults}
              clearResults={() => setResults([])}
            />
            <nav className="flex items-center gap-2">
              {visibleLinks.map((link) => (
                <NavLink key={link.href} href={link.href} pathname={pathname}>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <AuthArea viewer={viewer} onLogout={handleLogout} />
          </div>
        </div>

        {menuOpen ? (
          <div className="mt-4 space-y-4 rounded-3xl border border-white/10 bg-black/10 p-4 md:hidden">
            <GlobalSearch
              query={query}
              setQuery={setQuery}
              results={results}
              loading={loadingResults}
              clearResults={() => setResults([])}
            />
            <nav className="grid gap-2">
              {visibleLinks.map((link) => (
                <NavLink key={link.href} href={link.href} pathname={pathname} block>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <AuthArea viewer={viewer} onLogout={handleLogout} mobile />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function NavLink({
  href,
  pathname,
  children,
  block = false,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
  block?: boolean;
}) {
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-amber-300 text-stone-900' : 'border border-white/20 bg-white/10 hover:bg-white/20'
      } ${block ? 'text-center' : ''}`}
    >
      {children}
    </Link>
  );
}

function AuthArea({
  viewer,
  onLogout,
  mobile = false,
}: {
  viewer: Viewer;
  onLogout: () => void;
  mobile?: boolean;
}) {
  if (!viewer) {
    return (
      <div className={`flex ${mobile ? 'flex-col' : 'items-center'} gap-2`}>
        <Link href="/login" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-900">
          התחברות
        </Link>
        <Link href="/register" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold">
          הרשמה
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex ${mobile ? 'flex-col' : 'items-center'} gap-2`}>
      <Link href="/account" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold">
        {viewer.name}
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-900"
      >
        התנתקות
      </button>
    </div>
  );
}

function GlobalSearch({
  query,
  setQuery,
  results,
  loading,
  clearResults,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: SearchResult[];
  loading: boolean;
  clearResults: () => void;
}) {
  return (
    <div className="relative w-full max-w-md">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="חיפוש קבוצה, שחקן או משחק..."
        className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/70 outline-none transition focus:bg-white/15"
      />

      {(loading || results.length > 0) && query.trim() ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-2xl border border-stone-200 bg-white p-2 text-stone-900 shadow-2xl">
          {loading ? (
            <div className="px-3 py-2 text-sm text-stone-500">מחפש...</div>
          ) : (
            results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.href}
                onClick={clearResults}
                className="block rounded-xl px-3 py-2 transition hover:bg-stone-100"
              >
                <div className="font-semibold">
                  <span className="ml-2">{iconForType(result.type)}</span>
                  {result.label}
                </div>
                {result.subtitle ? <div className="text-xs text-stone-500">{result.subtitle}</div> : null}
              </Link>
            ))
          )}
          {!loading && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-stone-500">לא נמצאו תוצאות.</div>
          ) : null}
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
