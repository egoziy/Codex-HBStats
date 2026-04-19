'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminScrapeClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  async function runScrape(action: string, params?: Record<string, any>) {
    setMessage('מתחיל סריקה...');
    setIsRunning(true);

    try {
      const response = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ...params }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(`שגיאה: ${data.error || 'Unknown'}`);
      } else if (action === 'scrape-all') {
        setMessage(`הסתיים: ${data.teamsScraped} קבוצות, ${data.playersScraped} שחקנים, ${data.seasonsScraped} עונות, ${data.errors?.length || 0} שגיאות`);
      } else if (action === 'scrape-team') {
        setMessage(`${data.name}: ${data.players} שחקנים נסרקו`);
      } else if (action === 'status') {
        setMessage(`DB: ${data.teams} קבוצות, ${data.players} שחקנים, ${data.seasons} עונות`);
      } else {
        setMessage(JSON.stringify(data).slice(0, 200));
      }

      startTransition(() => router.refresh());
    } catch (error: any) {
      setMessage(`שגיאת תקשורת: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-stone-900">הפעלת סריקה</h2>
          <p className="mt-1 text-sm text-stone-600">
            סריקת Sport5 לוקחת ~20 דקות (14 קבוצות + כל השחקנים). סריקת IFA דרך סקריפט בטרמינל.
          </p>
        </div>
        {isRunning ? (
          <span className="rounded-full bg-amber-200 px-4 py-2 text-sm font-bold text-amber-800">סורק...</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runScrape('scrape-all')}
          disabled={isRunning}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          סרוק את כל Sport5
        </button>
        <button
          type="button"
          onClick={() => runScrape('scrape-team', { folderId: 1639 })}
          disabled={isRunning}
          className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 disabled:opacity-50"
        >
          סרוק באר שבע בלבד
        </button>
        <button
          type="button"
          onClick={() => runScrape('status')}
          disabled={isRunning}
          className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 disabled:opacity-50"
        >
          בדוק סטטוס
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-white/60 px-4 py-2 text-sm">
        <div className="mb-1 text-xs font-bold text-stone-500">סריקת IFA (דרך טרמינל):</div>
        <code className="text-xs text-stone-600">node scripts/scrape-ifa.js</code>
        <span className="mr-2 text-xs text-stone-400">— כל העונות של ליגת העל</span>
      </div>

      {message ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-700">
          {message}
        </div>
      ) : null}
    </section>
  );
}

export function AdminRsssfClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  async function runAction(action: string, params?: Record<string, any>) {
    setMessage('מתחיל...');
    setIsRunning(true);
    try {
      const response = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ...params }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(`שגיאה: ${data.error || 'Unknown'}`);
      } else if (action === 'rsssf-status') {
        setMessage(`טבלאות: ${data.standings} | מלכי שערים: ${data.topScorers} | משחקים: ${data.matches}`);
      } else {
        setMessage(data.message || JSON.stringify(data).slice(0, 300));
      }
      startTransition(() => router.refresh());
    } catch (error: any) {
      setMessage(`שגיאת תקשורת: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-stone-900">RSSSF — היסטוריה (1948–2026)</h2>
          <p className="mt-1 text-sm text-stone-600">
            סריקת rsssf.org: טבלאות, מלכי שערים, גביע המדינה. מיזוג מוגבל לעד 2000 כברירת מחדל.
          </p>
        </div>
        {isRunning ? (
          <span className="rounded-full bg-indigo-200 px-4 py-2 text-sm font-bold text-indigo-800">פועל...</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runAction('rsssf-scrape')}
          disabled={isRunning}
          className="rounded-full bg-indigo-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          סרוק RSSSF (הכל)
        </button>
        <button
          type="button"
          onClick={() => runAction('rsssf-merge', { maxYear: 2000 })}
          disabled={isRunning}
          className="rounded-full border border-indigo-300 bg-white px-5 py-3 text-sm font-bold text-indigo-700 disabled:opacity-50"
        >
          מזג RSSSF → DB (עד 2000)
        </button>
        <button
          type="button"
          onClick={() => runAction('rsssf-status')}
          disabled={isRunning}
          className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 disabled:opacity-50"
        >
          סטטוס RSSSF
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-white/60 px-4 py-2 text-sm">
        <div className="mb-1 text-xs font-bold text-stone-500">סריקת RSSSF (דרך טרמינל):</div>
        <code className="text-xs text-stone-600">node scripts/scrape-rsssf.js --mode all</code>
        <div className="mt-1">
          <code className="text-xs text-stone-600">node scripts/merge-rsssf.js --mode all --max-year 2000</code>
        </div>
      </div>

      {message ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-700 whitespace-pre-wrap">
          {message}
        </div>
      ) : null}
    </section>
  );
}
