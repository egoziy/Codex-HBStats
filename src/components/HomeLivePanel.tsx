'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HomepageLiveSnapshot } from '@/lib/home-live';

type LiveGroup = {
  id: string;
  countryLabel: string;
  countryFlagUrl: string | null;
  leagueLabel: string;
  items: HomepageLiveSnapshot[];
  isIsraeliPriority: boolean;
};

const israeliCompetitionKeywords = [
  'israel', 'ligat ha', 'toto cup', 'state cup', 'winner cup',
  'ישראל', 'ליגת העל', 'ליגה לאומית', 'גביע המדינה', 'גביע הטוטו',
];

const israeliTeamKeywords = [
  'hapoel', 'maccabi', 'beitar', 'bnei', 'ironi',
  'ashdod', 'sakhnin', 'beer sheva', 'jerusalem', 'tel aviv',
  'haifa', 'netanya', 'petah tikva',
  'הפועל', 'מכבי', 'בית"ר', 'ביתר', 'בני', 'עירוני', 'מ.ס.', 'סקציה',
];

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase();
}

function includesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatLiveRoundLabel(value: string) {
  const normalized = value.trim();
  const regularSeasonMatch = normalized.match(/^Regular Season\s*-\s*(\d+)$/i);
  if (regularSeasonMatch) {
    return `מחזור ${regularSeasonMatch[1]}`;
  }

  if (/^Regular Season$/i.test(normalized)) {
    return 'מחזור';
  }

  return value;
}

function isIsraeliPriorityItem(item: HomepageLiveSnapshot) {
  const country = normalizeText(item.countryLabel);
  const league = normalizeText(item.leagueLabel);
  const teams = normalizeText(`${item.homeTeamName} ${item.awayTeamName}`);

  if (country.includes('israel') || country.includes('ישראל')) {
    return true;
  }

  if (includesAnyKeyword(league, israeliCompetitionKeywords)) {
    return true;
  }

  return includesAnyKeyword(teams, israeliTeamKeywords);
}

function buildGroups(items: HomepageLiveSnapshot[]) {
  const groups = new Map<string, LiveGroup>();

  for (const item of items) {
    const key = `${item.countryLabel}__${item.leagueLabel}`;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      existing.isIsraeliPriority = existing.isIsraeliPriority || isIsraeliPriorityItem(item);
      continue;
    }

    groups.set(key, {
      id: key,
      countryLabel: item.countryLabel,
      countryFlagUrl: item.countryFlagUrl,
      leagueLabel: item.leagueLabel,
      items: [item],
      isIsraeliPriority: isIsraeliPriorityItem(item),
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => (a.fixtureId ?? 0) - (b.fixtureId ?? 0)),
    }))
    .sort((a, b) => {
      if (a.isIsraeliPriority !== b.isIsraeliPriority) {
        return a.isIsraeliPriority ? -1 : 1;
      }

      const countryCompare = a.countryLabel.localeCompare(b.countryLabel, 'he');
      if (countryCompare !== 0) return countryCompare;
      return a.leagueLabel.localeCompare(b.leagueLabel, 'he');
    });
}

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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(initialItems[0]?.id || null);

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

  const groups = useMemo(() => buildGroups(items), [items]);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-[22px] border border-stone-200 bg-stone-50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {group.countryFlagUrl ? (
                <img src={group.countryFlagUrl} alt={group.countryLabel} className="h-5 w-7 rounded-sm object-cover" />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-stone-900">{group.leagueLabel}</div>
                <div className="truncate text-xs font-semibold text-stone-500">{group.countryLabel}</div>
              </div>
            </div>
            <div className="rounded-full bg-red-100 px-3 py-1 text-[11px] font-bold text-red-900">{group.items.length} משחקים</div>
          </div>

          <div className="divide-y divide-stone-200">
            {group.items.map((item) => {
              const expanded = expandedItemId === item.id;

              return (
                <div key={item.id} className="bg-white">
                  <div
                    className="cursor-pointer px-4 py-3 transition hover:bg-red-50"
                    onClick={() => setExpandedItemId((current) => (current === item.id ? null : item.id))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setExpandedItemId((current) => (current === item.id ? null : item.id));
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black leading-5 text-stone-900">
                          {item.homeTeamName} - {item.awayTeamName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                          <span>{formatLiveRoundLabel(item.roundLabel)}</span>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-800">
                            {expanded ? 'הסתר אירועים' : `${item.eventCount} אירועים`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="inline-flex rounded-full bg-red-700 px-2.5 py-1 text-[11px] font-black text-white">
                          {item.minuteLabel}
                        </span>
                        <span className="min-w-[3.5rem] text-right text-lg font-black text-stone-900">{item.scoreLabel}</span>
                      </div>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="border-t border-stone-200 bg-stone-50 px-4 py-4">
                      <LiveEventsPanel item={item} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center text-sm text-stone-500">
          נכון לעכשיו אין משחקים בלייב
        </div>
      ) : null}
    </div>
  );
}

function LiveEventsPanel({ item }: { item: HomepageLiveSnapshot }) {
  if (!item.events.length) {
    return <div className="text-sm text-stone-500">אין כרגע אירועים שמורים למשחק הזה.</div>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {item.events.map((event) => (
        <div key={event.id} className="rounded-2xl border border-stone-200 bg-white px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {event.iconPath ? (
                <img src={event.iconPath} alt={event.typeLabel} className="h-10 w-10 rounded-2xl object-contain shadow-sm" />
              ) : (
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${event.iconClassName}`}
                >
                  {event.iconLabel}
                </span>
              )}
              <div>
                <div className="text-xs font-black text-stone-900">{event.typeLabel}</div>
                <div className="text-[11px] text-stone-500">{event.teamName}</div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-stone-500">{event.minuteLabel}</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-stone-800">{event.primaryText}</div>
          {event.secondaryText ? <div className="mt-1 text-[11px] text-stone-500">{event.secondaryText}</div> : null}
        </div>
      ))}
    </div>
  );
}
