'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HomepageLiveSnapshot } from '@/lib/home-live';

export default function HomeLivePanel({
  initialItems,
  selectedTeamId,
  limit,
}: {
  initialItems: HomepageLiveSnapshot[];
  selectedTeamId: string | null;
  limit?: number;
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const params = new URLSearchParams();
        if (selectedTeamId) params.set('teamId', selectedTeamId);
        if (limit) params.set('limit', String(limit));

        const response = await fetch(`/api/home/live?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const payload = await response.json();
        if (!cancelled && Array.isArray(payload.items)) {
          setItems(payload.items);
        }
      } catch {
        return;
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedTeamId, limit]);

  return (
    <div className="grid gap-2.5">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[18px] border border-stone-200 bg-stone-50 p-3 transition hover:border-red-400 hover:bg-white"
        >
          <Link href={item.gameHref} className="block">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex min-w-0 items-center gap-2 text-[11px] font-semibold text-stone-500">
                {item.countryFlagUrl ? (
                  <img
                    src={item.countryFlagUrl}
                    alt={item.countryLabel}
                    className="h-3.5 w-5 rounded-sm object-cover"
                  />
                ) : null}
                <span className="truncate">{item.countryLabel}</span>
                <span className="text-stone-300">•</span>
                <span className="truncate">{item.leagueLabel}</span>
              </div>
              <span className="shrink-0 rounded-full bg-red-700 px-2.5 py-1 text-[11px] font-black text-white">
                {item.minuteLabel}
              </span>
            </div>

            <div className="mt-2 rounded-2xl bg-white px-3 py-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="truncate text-right text-[14px] font-black leading-5 text-stone-900">
                  {item.homeTeamName}
                </div>
                <div className="text-[14px] font-black leading-5 text-stone-900">{item.scoreLabel}</div>
                <div className="truncate text-left text-[14px] font-black leading-5 text-stone-900">
                  {item.awayTeamName}
                </div>
              </div>
            </div>

            <div className="mt-1.5 text-[11px] text-stone-500">{item.roundLabel}</div>
          </Link>

          <LiveEventsDetails item={item} />
        </article>
      ))}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center text-sm text-stone-500">
          נכון לעכשיו אין משחקים בלייב
        </div>
      ) : null}
    </div>
  );
}

function LiveEventsDetails({ item }: { item: HomepageLiveSnapshot }) {
  if (!item.events.length) {
    return <div className="mt-2 text-[11px] text-stone-500">0 אירועים</div>;
  }

  return (
    <details className="mt-2 rounded-2xl border border-stone-200 bg-white p-2.5">
      <summary className="cursor-pointer list-none text-[11px] font-bold text-red-800 marker:hidden">
        {`הצג ${item.events.length} אירועים`}
      </summary>
      <div className="mt-2 grid gap-2">
        {item.events.map((event) => (
          <div key={event.id} className="rounded-2xl bg-stone-50 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${event.iconClassName}`}
                >
                  {event.iconLabel}
                </span>
                <div>
                  <div className="text-[11px] font-black text-stone-900">{event.typeLabel}</div>
                  <div className="text-[10px] text-stone-500">{event.teamName}</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-stone-500">{event.minuteLabel}</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold text-stone-800">{event.primaryText}</div>
            {event.secondaryText ? (
              <div className="mt-0.5 text-[11px] text-stone-500">{event.secondaryText}</div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
