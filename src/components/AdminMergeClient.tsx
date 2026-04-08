'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type PreviewChange = {
  type: 'update' | 'create' | 'skip';
  entity: string;
  scrapedName: string;
  matchedName?: string;
  matchedId?: string;
  fields: Record<string, { old: any; new: any }>;
  reason?: string;
};

export default function AdminMergeClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [previewData, setPreviewData] = useState<{ mergeId: string; changes: PreviewChange[]; summary: { updates: number; creates: number; skips: number } } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSource, setSelectedSource] = useState('footballOrgIl');
  const [selectedType, setSelectedType] = useState('standings');
  const [selectedSeason, setSelectedSeason] = useState('');

  async function apiCall(action: string, params?: Record<string, any>) {
    const response = await fetch('/api/admin/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action, ...params }),
    });
    return response.json();
  }

  async function runPreview() {
    setIsRunning(true);
    setMessage('מייצר תצוגה מקדימה...');
    try {
      const data = await apiCall('preview', {
        source: selectedSource,
        mergeType: selectedType,
        season: selectedSeason || undefined,
      });
      if (data.error) { setMessage(`שגיאה: ${data.error}`); return; }
      setPreviewData({ mergeId: data.mergeId, changes: data.changes || [], summary: data.preview });
      setMessage(`נמצאו ${data.preview.updates} עדכונים, ${data.preview.creates} חדשים, ${data.preview.skips} דולגו`);
    } catch (e: any) { setMessage(`שגיאה: ${e.message}`); }
    finally { setIsRunning(false); }
  }

  async function approveAndExecute() {
    if (!previewData?.mergeId) return;
    setIsRunning(true);
    setMessage('מאשר ומבצע מיזוג...');
    try {
      // Approve
      const approveResult = await apiCall('approve', { mergeId: previewData.mergeId });
      if (approveResult.error) { setMessage(`שגיאת אישור: ${approveResult.error}`); return; }

      // Execute
      const execResult = await apiCall('execute', { mergeId: previewData.mergeId });
      if (execResult.error) { setMessage(`שגיאת ביצוע: ${execResult.error}`); return; }

      setMessage(`מיזוג בוצע: ${execResult.updated} רשומות עודכנו${execResult.errors?.length ? `, ${execResult.errors.length} שגיאות` : ''}`);
      setPreviewData(null);
      startTransition(() => router.refresh());
    } catch (e: any) { setMessage(`שגיאה: ${e.message}`); }
    finally { setIsRunning(false); }
  }

  async function rollback(mergeId: string) {
    setIsRunning(true);
    setMessage('מבצע ביטול (rollback)...');
    try {
      const result = await apiCall('rollback', { mergeId });
      if (result.error) { setMessage(`שגיאה: ${result.error}`); return; }
      setMessage(`בוטל: ${result.reverted} רשומות הוחזרו למצב הקודם`);
      startTransition(() => router.refresh());
    } catch (e: any) { setMessage(`שגיאה: ${e.message}`); }
    finally { setIsRunning(false); }
  }

  async function cancelPreview() {
    if (previewData?.mergeId) {
      await apiCall('delete', { mergeId: previewData.mergeId }).catch(() => null);
    }
    setPreviewData(null);
    setMessage('');
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-[24px] border border-purple-200 bg-purple-50/80 p-5 shadow-sm">
        <h2 className="text-lg font-black text-stone-900">פעולות מיזוג</h2>
        <p className="mt-1 text-sm text-stone-600">
          תצוגה מקדימה → אישור → ביצוע. כל מיזוג ניתן לביטול (rollback).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold">
            <option value="footballOrgIl">football.org.il (IFA)</option>
            <option value="sport5">sport5.co.il</option>
          </select>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold">
            <option value="standings">טבלאות ליגה</option>
            <option value="players">סטטיסטיקות שחקנים</option>
            <option value="all">הכל</option>
          </select>
          <input type="text" value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)} placeholder="עונה (ריק = הכל)" className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm" />
          {!previewData ? (
            <button onClick={runPreview} disabled={isRunning} className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
              {isRunning ? 'עובד...' : 'תצוגה מקדימה'}
            </button>
          ) : (
            <>
              <button onClick={approveAndExecute} disabled={isRunning} className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
                אשר ובצע מיזוג ({previewData.summary.updates} עדכונים)
              </button>
              <button onClick={cancelPreview} disabled={isRunning} className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 disabled:opacity-50">
                בטל תצוגה מקדימה
              </button>
            </>
          )}
        </div>

        {message ? (
          <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-700">{message}</div>
        ) : null}
      </section>

      {/* Preview table */}
      {previewData && previewData.changes.length > 0 ? (
        <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-stone-900">
            שינויים מתוכננים ({previewData.changes.length}) — {previewData.summary.updates} עדכונים, {previewData.summary.creates} חדשים
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500">
                  <th className="px-3 py-2">פעולה</th>
                  <th className="px-3 py-2">רשומה (סריקה)</th>
                  <th className="px-3 py-2">התאמה ב-DB</th>
                  <th className="px-3 py-2">שדות</th>
                </tr>
              </thead>
              <tbody>
                {previewData.changes.map((change, i) => (
                  <tr key={i} className="border-b border-stone-50">
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${change.type === 'create' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {change.type === 'create' ? 'חדש' : 'עדכון'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold text-stone-800">{change.scrapedName}</td>
                    <td className="px-3 py-2 text-stone-600">{change.matchedName || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(change.fields).map(([field, { old: oldVal, new: newVal }]) => (
                          <span key={field} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {field}: {oldVal}→{newVal}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
