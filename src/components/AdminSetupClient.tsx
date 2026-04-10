'use client';

import { useState, useEffect } from 'react';

type StepData = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  error?: string;
  durationMs?: number;
};

type SetupStatus = {
  running: boolean;
  mode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  currentStep: string | null;
  steps: StepData[];
  error: string | null;
};

const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  done: '✅',
  error: '❌',
  skipped: '⏭️',
};

const statusColors: Record<string, string> = {
  pending: 'bg-stone-100 text-stone-500',
  running: 'bg-blue-100 text-blue-700 animate-pulse',
  done: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  skipped: 'bg-stone-50 text-stone-400',
};

export default function AdminSetupClient() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [message, setMessage] = useState('');
  const [selectedMode, setSelectedMode] = useState<'full' | 'quick' | 'merge-only'>('full');
  const [isStarting, setIsStarting] = useState(false);

  // Poll status every 3 seconds when running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    async function pollStatus() {
      try {
        const res = await fetch('/api/admin/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await res.json();
        setStatus(data);
      } catch { /* ignore */ }
    }

    pollStatus();
    interval = setInterval(pollStatus, 3000);

    return () => { if (interval) clearInterval(interval); };
  }, []);

  async function startSetup() {
    setIsStarting(true);
    setMessage('מתחיל ייבוא...');
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'start', mode: selectedMode }),
      });
      const data = await res.json();
      if (data.error) { setMessage(`שגיאה: ${data.error}`); }
      else { setMessage('ייבוא התחיל — מעקב אוטומטי...'); }
    } catch (e: any) {
      setMessage(`שגיאה: ${e.message}`);
    } finally {
      setIsStarting(false);
    }
  }

  const isRunning = status?.running || false;
  const completedSteps = status?.steps.filter((s) => s.status === 'done').length || 0;
  const totalSteps = status?.steps.length || 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-stone-900">הפעלת ייבוא</h2>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as any)}
            disabled={isRunning}
            className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            <option value="full">מלא (~90 דקות)</option>
            <option value="quick">מהיר (~15 דקות)</option>
            <option value="merge-only">מיזוג בלבד (~10 דקות)</option>
          </select>

          <button
            onClick={startSetup}
            disabled={isRunning || isStarting}
            className="rounded-full bg-stone-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isRunning ? 'ייבוא רץ...' : isStarting ? 'מתחיל...' : 'התחל ייבוא'}
          </button>
        </div>

        {message ? (
          <div className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700">{message}</div>
        ) : null}
      </section>

      {/* Progress */}
      {status && status.steps.length > 0 ? (
        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-stone-900">
              {isRunning ? 'ייבוא פעיל' : status.finishedAt ? 'ייבוא הסתיים' : 'מצב ייבוא'}
            </h2>
            {isRunning ? (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700 animate-pulse">
                {progressPct}% — {completedSteps}/{totalSteps}
              </span>
            ) : status.finishedAt ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                הושלם {completedSteps}/{totalSteps}
              </span>
            ) : null}
          </div>

          {/* Progress bar */}
          {totalSteps > 0 ? (
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isRunning ? 'bg-blue-500' : 'bg-emerald-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : null}

          {/* Steps list */}
          <div className="mt-4 space-y-2">
            {status.steps.map((step) => (
              <div
                key={step.key}
                className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${statusColors[step.status]}`}
              >
                <div className="flex items-center gap-2">
                  <span>{statusIcons[step.status]}</span>
                  <span className="font-semibold">{step.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {step.durationMs ? (
                    <span className="text-xs opacity-60">{Math.round(step.durationMs / 1000)}s</span>
                  ) : null}
                  {step.error ? (
                    <span className="text-xs text-red-600">{step.error.slice(0, 50)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Timing */}
          {status.startedAt ? (
            <div className="mt-3 text-xs text-stone-400">
              התחיל: {new Date(status.startedAt).toLocaleString('he-IL')}
              {status.finishedAt ? ` | הסתיים: ${new Date(status.finishedAt).toLocaleString('he-IL')}` : ''}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
