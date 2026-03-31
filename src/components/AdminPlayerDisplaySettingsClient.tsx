'use client';

import { useState } from 'react';

export default function AdminPlayerDisplaySettingsClient({
  initialDisplayZeroStatPlayers,
}: {
  initialDisplayZeroStatPlayers: boolean;
}) {
  const [enabled, setEnabled] = useState(initialDisplayZeroStatPlayers);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/player-display-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayZeroStatPlayers: enabled }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'לא הצלחנו לשמור את הגדרת תצוגת השחקנים.');
        return;
      }

      setEnabled(Boolean(payload.displayZeroStatPlayers));
      setMessage('הגדרת תצוגת השחקנים נשמרה בהצלחה.');
    } catch {
      setMessage('לא הצלחנו לשמור את הגדרת תצוגת השחקנים.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Players</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">תצוגת שחקני 0 סטטיסטיקות</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        אפשר לקבוע האם שחקנים ללא הופעות, דקות או נתוני עונה יוצגו באתר. כשהאפשרות פעילה הם יוצגו באפור ובתחתית הרשימות.
      </p>

      <label className="mt-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm font-semibold text-stone-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
        />
        להציג באתר שחקנים עם 0 סטטיסטיקות
      </label>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-sm text-stone-500">
          כבוי: השחקנים האלה יוסתרו מדפי השחקנים והסטטיסטיקה. פעיל: הם יוצגו בסוף הרשימה.
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {saving ? 'שומר...' : 'שמור הגדרה'}
        </button>
      </div>

      {message ? <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700">{message}</div> : null}
    </section>
  );
}
