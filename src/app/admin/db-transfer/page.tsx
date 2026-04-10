import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import AdminDbTransferClient from '@/components/AdminDbTransferClient';

export const dynamic = 'force-dynamic';

export default async function AdminDbTransferPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
            <Link href="/admin" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">חזרה לאדמין</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link href="/admin" className="text-sm font-bold text-red-800">חזרה לאדמין</Link>
          <h1 className="mt-2 text-4xl font-black text-stone-900">העברת בסיס נתונים</h1>
          <p className="mt-2 text-sm text-stone-600">
            ייצוא וייבוא של כל הנתונים — להעברה בין מחשבים ללא צורך בסריקה מחדש.
          </p>
        </div>
        <AdminDbTransferClient />
      </div>
    </div>
  );
}
