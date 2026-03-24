import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'ליגת הסטטיסטיקות',
  description: 'מערכת עברית לסטטיסטיקות כדורגל, ניתוח נתונים, משחקים, שחקנים וקבוצות.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-stone-100 text-stone-900">
        <Navbar />
        <div className="border-b border-stone-200 bg-black">
          <div className="mx-auto max-w-7xl px-4 py-4">
            <img
              src="/banner.png"
              alt="הדופק של טרנר במספרים"
              className="w-full rounded-[24px] border border-white/10 object-cover shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
            />
          </div>
        </div>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
