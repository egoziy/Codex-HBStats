'use client';

import { useState, useDeferredValue, useCallback } from 'react';

type Referee = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  _count: { games: number };
  mainCompetition: string | null;
  country: string | null;
};

export default function AdminRefereesClient({ initialReferees, countries }: { initialReferees: Referee[]; countries: string[] }) {
  const [referees, setReferees] = useState<Referee[]>(initialReferees);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing_he' | 'has_he'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [sortBy, setSortBy] = useState<'nameEn' | 'nameHe' | 'games'>('nameEn');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const saveNameHe = async (id: string, nameHe: string) => {
    const ref = referees.find((r) => r.id === id);
    if (!ref || nameHe === (ref.nameHe || '')) return;
    setSavingId(id);
    try {
      const res = await fetch('/api/referees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nameHe }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      setReferees((prev) => prev.map((r) => (r.id === id ? { ...r, nameHe: nameHe || null } : r)));
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'games' ? 'desc' : 'asc'); }
  };

  const filtered = referees
    .filter((r) => {
      const q = deferredSearch.toLowerCase();
      const matchesSearch = !q || r.nameEn.toLowerCase().includes(q) || (r.nameHe || '').includes(q);
      if (!matchesSearch) return false;
      if (countryFilter !== 'all') {
        if (countryFilter === 'none') { if (r.country) return false; }
        else if (r.country !== countryFilter) return false;
      }
      if (filter === 'missing_he') return !r.nameHe || r.nameHe === r.nameEn;
      if (filter === 'has_he') return r.nameHe && r.nameHe !== r.nameEn;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'nameEn') cmp = a.nameEn.localeCompare(b.nameEn, 'en');
      else if (sortBy === 'nameHe') cmp = (a.nameHe || '').localeCompare(b.nameHe || '', 'he');
      else if (sortBy === 'games') cmp = a._count.games - b._count.games;
      return sortDir === 'desc' ? -cmp : cmp;
    });


  const doMerge = async () => {
    if (!mergeSource || !mergeTarget) return;
    setMerging(true);
    try {
      const res = await fetch('/api/referees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', targetId: mergeTarget, sourceId: mergeSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Remove source from list, update target game count
      setReferees((prev) => {
        const source = prev.find((r) => r.id === mergeSource);
        return prev
          .filter((r) => r.id !== mergeSource)
          .map((r) =>
            r.id === mergeTarget
              ? { ...r, _count: { games: r._count.games + (source?._count.games || 0) } }
              : r
          );
      });
      showMessage(data.message || 'מוזג בהצלחה', 'success');
      setMergeSource(null);
      setMergeTarget(null);
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setMerging(false);
    }
  };

  const cancelMerge = () => {
    setMergeSource(null);
    setMergeTarget(null);
  };

  const deleteReferee = async (id: string) => {
    const ref = referees.find((r) => r.id === id);
    if (!ref) return;
    if (ref._count.games > 0) {
      showMessage(`לא ניתן למחוק — לשופט ${ref._count.games} משחקים`, 'error');
      return;
    }
    try {
      const res = await fetch(`/api/referees?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      setReferees((prev) => prev.filter((r) => r.id !== id));
      showMessage('נמחק', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    }
  };

  const missingCount = referees.filter((r) => !r.nameHe || r.nameHe === r.nameEn).length;
  const totalGames = referees.reduce((sum, r) => sum + r._count.games, 0);

  const sourceRef = mergeSource ? referees.find((r) => r.id === mergeSource) : null;
  const targetRef = mergeTarget ? referees.find((r) => r.id === mergeTarget) : null;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm">
          <div className="text-2xl font-black text-stone-900">{referees.length}</div>
          <div className="text-xs text-stone-500">שופטים</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm">
          <div className="text-2xl font-black text-red-700">{missingCount}</div>
          <div className="text-xs text-stone-500">חסר עברית</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm">
          <div className="text-2xl font-black text-stone-900">{totalGames}</div>
          <div className="text-xs text-stone-500">משחקים</div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* Merge banner */}
      {mergeSource && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-bold text-amber-800">
            מצב מיזוג — בחר את השופט שאליו למזג
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg bg-amber-200 px-3 py-1 font-bold text-amber-900">
              מקור: {sourceRef?.nameHe || sourceRef?.nameEn} ({sourceRef?._count.games} משחקים)
            </span>
            {mergeTarget && (
              <>
                <span className="text-amber-700">→</span>
                <span className="rounded-lg bg-emerald-200 px-3 py-1 font-bold text-emerald-900">
                  יעד: {targetRef?.nameHe || targetRef?.nameEn} ({targetRef?._count.games} משחקים)
                </span>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            {mergeTarget && (
              <button
                onClick={doMerge}
                disabled={merging}
                className="rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {merging ? 'ממזג...' : 'אשר מיזוג'}
              </button>
            )}
            <button onClick={cancelMerge} className="rounded-full border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700">
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="חיפוש שופט..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-400"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none"
        >
          <option value="all">הכל ({referees.length})</option>
          <option value="missing_he">חסר עברית ({missingCount})</option>
          <option value="has_he">יש עברית ({referees.length - missingCount})</option>
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none"
        >
          <option value="all">כל המדינות</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="none">ללא מדינה</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
              <th className="px-4 py-3 text-right font-semibold">
                <button onClick={() => toggleSort('nameEn')} className="flex items-center gap-1 hover:text-stone-900 transition">
                  שם באנגלית {sortBy === 'nameEn' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button onClick={() => toggleSort('nameHe')} className="flex items-center gap-1 hover:text-stone-900 transition">
                  שם בעברית {sortBy === 'nameHe' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">מסגרת עיקרית</th>
              <th className="px-4 py-3 text-right font-semibold">מדינה</th>
              <th className="px-4 py-3 text-center font-semibold">
                <button onClick={() => toggleSort('games')} className="mx-auto flex items-center gap-1 hover:text-stone-900 transition">
                  משחקים {sortBy === 'games' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th className="px-4 py-3 text-center font-semibold">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ref) => (
              <tr
                key={ref.id}
                className={`border-b border-stone-100 transition ${
                  mergeSource === ref.id
                    ? 'bg-amber-50'
                    : mergeTarget === ref.id
                      ? 'bg-emerald-50'
                      : 'hover:bg-stone-50'
                }`}
              >
                <td className="px-4 py-3">
                  <span className="font-medium text-stone-700" dir="ltr">{ref.nameEn}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      defaultValue={ref.nameHe || ''}
                      placeholder="הזן שם בעברית..."
                      onBlur={(e) => saveNameHe(ref.id, e.target.value.trim())}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={`w-full rounded-lg border px-2 py-1 text-sm outline-none transition ${
                        ref.nameHe && ref.nameHe !== ref.nameEn
                          ? 'border-stone-200 bg-white text-stone-900'
                          : 'border-red-200 bg-red-50 text-stone-500 placeholder:text-red-300'
                      } focus:border-red-400 focus:bg-white focus:text-stone-900`}
                    />
                    {savingId === ref.id && <span className="text-xs text-stone-400">...</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-stone-600">{ref.mainCompetition || '—'}</td>
                <td className="px-4 py-3 text-xs text-stone-600">{ref.country || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">
                    {ref._count.games}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {mergeSource && mergeSource !== ref.id ? (
                      <button
                        onClick={() => setMergeTarget(ref.id)}
                        className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-200"
                        title="בחר כיעד מיזוג"
                      >
                        יעד
                      </button>
                    ) : !mergeSource ? (
                      <button
                        onClick={() => setMergeSource(ref.id)}
                        className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 transition hover:bg-amber-200"
                        title="מזג שופט זה לתוך שופט אחר"
                      >
                        מזג
                      </button>
                    ) : null}
                    {ref._count.games === 0 && (
                      <button
                        onClick={() => deleteReferee(ref.id)}
                        className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 transition hover:bg-red-200"
                        title="מחק"
                      >
                        מחק
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-stone-500">לא נמצאו שופטים.</div>
        )}
      </div>
      <div className="text-xs text-stone-500">מציג {filtered.length} מתוך {referees.length} שופטים</div>
    </div>
  );
}
