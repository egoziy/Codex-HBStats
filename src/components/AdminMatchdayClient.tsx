'use client';

import { useEffect, useState } from 'react';

const LEAGUES = [
  { key: 'ipl',       label: 'ליגת העל' },
  { key: 'leumit',    label: 'ליגה לאומית' },
  { key: 'stateCup',  label: 'גביע המדינה' },
  { key: 'totoCupAl', label: 'גביע הטוטו' },
  { key: 'superCup',  label: 'סופר קאפ' },
  { key: 'all',       label: 'כל הליגות' },
];

type MatchdayStep = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

type MatchdayState = {
  running: boolean;
  options: { date: string; league: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: MatchdayStep[];
  output: string;
  error: string | null;
};

const STATUS_ICON: Record<MatchdayStep['status'], string> = {
  pending: '⏳',
  running: '▶',
  done:    '✓',
  error:   '✗',
  skipped: '−',
};

const STATUS_CLASS: Record<MatchdayStep['status'], string> = {
  pending: 'text-stone-400',
  running: 'text-amber-700',
  done:    'text-emerald-700',
  error:   'text-rose-700',
  skipped: 'text-stone-500',
};

export default function AdminMatchdayClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [league, setLeague] = useState('ipl');
  const [skipApi, setSkipApi] = useState(false);
  const [skipFs, setSkipFs] = useState(true); // default skip — Cloudflare blocks headless
  const [skipIfa, setSkipIfa] = useState(false);
  const [skipWalla, setSkipWalla] = useState(false);
  const [skipMerge, setSkipMerge] = useState(false);
  const [headful, setHeadful] = useState(false);
  const [state, setState] = useState<MatchdayState | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/api/admin/matchday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    if (res.ok) setState(await res.json());
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!state?.running) return undefined;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [state?.running]);

  async function start() {
    setBusy(true);
    const res = await fetch('/api/admin/matchday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start', date, league,
        skipApiFootball: skipApi, skipFootyStats: skipFs,
        skipIfa, skipWalla, skipMerge, headful,
      }),
    });
    if (res.status === 429) alert('עדכון כבר רץ');
    setBusy(false);
    refresh();
  }

  const running = state?.running;
  const output = state?.output || '';
  const steps = state?.steps ?? [];
  const overallStatus = running
    ? 'running'
    : state?.error
    ? 'error'
    : state?.finishedAt
    ? 'done'
    : 'pending';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-stone-700">תאריך</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={running}
            className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-stone-700">ליגה</span>
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            disabled={running}
            className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {LEAGUES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipApi} onChange={(e) => setSkipApi(e.target.checked)} disabled={running} />
          <span>דלג על API-Football</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipFs} onChange={(e) => setSkipFs(e.target.checked)} disabled={running} />
          <span>דלג על FootyStats (דורש headful)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipIfa} onChange={(e) => setSkipIfa(e.target.checked)} disabled={running} />
          <span>דלג על IFA (football.org.il)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipWalla} onChange={(e) => setSkipWalla(e.target.checked)} disabled={running} />
          <span>דלג על Walla</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipMerge} onChange={(e) => setSkipMerge(e.target.checked)} disabled={running} />
          <span>דלג על מיזוג סופי</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={headful} onChange={(e) => setHeadful(e.target.checked)} disabled={running} />
          <span>הצג חלון Chrome (FootyStats)</span>
        </label>
      </div>

      <button
        type="button"
        onClick={start}
        disabled={busy || running}
        className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {running ? 'רץ עכשיו...' : 'הפעל עדכון יום משחקים'}
      </button>

      {state && state.startedAt && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-stone-600">
            <span>התחיל: {new Date(state.startedAt).toLocaleTimeString('he-IL')}</span>
            {state.finishedAt && <span>הסתיים: {new Date(state.finishedAt).toLocaleTimeString('he-IL')}</span>}
            <span className={`rounded-full px-2 py-0.5 font-bold ${
              overallStatus === 'done'    ? 'bg-emerald-100 text-emerald-800' :
              overallStatus === 'error'   ? 'bg-rose-100 text-rose-800' :
              overallStatus === 'running' ? 'bg-amber-100 text-amber-800' :
              'bg-stone-100 text-stone-700'}`}>
              {overallStatus === 'done' ? 'הסתיים' : overallStatus === 'error' ? 'שגיאה' : overallStatus === 'running' ? 'רץ' : 'מוכן'}
            </span>
          </div>

          {steps.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-base ${STATUS_CLASS[s.status]}`}>{STATUS_ICON[s.status]}</span>
                    <span className="text-stone-800">{s.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${STATUS_CLASS[s.status]}`}>
                    {s.status === 'done' ? 'הסתיים' :
                     s.status === 'error' ? 'שגיאה' :
                     s.status === 'running' ? 'רץ' :
                     s.status === 'skipped' ? 'דולג' : 'ממתין'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {state.error && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{state.error}</div>}
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-stone-900 p-3 text-[11px] leading-relaxed text-stone-100" dir="ltr">{output || '(אין פלט)'}</pre>
        </div>
      )}
    </div>
  );
}
