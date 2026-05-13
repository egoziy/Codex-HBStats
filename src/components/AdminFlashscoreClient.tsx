'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
type Step = { key: string; label: string; status: StepStatus; error?: string };
type Status = {
  running: boolean;
  options: { leagueSlug?: string; season?: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: Step[];
  output: string;
  error: string | null;
};

// Today is during 2025-2026 (Aug 2025 → Jul 2026). Current-season slugs have
// no year suffix on Flashscore; historical seasons append "-YYYY-YYYY".
const CURRENT_SEASON = '2025-2026';
const HISTORICAL_SEASONS = (() => {
  const arr: string[] = [];
  for (let endYear = 2025; endYear >= 1996; endYear--) {
    arr.push(`${endYear - 1}-${endYear}`);
  }
  return arr;
})();

const LEAGUES = [
  { label: 'ליגת העל', baseSlug: 'ligat-ha-al' },
  { label: 'ליגה לאומית', baseSlug: 'leumit-league' },
  { label: 'גביע המדינה', baseSlug: 'state-cup' },
  { label: 'סופר קאפ (אלוף האלופים)', baseSlug: 'super-cup' },
  { label: 'גביע הטוטו', baseSlug: 'toto-cup' },
  { label: 'ליגה א\' צפון', baseSlug: 'liga-alef-north' },
  { label: 'ליגה א\' דרום', baseSlug: 'liga-alef-south' },
];

export default function AdminFlashscoreClient() {
  const [leagueIdx, setLeagueIdx] = useState(0);
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [customSlug, setCustomSlug] = useState('');
  const [skipFixtures, setSkipFixtures] = useState(false);
  const [skipTeams, setSkipTeams] = useState(false);
  const [skipMatches, setSkipMatches] = useState(false);
  const [skipPlayers, setSkipPlayers] = useState(false);
  const [skipMerge, setSkipMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  // Slug derivation: current-season → base slug, historical → base + season suffix.
  // Super Cup uses a single-year suffix (super-cup-2024); leagues use a range
  // (ligat-ha-al-2024-2025). User can override via the custom slug field.
  const derivedSlug = useMemo(() => {
    if (customSlug.trim()) return customSlug.trim();
    const base = LEAGUES[leagueIdx].baseSlug;
    if (season === CURRENT_SEASON) return base;
    if (base === 'super-cup') return `${base}-${season.split('-')[0]}`;
    return `${base}-${season}`;
  }, [leagueIdx, season, customSlug]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/flashscore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const json = (await res.json()) as Status;
      setStatus(json);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [status?.output]);

  async function start(action: 'start' | 'merge') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/flashscore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          leagueSlug: derivedSlug,
          season,
          skipFixtures,
          skipTeams,
          skipMatches,
          skipPlayers,
          skipMerge,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const running = status?.running ?? false;

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-stone-900">בחירת מסגרת ועונה</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-stone-700">מסגרת</span>
            <select
              value={leagueIdx}
              onChange={(e) => setLeagueIdx(Number(e.target.value))}
              disabled={running}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            >
              {LEAGUES.map((l, i) => (
                <option key={l.baseSlug} value={i}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-stone-700">עונה</span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              disabled={running}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            >
              {HISTORICAL_SEASONS.map((s) => (
                <option key={s} value={s}>{s === CURRENT_SEASON ? `${s} (עונה נוכחית)` : s}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
          <div className="font-semibold text-stone-600">
            URL ל-Flashscore: <code className="rounded bg-white px-1.5 py-0.5 text-stone-900" dir="ltr">/football/israel/{derivedSlug}/</code>
          </div>
          <label className="mt-2 flex flex-col gap-1 text-stone-700">
            <span>או הזן slug ידנית (יעקוף את הבחירה למעלה):</span>
            <input
              type="text"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              disabled={running}
              placeholder="לדוגמה: ligat-ha-al-2010-2011"
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5"
              dir="ltr"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Checkbox checked={skipFixtures} onChange={setSkipFixtures} disabled={running}>דלג: רשימת משחקים</Checkbox>
          <Checkbox checked={skipTeams} onChange={setSkipTeams} disabled={running}>דלג: קבוצות</Checkbox>
          <Checkbox checked={skipMatches} onChange={setSkipMatches} disabled={running}>דלג: פרטי משחקים</Checkbox>
          <Checkbox checked={skipPlayers} onChange={setSkipPlayers} disabled={running}>דלג: שחקנים</Checkbox>
          <Checkbox checked={skipMerge} onChange={setSkipMerge} disabled={running}>דלג: מיזוג</Checkbox>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => start('start')}
            disabled={busy || running}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            הפעל ייבוא + מיזוג
          </button>
          <button
            onClick={() => start('merge')}
            disabled={busy || running}
            className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            הפעל מיזוג בלבד
          </button>
          {running ? <span className="self-center text-sm text-stone-600">תהליך פעיל…</span> : null}
        </div>
        {error ? <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
        {status?.error ? <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{status.error}</div> : null}
      </div>

      <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-stone-900">סטטוס ריצה</h2>
        {!status || status.steps.length === 0 ? (
          <div className="mt-3 text-sm text-stone-500">לא הופעל ייבוא בסשן הנוכחי.</div>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {status.steps.map((s) => <StepRow key={s.key} step={s} />)}
          </ol>
        )}
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">לוג ריצה</div>
          <pre
            ref={logRef}
            className="mt-2 h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-950 p-3 text-xs leading-5 text-stone-100"
            dir="ltr"
          >
            {status?.output || '(אין פלט עדיין)'}
          </pre>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 leading-7">
        <strong>טיפים:</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>עונה נוכחית: <code dir="ltr">ligat-ha-al</code></li>
          <li>עונה היסטורית: <code dir="ltr">ligat-ha-al-2024-2025</code> (מתבנה אוטומטית מהבחירה)</li>
          <li>סופר קאפ אישי: <code dir="ltr">super-cup-2024</code> (שנה אחת בלבד)</li>
          <li>ייבוא מלא ~220 משחקים: 60–90 דק'. עונות גביע: 10–20 דק'.</li>
          <li>אם שם קבוצה לא מתאים לאחר מיזוג — תוסיף alias ב-<code dir="ltr">scripts/rebuild/44-flashscore-enrichment.js</code> ופנה אלי.</li>
        </ul>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const dot =
    step.status === 'done' ? 'bg-emerald-500'
    : step.status === 'error' ? 'bg-rose-500'
    : step.status === 'running' ? 'bg-amber-400 animate-pulse'
    : step.status === 'skipped' ? 'bg-stone-300'
    : 'bg-stone-200';
  return (
    <li className="flex items-center gap-3">
      <span className={`inline-block h-3 w-3 rounded-full ${dot}`}></span>
      <span className="font-bold text-stone-900">{step.label}</span>
      <span className="text-xs text-stone-500">
        {step.status === 'done' ? 'הושלם' :
         step.status === 'error' ? 'נכשל' :
         step.status === 'running' ? 'רץ' :
         step.status === 'skipped' ? 'דולג' : 'ממתין'}
        {step.error ? ` — ${step.error}` : ''}
      </span>
    </li>
  );
}

function Checkbox({ checked, onChange, disabled, children }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center gap-2 rounded-full border border-stone-300 bg-stone-50 px-3 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{children}</span>
    </label>
  );
}
