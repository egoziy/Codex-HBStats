'use client';

import { useState, useRef } from 'react';

export default function AdminDbTransferClient() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    if (type !== 'info') setTimeout(() => setMessage(null), 8000);
  };

  const handleExport = async () => {
    setExporting(true);
    showMessage('מייצא את בסיס הנתונים...', 'info');
    try {
      const res = await fetch('/api/admin/db-transfer');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'hbs_backup.sql';

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage(`ייצוא הושלם — ${filename} (${sizeMB}MB)`, 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      showMessage('לא נבחר קובץ', 'error');
      return;
    }

    if (!file.name.endsWith('.sql') && !file.name.endsWith('.dump')) {
      showMessage('הקובץ חייב להיות בפורמט .dump או .sql', 'error');
      return;
    }

    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    if (!confirm(`האם לייבא את הקובץ ${file.name} (${sizeMB}MB)?\n\nזה ימחק את כל הנתונים הקיימים ויחליף אותם בנתונים מהקובץ.`)) {
      return;
    }

    setImporting(true);
    setImportProgress(`מעלה ${file.name} (${sizeMB}MB)...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      setImportProgress('מייבא נתונים... זה יכול לקחת כמה דקות.');

      const res = await fetch('/api/admin/db-transfer', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      showMessage(`${data.message}`, 'success');
      setImportProgress('');

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      showMessage(e.message, 'error');
      setImportProgress('');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Message */}
      {message && (
        <div className={`rounded-2xl px-5 py-4 text-sm font-bold ${
          message.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
          message.type === 'error' ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Export */}
      <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-black text-stone-900">ייצוא בסיס נתונים</h2>
        <p className="mt-2 text-sm text-stone-600">
          מייצא את כל הנתונים כקובץ SQL — כולל טבלאות, נתונים סרוקים, משחקים, שחקנים, הגדרות.
          <br />
          הקובץ שנוצר ניתן לייבוא במחשב אחר.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting || importing}
          className="mt-5 rounded-full bg-stone-900 px-8 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {exporting ? 'מייצא...' : 'ייצוא DB לקובץ SQL'}
        </button>
      </div>

      {/* Import */}
      <div className="rounded-[28px] border-2 border-dashed border-amber-300 bg-amber-50 p-8">
        <h2 className="text-2xl font-black text-stone-900">ייבוא בסיס נתונים</h2>
        <p className="mt-2 text-sm text-stone-600">
          מייבא קובץ SQL שיוצא ממחשב אחר.
          <br />
          <span className="font-bold text-red-700">שים לב: הייבוא מחליף את כל הנתונים הקיימים!</span>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <label className="cursor-pointer rounded-full border-2 border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700 transition hover:border-stone-400">
            בחר קובץ SQL
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,.dump"
              className="hidden"
              onChange={() => {
                const file = fileInputRef.current?.files?.[0];
                if (file) setImportProgress(`קובץ נבחר: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
              }}
            />
          </label>

          <button
            onClick={handleImport}
            disabled={importing || exporting}
            className="rounded-full bg-amber-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            {importing ? 'מייבא...' : 'התחל ייבוא'}
          </button>
        </div>

        {importProgress && (
          <div className="mt-4 text-sm font-medium text-stone-600">
            {importProgress}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-black text-stone-900">הוראות העברת נתונים</h2>
        <div className="mt-4 space-y-3 text-sm text-stone-600">
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">1</span>
            <span><b>במחשב המקור:</b> לחץ על &quot;ייצוא DB לקובץ SQL&quot; — קובץ SQL יורד למחשב</span>
          </div>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">2</span>
            <span><b>העבר את הקובץ</b> למחשב היעד (USB, ענן, וכו&#39;)</span>
          </div>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">3</span>
            <span><b>במחשב היעד:</b> התקן PostgreSQL, צור DB בשם <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">hbs</code>, הגדר <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">.env</code></span>
          </div>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">4</span>
            <span><b>הרץ:</b> <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">npm install && npx prisma db push</code></span>
          </div>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">5</span>
            <span><b>הפעל את השרת</b> ולחץ &quot;בחר קובץ SQL&quot; → &quot;התחל ייבוא&quot;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
