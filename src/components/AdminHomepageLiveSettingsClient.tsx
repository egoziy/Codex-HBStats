'use client';

import { useState } from 'react';

const LIMIT_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];

export default function AdminHomepageLiveSettingsClient({
  initialHomepageLiveLimit,
}: {
  initialHomepageLiveLimit: number;
}) {
  const [limit, setLimit] = useState(initialHomepageLiveLimit);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/homepage-live-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homepageLiveLimit: limit }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'לא הצלחנו לשמור את כמות משחקי הלייב.');
        return;
      }

      setLimit(Number(payload.homepageLiveLimit) || initialHomepageLiveLimit);
      setMessage('כמות משחקי הלייב בדף הבית נשמרה בהצלחה.');
    } catch {
      setMessage('לא הצלחנו לשמור את כמות משחקי הלייב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Homepage Live</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">כמות משחקי לייב בדף הבית</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        אפשר לקבוע כמה משחקים יוצגו בבלוק הלייב של הדף הראשי. ככל שהמספר גבוה יותר, הבלוק יתפוס יותר מקום.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {LIMIT_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setLimit(option)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              limit === option
                ? 'bg-stone-900 text-white'
                : 'border border-stone-300 bg-white text-stone-700 hover:border-stone-400'
            }`}
          >
            {option} משחקים
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-sm text-stone-500">ההגדרה הזאת משפיעה על בלוק הלייב בדף הבית בלבד.</div>
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
