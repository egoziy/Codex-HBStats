'use client';

import { useState } from 'react';

type TelegramSourceRow = {
  slug: string;
  label: string;
  teamLabel: string;
};

export default function AdminTelegramSourcesClient({
  initialSources,
}: {
  initialSources: TelegramSourceRow[];
}) {
  const [sources, setSources] = useState<TelegramSourceRow[]>(initialSources);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateRow(index: number, key: keyof TelegramSourceRow, value: string) {
    setSources((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setSources((current) => [...current, { slug: '', label: '', teamLabel: '' }]);
  }

  function removeRow(index: number) {
    setSources((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/telegram-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'לא הצלחנו לשמור את מקורות הטלגרם.');
        return;
      }

      setSources(payload.sources || []);
      setMessage('מקורות הטלגרם נשמרו בהצלחה.');
    } catch {
      setMessage('לא הצלחנו לשמור את מקורות הטלגרם.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Telegram</p>
          <h2 className="mt-2 text-2xl font-black text-stone-900">מקורות טלגרם בדף הבית</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            אפשר להוסיף כאן קישורים ציבוריים של טלגרם, שם תצוגה ושיוך קבוצה. הדף הראשי ימשוך מהם הודעות אוטומטית.
          </p>
        </div>
        <button type="button" onClick={addRow} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">
          הוסף מקור
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {sources.map((source, index) => (
          <div key={`${source.slug}-${index}`} className="grid gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-stone-600">קישור או slug</span>
              <input
                value={source.slug}
                onChange={(event) => updateRow(index, 'slug', event.target.value)}
                placeholder="https://t.me/channel או @channel"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-stone-600">שם תצוגה</span>
              <input
                value={source.label}
                onChange={(event) => updateRow(index, 'label', event.target.value)}
                placeholder="למשל וסרמיליה"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-stone-600">שיוך קבוצה</span>
              <input
                value={source.teamLabel}
                onChange={(event) => updateRow(index, 'teamLabel', event.target.value)}
                placeholder="למשל הפועל באר שבע"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => removeRow(index)} className="w-full rounded-2xl border border-red-200 px-4 py-3 text-sm font-bold text-red-800">
                הסר
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-stone-500">נשמרים רק מקורות ציבוריים שניתן למשוך מהם דרך `t.me/s/...`.</div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {saving ? 'שומר...' : 'שמור מקורות'}
        </button>
      </div>

      {message ? <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700">{message}</div> : null}
    </section>
  );
}
