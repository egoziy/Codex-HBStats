'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center" dir="rtl">
      <h2 className="text-xl font-black text-stone-900">אירעה שגיאה</h2>
      <p className="text-sm text-stone-500">{error.message || 'שגיאה לא ידועה'}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800"
      >
        נסה שוב
      </button>
    </div>
  );
}
