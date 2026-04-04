'use client';

import { useState } from 'react';

export default function AdminLiveCountriesClient({
  options,
  initialSelectedCountries,
}: {
  options: string[];
  initialSelectedCountries: string[];
}) {
  const [selectedCountries, setSelectedCountries] = useState<string[]>(initialSelectedCountries);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleCountry(country: string) {
    setSelectedCountries((current) =>
      current.includes(country) ? current.filter((value) => value !== country) : [...current, country]
    );
  }

  function selectAll() {
    setSelectedCountries(options);
  }

  function clearAll() {
    setSelectedCountries([]);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/live-competitions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryLabels: selectedCountries }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'לא הצלחנו לשמור את הגדרות מדינות הלייב.');
        return;
      }

      setSelectedCountries(Array.isArray(payload.countryLabels) ? payload.countryLabels : []);
      setMessage('הגדרות מדינות הלייב נשמרו בהצלחה.');
    } catch {
      setMessage('לא הצלחנו לשמור את הגדרות מדינות הלייב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Live</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">בחירת מדינות למסכי לייב</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        כאן אפשר לקבוע מאילו מדינות יוצגו משחקי לייב באתר. ההגדרה תשפיע על דף הבית, דף הלייב, וכל מקום שמשתמש
        בפיד הלייב המרכזי.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={selectAll} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">
          בחר הכול
        </button>
        <button type="button" onClick={clearAll} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">
          נקה הכול
        </button>
        <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700">
          נבחרו {selectedCountries.length} מדינות
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {options.map((country) => (
          <label key={country} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={selectedCountries.includes(country)}
              onChange={() => toggleCountry(country)}
              className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
            />
            <span className="font-bold text-stone-900">{country}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-sm text-stone-500">אם לא תבחר מדינות, בלוקי הלייב יוצגו ריקים עד לשמירה מחדש.</div>
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
