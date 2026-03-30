'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function GameRefereeForm({
  gameId,
  refereeNameEn,
  refereeNameHe,
}: {
  gameId: string;
  refereeNameEn: string;
  refereeNameHe: string;
}) {
  const router = useRouter();
  const [nameEn, setNameEn] = useState(refereeNameEn);
  const [nameHe, setNameHe] = useState(refereeNameHe);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const trimmedNameEn = nameEn.trim();
    const trimmedNameHe = nameHe.trim();

    try {
      const response = await fetch('/api/games/referee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          gameId,
          refereeNameEn: trimmedNameEn,
          refereeNameHe: trimmedNameHe,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error || 'לא הצלחנו לשמור את השופט');
        return;
      }

      setMessage('השופט נשמר בהצלחה');
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError('אירעה שגיאה בשמירה');
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>שם השופט באנגלית</span>
          <input
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-900 outline-none transition focus:border-amber-500"
            placeholder="למשל O. Naal"
          />
        </label>

        <label className="space-y-2 text-sm font-semibold text-stone-700">
          <span>שם השופט בעברית</span>
          <input
            value={nameHe}
            onChange={(event) => setNameHe(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-900 outline-none transition focus:border-amber-500"
            placeholder="למשל עומר נאעל"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'שומר...' : 'שמור שופט'}
        </button>
        <div className="text-sm text-stone-500">אפשר למלא לפחות אחד מהשדות, והשופט יישמר ויופיע בסטטיסטיקות.</div>
      </div>

      {message ? <div className="mt-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 text-sm font-semibold text-red-700">{error}</div> : null}
    </form>
  );
}
