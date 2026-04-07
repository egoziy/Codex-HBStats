'use client';

import { useState } from 'react';

export default function AdminCollapsible({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-right"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl font-black text-stone-900">{title}</span>
          {badge ? (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500">{badge}</span>
          ) : null}
        </div>
        <span className="text-2xl font-bold text-stone-500">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
