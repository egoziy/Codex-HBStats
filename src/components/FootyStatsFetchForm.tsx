'use client';

import { useState, useCallback } from 'react';
import { FOOTYSTATS_SEASON_IDS, FOOTYSTATS_LEAGUE_LABELS, type FootyStatsLeague, type FSLeagueEntry } from '@/lib/footystats';

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStep = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  syncedCount?: number;
  fetchedCount?: number;
  note?: string;
};

type SyncResult = {
  success?: boolean;
  error?: string;
  jobId?: string;
  steps?: JobStep[];
  teamsSynced?: number;
  fixturesSynced?: number;
  eventsSynced?: number;
  playersSynced?: number;
  standingsSynced?: number;
  oddsSynced?: number;
  refereesSynced?: number;
};

type BulkItem = { leagueKey: string; year: number; seasonId: number };
type BulkResult = BulkItem & { ok: boolean; fixturesSynced?: number; error?: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const RESOURCE_OPTIONS = [
  { key: 'teams', label: 'קבוצות' },
  { key: 'fixtures', label: 'משחקים' },
  { key: 'matchEvents', label: 'אירועים + סטטיסטיקה (2025+ בלבד)' },
  { key: 'players', label: 'שחקנים + סטטיסטיקות' },
  { key: 'standings', label: 'טבלת ליגה' },
  { key: 'odds', label: 'יחסים' },
  { key: 'referees', label: 'שופטים' },
];

// Build catalog from hardcoded season IDs + any newly discovered leagues
type CatalogEntry = {
  key: string;
  nameHe: string;
  nameEn: string;
  category: 'league' | 'cup';
  seasons: { year: number; seasonId: number }[];
};

function buildCatalog(discovered: FSLeagueEntry[]): CatalogEntry[] {
  const catalog: CatalogEntry[] = [];
  const knownSeasonIds = new Set<number>();

  // All hardcoded leagues
  for (const [key, seasonMap] of Object.entries(FOOTYSTATS_SEASON_IDS)) {
    const label = FOOTYSTATS_LEAGUE_LABELS[key as FootyStatsLeague];
    const seasons = Object.entries(seasonMap)
      .map(([y, id]) => ({ year: Number(y), seasonId: id }))
      .sort((a, b) => b.year - a.year);
    seasons.forEach((s) => knownSeasonIds.add(s.seasonId));
    catalog.push({
      key,
      nameHe: label?.nameHe ?? key,
      nameEn: label?.nameEn ?? key,
      category: label?.category ?? 'cup',
      seasons,
    });
  }

  // Append any discovered leagues not already in the catalog
  for (const fs of discovered) {
    const newSeasons: { year: number; seasonId: number }[] = [];
    for (const s of fs.season) {
      if (knownSeasonIds.has(s.id)) continue;
      const startYear = s.year > 9999 ? Math.floor(s.year / 10000) : s.year;
      newSeasons.push({ year: startYear, seasonId: s.id });
      knownSeasonIds.add(s.id);
    }
    if (!newSeasons.length) continue;
    const name = fs.name.replace(/^Israel\s+/i, '').trim();
    catalog.push({
      key: `fs_${name.toLowerCase().replace(/\s+/g, '_')}`,
      nameHe: name,
      nameEn: name,
      category: 'cup',
      seasons: newSeasons.sort((a, b) => b.year - a.year),
    });
  }

  return catalog;
}

// ── Single Sync Tab ───────────────────────────────────────────────────────────

function SingleSyncTab({ catalog }: { catalog: CatalogEntry[] }) {
  const [leagueKey, setLeagueKey] = useState<string>(catalog[0]?.key ?? 'ipl');
  const [seasonYear, setSeasonYear] = useState<number>(() => {
    const entry = catalog.find((c) => c.key === (catalog[0]?.key ?? 'ipl'));
    return entry?.seasons[0]?.year ?? 2025;
  });
  const [selectedResources, setSelectedResources] = useState<string[]>(['teams', 'fixtures', 'players', 'standings']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const selectedLeague = catalog.find((c) => c.key === leagueKey) ?? catalog[0];
  const availableYears = selectedLeague?.seasons ?? [];
  const currentSeason = availableYears.find((s) => s.year === seasonYear);
  const footyStatsId = currentSeason?.seasonId;

  function selectLeague(key: string) {
    setLeagueKey(key);
    const entry = catalog.find((c) => c.key === key);
    if (entry?.seasons.length) setSeasonYear(entry.seasons[0].year);
    setResult(null);
  }

  function toggleResource(key: string) {
    setSelectedResources((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/fetch-footystats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueKey, seasonYear, resources: selectedResources, footyStatsSeasonId: footyStatsId }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'שגיאה לא ידועה' });
    } finally {
      setLoading(false);
    }
  }

  const seasonLabel = `${seasonYear}/${String(seasonYear + 1).slice(-2)}`;
  const leagues = catalog.filter((c) => c.category === 'league');
  const cups = catalog.filter((c) => c.category === 'cup');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* League selector — grouped */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">ליגות</p>
        <div className="flex flex-wrap gap-2">
          {leagues.map((l) => (
            <button key={l.key} type="button" onClick={() => selectLeague(l.key)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                leagueKey === l.key
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
              }`}>
              {l.nameHe}
            </button>
          ))}
        </div>
        {cups.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">גביעים</p>
            <div className="flex flex-wrap gap-2">
              {cups.map((l) => (
                <button key={l.key} type="button" onClick={() => selectLeague(l.key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    leagueKey === l.key
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                  }`}>
                  {l.nameHe}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Season selector */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">עונה</label>
        <select value={seasonYear} onChange={(e) => setSeasonYear(Number(e.target.value))}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
          {availableYears.map(({ year, seasonId }) => (
            <option key={year} value={year}>
              {year}/{String(year + 1).slice(-2)} (ID: {seasonId})
            </option>
          ))}
        </select>
      </div>

      {/* Resource presets */}
      <div>
        <div className="mb-2 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">נתונים לסנכרון</label>
          <button type="button" onClick={() => setSelectedResources(['teams', 'fixtures'])}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
            לכידת IDs בלבד
          </button>
          <button type="button" onClick={() => setSelectedResources(RESOURCE_OPTIONS.map((r) => r.key))}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
            הכל
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RESOURCE_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-600">
              <input type="checkbox" checked={selectedResources.includes(key)} onChange={() => toggleResource(key)} className="rounded" />
              <span className="text-gray-700 dark:text-gray-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {footyStatsId && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          FootyStats Season ID: <span className="font-mono font-medium">{footyStatsId}</span>
        </p>
      )}

      <button type="submit" disabled={loading || !selectedResources.length || !footyStatsId}
        className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? 'מסנכרן...' : `סנכרן — ${selectedLeague?.nameHe} ${seasonLabel}`}
      </button>

      {loading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-700 dark:text-blue-300">⏳ מסנכרן... (עשוי לקחת מספר דקות)</p>
        </div>
      )}

      {result && !loading && (
        <SyncResultPanel result={result} />
      )}
    </form>
  );
}

