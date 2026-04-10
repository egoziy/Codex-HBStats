'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type PlayerOption = {
  id: string;
  name: string;
};

type SidelinedEntry = {
  id: string;
  playerName: string;
  playerId: string | null;
  typeHe: string | null;
  typeEn: string;
  startDate: string | null;
  endDate: string | null;
};

export default function TeamInjuryManager({
  players,
  sidelinedEntries,
}: {
  players: PlayerOption[];
  sidelinedEntries: SidelinedEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [playerId, setPlayerId] = useState('');
  const [typeHe, setTypeHe] = useState('');
  const [message, setMessage] = useState('');

  async function addInjury() {
    if (!playerId || !typeHe.trim()) {
      setMessage('יש לבחור שחקן ולהזין סוג פציעה');
      return;
    }
    setMessage('');

    try {
      const res = await fetch('/api/players/sidelined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, typeHe: typeHe.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בהוספה');
        return;
      }
      setMessage('השחקן סומן כפצוע');
      setPlayerId('');
      setTypeHe('');
      startTransition(() => router.refresh());
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  async function markRecovered(entryId: string) {
    setMessage('');
    try {
      const res = await fetch('/api/players/sidelined', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: entryId, endDate: new Date().toISOString() }),
      });
      if (!res.ok) {
        setMessage('שגיאה בעדכון');
        return;
      }
      setMessage('השחקן סומן כזמין');
      startTransition(() => router.refresh());
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  async function removeEntry(entryId: string) {
    setMessage('');
    try {
      const res = await fetch(`/api/players/sidelined?id=${entryId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקה');
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900">ניהול פציעות</h2>
          <p className="mt-1 text-sm text-stone-600">סמן שחקנים כפצועים או החזר אותם לסגל הזמין.</p>
        </div>
        <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-800">
          {isPending ? 'מרענן...' : 'אדמין בלבד'}
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-amber-200 bg-white p-4">
        <div className="text-sm font-black text-stone-900">הוספת פציעה</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold"
          >
            <option value="">בחר שחקן</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={typeHe}
            onChange={(e) => setTypeHe(e.target.value)}
            placeholder="סוג פציעה (עברית)"
            className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={addInjury}
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white"
          >
            סמן כפצוע
          </button>
        </div>
        {message ? <div className="mt-2 text-sm font-semibold text-stone-600">{message}</div> : null}
      </div>

      {sidelinedEntries.length > 0 ? (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-white p-4">
          <div className="text-sm font-black text-stone-900">פצועים פעילים</div>
          <div className="mt-3 space-y-2">
            {sidelinedEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-bold text-stone-800">{entry.playerName}</span>
                  <span className="text-stone-500">— {entry.typeHe || entry.typeEn}</span>
                  {entry.startDate ? (
                    <span className="text-xs text-stone-400">
                      מ-{new Date(entry.startDate).toLocaleDateString('he-IL')}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => markRecovered(entry.id)}
                    className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    חזר לסגל
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
