import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import AiChat from '@/components/AiChat';
import { ThemeProvider } from '@/components/ThemeProvider';

const heebo = Heebo({
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: 'ליגת הסטטיסטיקות',
  description: 'מערכת עברית לסטטיסטיקות כדורגל, ניתוח נתונים, משחקים, שחקנים וקבוצות.',
};

// Runs synchronously before first paint — sets data-theme/data-color from localStorage.
const noFlashScript = `(function(){try{var t=localStorage.getItem('hbs-theme')||'modern';var c=localStorage.getItem('hbs-color')||'red';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-color',c);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="bg-[#f4f6fb] text-slate-950">
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <ThemeProvider>
          <Navbar />
          <AiChat />
          <div className="site-banner border-b border-stone-200 bg-black">
            <div className="mx-auto max-w-7xl px-4 py-4">
              <img
                src="/banner-stats.png"
                alt="הדופק של טרנר במספרים"
                className="h-24 w-full rounded-[24px] border border-white/10 object-cover shadow-[0_18px_40px_rgba(0,0,0,0.28)] md:h-28"
              />
            </div>
          </div>
          <main className="min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