// ── Bulk ID Capture Tab ───────────────────────────────────────────────────────

function BulkCaptureTab({ catalog }: { catalog: CatalogEntry[] }) {
  const [resourceMode, setResourceMode] = useState<'idOnly' | 'full'>('idOnly');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<BulkItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [results, setResults] = useState<BulkResult[]>([]);

  const allItems: BulkItem[] = catalog.flatMap((l) =>
    l.seasons.map((s) => ({ leagueKey: l.key, year: s.year, seasonId: s.seasonId }))
  );

  function itemKey(item: BulkItem) { return `${item.leagueKey}:${item.year}`; }

  function toggleItem(item: BulkItem) {
    const k = itemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function toggleLeague(leagueKey: string) {
    const leagueItems = allItems.filter((i) => i.leagueKey === leagueKey);
    const allSelected = leagueItems.every((i) => selected.has(itemKey(i)));
    setSelected((prev) => {
      const next = new Set(prev);
      leagueItems.forEach((i) => allSelected ? next.delete(itemKey(i)) : next.add(itemKey(i)));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allItems.map(itemKey)));
  }

  function clearAll() { setSelected(new Set()); }

  async function runBulk() {
    const items = allItems.filter((i) => selected.has(itemKey(i)));
    if (!items.length) return;

    setRunning(true);
    setQueue(items);
    setCurrentIdx(0);
    setResults([]);

    for (let i = 0; i < items.length; i++) {
      setCurrentIdx(i);
      const item = items[i];
      try {
        const res = await fetch('/api/admin/fetch-footystats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leagueKey: item.leagueKey,
            seasonYear: item.year,
            footyStatsSeasonId: item.seasonId,
            resources: resourceMode === 'full'
              ? ['teams', 'fixtures', 'matchEvents', 'players', 'standings', 'odds', 'referees']
              : ['teams', 'fixtures'],
          }),
        });
        const data = await res.json();
        setResults((prev) => [
          ...prev,
          { ...item, ok: !data.error, fixturesSynced: data.fixturesSynced, error: data.error },
        ]);
      } catch (err) {
        setResults((prev) => [
          ...prev,
          { ...item, ok: false, error: err instanceof Error ? err.message : 'שגיאה' },
        ]);
      }
    }

    setRunning(false);
    setCurrentIdx(-1);
  }

  const selectedCount = selected.size;
  const doneCount = results.length;
  const leagues = catalog.filter((c) => c.category === 'league');
  const cups = catalog.filter((c) => c.category === 'cup');

  return (
    <div className="space-y-4">
      {/* Resource mode toggle */}
      <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">מצב סנכרון:</span>
        <button type="button" onClick={() => setResourceMode('idOnly')}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            resourceMode === 'idOnly'
              ? 'bg-amber-500 text-white'
              : 'border border-gray-300 bg-white text-gray-600 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}>
          לכידת IDs בלבד (קבוצות + משחקים)
        </button>
        <button type="button" onClick={() => setResourceMode('full')}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            resourceMode === 'full'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 bg-white text-gray-600 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}>
          סנכרון מלא (הכל כולל xG + שחקנים)
        </button>
        <span className="text-xs text-gray-400">
          {resourceMode === 'idOnly' ? '~15 שניות לעונה' : '~2-5 דקות לעונה'}
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={selectAll} disabled={running}
          className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300">
          בחר הכל ({allItems.length})
        </button>
        <button onClick={clearAll} disabled={running}
          className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300">
          נקה בחירה
        </button>
        <span className="text-xs text-gray-500">{selectedCount} עונות נבחרו</span>
        <button onClick={runBulk} disabled={running || selectedCount === 0}
          className="mr-auto rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
          {running ? `מסנכרן ${doneCount}/${queue.length}...` : `הפעל לכידת IDs (${selectedCount} עונות)`}
        </button>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${queue.length ? (doneCount / queue.length) * 100 : 0}%` }} />
          </div>
          {currentIdx >= 0 && queue[currentIdx] && (
            <p className="text-xs text-gray-500">
              מסנכרן: {catalog.find((c) => c.key === queue[currentIdx].leagueKey)?.nameHe}{' '}
              {queue[currentIdx].year}/{String(queue[currentIdx].year + 1).slice(-2)}
            </p>
          )}
        </div>
      )}

      {/* League/season checklist */}
      <div className="space-y-4">
        {[{ label: 'ליגות', entries: leagues }, { label: 'גביעים', entries: cups }].map(({ label, entries }) =>
          entries.length === 0 ? null : (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
              <div className="space-y-2">
                {entries.map((league) => {
                  const leagueItems = allItems.filter((i) => i.leagueKey === league.key);
                  const leagueAllSelected = leagueItems.every((i) => selected.has(itemKey(i)));
                  return (
                    <div key={league.key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <div className="mb-2 flex items-center gap-2">
                        <input type="checkbox" checked={leagueAllSelected} onChange={() => toggleLeague(league.key)}
                          disabled={running} className="rounded" />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{league.nameHe}</span>
                        <span className="text-xs text-gray-400">({league.seasons.length} עונות)</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {league.seasons.map((s) => {
                          const k = `${league.key}:${s.year}`;
                          const done = results.find((r) => itemKey(r) === k);
                          return (
                            <button key={s.year} type="button" disabled={running}
                              onClick={() => toggleItem({ leagueKey: league.key, year: s.year, seasonId: s.seasonId })}
                              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                                done
                                  ? done.ok
                                    ? 'border border-green-300 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : 'border border-red-300 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                  : selected.has(k)
                                    ? 'border border-blue-400 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                    : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                              {s.year}/{String(s.year + 1).slice(-2)}
                              {done?.ok && <span className="mr-1">✓</span>}
                              {done && !done.ok && <span className="mr-1">✗</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* Results summary */}
      {results.length > 0 && !running && (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            סיכום: {results.filter((r) => r.ok).length} הצליחו / {results.filter((r) => !r.ok).length} נכשלו
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {results.map((r) => (
              <div key={itemKey(r)} className={`flex gap-2 ${r.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                <span>{r.ok ? '✓' : '✗'}</span>
                <span>{catalog.find((c) => c.key === r.leagueKey)?.nameHe} {r.year}/{String(r.year + 1).slice(-2)}</span>
                {r.ok && r.fixturesSynced !== undefined && <span className="text-gray-400">({r.fixturesSynced} משחקים)</span>}
                {!r.ok && <span>{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared result panel ───────────────────────────────────────────────────────

function SyncResultPanel({ result }: { result: SyncResult }) {
  return (
    <div className={`rounded-lg border p-4 ${
      result.error
        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
        : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
    }`}>
      {result.error ? (
        <p className="text-sm text-red-700 dark:text-red-300">❌ שגיאה: {result.error}</p>
      ) : (
        <>
          <p className="mb-3 text-sm font-medium text-green-700 dark:text-green-300">✅ סנכרון הושלם</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-3">
            {result.teamsSynced !== undefined && <div>קבוצות: <strong>{result.teamsSynced}</strong></div>}
            {result.fixturesSynced !== undefined && <div>משחקים: <strong>{result.fixturesSynced}</strong></div>}
            {result.eventsSynced !== undefined && <div>אירועי משחק: <strong>{result.eventsSynced}</strong></div>}
            {result.playersSynced !== undefined && <div>שחקנים: <strong>{result.playersSynced}</strong></div>}
            {result.standingsSynced !== undefined && <div>טבלה: <strong>{result.standingsSynced}</strong></div>}
            {result.oddsSynced !== undefined && <div>יחסים: <strong>{result.oddsSynced}</strong></div>}
            {result.refereesSynced !== undefined && <div>שופטים: <strong>{result.refereesSynced}</strong></div>}
          </div>
          {result.steps && result.steps.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.steps.map((step) => (
                <div key={step.key} className="flex items-center gap-2 text-xs">
                  <span className={step.status === 'done' ? 'text-green-600' : step.status === 'failed' ? 'text-red-600' : 'text-gray-400'}>
                    {step.status === 'done' ? '✓' : step.status === 'failed' ? '✗' : '○'}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">{step.label}</span>
                  {step.syncedCount !== undefined && <span className="text-gray-500">({step.syncedCount})</span>}
                  {step.note && <span className="italic text-gray-400">{step.note}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FootyStatsFetchForm() {
  const [tab, setTab] = useState<'single' | 'bulk'>('single');
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<FSLeagueEntry[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const catalog = buildCatalog(discovered);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await fetch('/api/admin/footystats-leagues');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiscovered(data.leagues ?? []);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setDiscovering(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Discover leagues bar */}
      <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {discovered.length > 0
            ? `${discovered.length} ליגות ישראליות נמצאו ב-FootyStats`
            : 'טען את כל הליגות הזמינות מ-FootyStats'}
        </span>
        <button onClick={handleDiscover} disabled={discovering}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {discovering ? 'טוען...' : discovered.length > 0 ? 'רענן' : 'גלה ליגות'}
        </button>
        {discoverError && <span className="text-xs text-red-500">{discoverError}</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
        {[
          { key: 'single', label: 'סנכרון יחיד' },
          { key: 'bulk', label: 'לכידת IDs המונית' },
        ].map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setTab(key as 'single' | 'bulk')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'single' ? (
        <SingleSyncTab catalog={catalog} />
      ) : (
        <BulkCaptureTab catalog={catalog} />
      )}
    </div>
  );
}
