'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const KNOWN_LEAGUES = [
  { slug: 'ligat-ha-al', label: 'ליגת העל' },
  { slug: 'liga-leumit', label: 'ליגה לאומית' },
  { slug: 'state-cup', label: 'גביע המדינה' },
  { slug: 'toto-cup', label: 'גביע הטוטו' },
];

const CURRENT_YEAR = new Date().getUTCFullYear();
const KNOWN_SEASONS = Array.from({ length: 8 }).map((_, i) => {
  const y = CURRENT_YEAR - i;
  return `${y - 1}-${y}`;
});

export default function AdminFlashscoreClient() {
  const [leagueSlug, setLeagueSlug] = useState('ligat-ha-al');
  const [season, setSeason] = useState(KNOWN_SEASONS[0]);
  const [skipFixtures, setSkipFixtures] = useState(false);
  const [skipTeams, setSkipTeams] = useState(false);
  const [skipMatches, setSkipMatches] = useState(false);
  const [skipPlayers, setSkipPlayers] = useState(false);
  const [skipMerge, setSkipMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

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

  // Auto-scroll log to bottom whenever it updates.
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
          leagueSlug,
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
            <span className="font-semibold text-stone-700">ליגה</span>
            <select
              value={leagueSlug}
              onChange={(e) => setLeagueSlug(e.target.value)}
              disabled={running}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            >
              {KNOWN_LEAGUES.map((l) => (
                <option key={l.slug} value={l.slug}>{l.label} ({l.slug})</option>
              ))}
            </select>
            <input
              type="text"
              value={leagueSlug}
              onChange={(e) => setLeagueSlug(e.target.value)}
              disabled={running}
              placeholder="או הזן slug ידני"
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-stone-700">עונה</span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              disabled={running}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            >
              {KNOWN_SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>שים לב:</strong> ייבוא מלא לעונת ליגה רגילה (~220 משחקים) לוקח 60–90 דקות.
        עונות גביע קצרות יותר. ניתן לסגור את הדף ולחזור — הסטטוס מתעדכן גם אחרי רענון.
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
