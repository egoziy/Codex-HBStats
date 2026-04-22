import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center" dir="rtl">
      <h1 className="text-6xl font-black text-stone-200">404</h1>
      <h2 className="text-xl font-black text-stone-900">הדף לא נמצא</h2>
      <p className="text-sm text-stone-500">הדף שחיפשת לא קיים או הוסר.</p>
      <Link href="/" className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800">
        חזור לדף הבית
      </Link>
    </div>
  );
}
