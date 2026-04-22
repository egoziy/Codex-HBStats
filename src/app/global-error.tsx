'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-xl font-black">אירעה שגיאה קריטית</h2>
          <button
            onClick={reset}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
