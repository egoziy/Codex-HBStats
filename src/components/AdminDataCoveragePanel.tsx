'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCoverageRow } from '@/lib/admin-data-coverage';

type SeasonOption = {
  id: string;
  name: string;
};

function formatDateTime(value: string | null) {
  if (!value) return 'עדיין לא בוצעה משיכה';
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusBadge({
  status,
  label,
}: {
  status: 'EMPTY' | 'STALE' | 'FRESH' | 'DONE';
  label: string;
}) {
  const tone =
    status === 'EMPTY'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : status === 'STALE'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : status === 'DONE'
          ? 'border-stone-200 bg-stone-100 text-stone-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900';

  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
      {label}: {value}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'rose' | 'emerald' | 'stone';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'rose'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-stone-200 bg-stone-100 text-stone-800';

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}

function buildResourceSelection(row: AdminCoverageRow) {
  if (row.status === 'EMPTY') {
    return ['teams', 'players', 'fixtures', 'standings'];
  }

  if (row.status === 'STALE') {
    const resources = ['fixtures', 'standings'];

    if (row.gamesCount > 0) {
      resources.push('events', 'statistics', 'lineups');
    }

    if (row.predictionsCount > 0 || row.gamesCount > 0) {
      resources.push('predictions', 'h2h', 'odds');
    }

    if (row.liveCount > 0 || row.gamesCount > 0) {
      resources.push('livescore');
    }

    return Array.from(new Set(resources));
  }

  return ['fixtures', 'standings'];
}

function buildTeamResourceSelection(row: AdminCoverageRow, teamRow: AdminCoverageRow['teamRows'][number]) {
  if (teamRow.status === 'EMPTY') {
    return ['teams', 'players', 'fixtures', 'standings'];
  }

  const resources = ['fixtures'];

  if (teamRow.standingsCount > 0 || row.standingsCount > 0) {
    resources.push('standings');
  }

  if (teamRow.gamesCount > 0) {
    resources.push('events', 'statistics', 'lineups');
  }

  if (teamRow.predictionsCount > 0 || teamRow.gamesCount > 0) {
    resources.push('predictions', 'h2h', 'odds');
  }

  return Array.from(new Set(resources));
}

function getActionLabel(status: AdminCoverageRow['status'] | AdminCoverageRow['teamRows'][number]['status']) {
  if (status === 'EMPTY') return 'משוך עכשיו';
  if (status === 'STALE') return 'עדכן עכשיו';
  if (status === 'FRESH') return 'רענן שוב';
  return 'בדוק שוב';
}

export default function AdminDataCoveragePanel({
  rows,
  seasons,
  initialSeasonId,
}: {
  rows: AdminCoverageRow[];
  seasons: SeasonOption[];
  initialSeasonId: string | null;
}) {
  const router = useRouter();
  const [selectedSeasonId, setSelectedSeasonId] = useState(initialSeasonId || seasons[0]?.id || '');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => row.seasonId === selectedSeasonId);
  }, [rows, selectedSeasonId]);

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const statusSummary = useMemo(() => {
    return filteredRows.reduce(
      (summary, row) => {
        summary[row.status] += 1;
        return summary;
      },
      { EMPTY: 0, STALE: 0, FRESH: 0, DONE: 0 }
    );
  }, [filteredRows]);

  function toggleRow(key: string) {
    setExpandedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function runFetch({
    actionKey,
    seasonYear,
    leagueId,
    teamSelection,
    resources,
  }: {
    actionKey: string;
    seasonYear: number;
    leagueId: number | null;
    teamSelection?: string;
    resources: string[];
  }) {
    if (!leagueId) {
      setFeedback('לא ניתן להפעיל משיכה עבור חתך בלי מזהה ליגה/מסגרת ב-API.');
      return;
    }

    setActiveActionKey(actionKey);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          season: String(seasonYear),
          leagueId: String(leagueId),
          teamSelection: teamSelection || 'all',
          resources,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'המשיכה נכשלה.');
      }

      startTransition(() => {
        router.refresh();
      });

      setFeedback('המשיכה הופעלה בהצלחה. הנתונים יתעדכנו מיד באדמין.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'המשיכה נכשלה.');
    } finally {
      setActiveActionKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-stone-500">עונה להצגה</div>
          <h3 className="mt-1 text-xl font-black text-stone-900">{selectedSeason?.name || 'בחר עונה'}</h3>
          <p className="mt-1 text-sm text-stone-500">המסך מציג רק את הנתונים של העונה שנבחרה, כדי לשמור על ניהול נוח וקצר.</p>
        </div>

        <label className="block min-w-[220px]">
          <span className="mb-2 block text-sm font-semibold text-stone-600">בחירת עונה</span>
          <select
            value={selectedSeasonId}
            onChange={(event) => setSelectedSeasonId(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-800"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
        לכל חתך אפשר עכשיו גם לראות אם כדאי למשוך, וגם להפעיל את המשיכה או העדכון ישירות מהשורה עצמה.
      </div>

      {feedback ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm font-medium text-stone-700 shadow-sm">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="אפשר למשוך" value={statusSummary.EMPTY} tone="amber" />
        <SummaryCard label="יש מה לעדכן" value={statusSummary.STALE} tone="rose" />
        <SummaryCard label="מעודכן" value={statusSummary.FRESH} tone="emerald" />
        <SummaryCard label="אין מה למשוך" value={statusSummary.DONE} tone="stone" />
      </div>

      {filteredRows.length ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-stone-900">{selectedSeason?.name}</h3>
              <p className="text-sm text-stone-500">תמונת מצב לפי ליגות, גביעים וקבוצות עם נתונים קיימים והמלצה למשיכה.</p>
            </div>
            <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700">
              {filteredRows.length} חתכים
            </div>
          </div>

          <div className="space-y-3">
            {filteredRows
              .slice()
              .sort(
                (a, b) =>
                  a.countryLabel.localeCompare(b.countryLabel, 'he') ||
                  a.competitionNameHe.localeCompare(b.competitionNameHe, 'he')
              )
              .map((row) => {
                const isExpanded = expandedKeys.includes(row.key);
                const rowActionKey = `row-${row.key}`;
                const rowResources = buildResourceSelection(row);

                return (
                  <article key={row.key} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.28em] text-stone-500">
                          <span>{row.countryLabel}</span>
                          <span className="text-stone-300">|</span>
                          <span>{row.competitionNameEn}</span>
                        </div>
                        <div className="text-xl font-black text-stone-900">{row.competitionNameHe}</div>
                        <div className="text-sm text-stone-600">{row.statusNote}</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={row.status} label={row.statusLabel} />
                        <div className="text-xs text-stone-500">משיכה אחרונה: {formatDateTime(row.lastFetchAt)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <CountPill label="קבוצות" value={row.teamsCount} />
                      <CountPill label="שחקנים" value={row.playersCount} />
                      <CountPill label="משחקים" value={row.gamesCount} />
                      <CountPill label="טבלה" value={row.standingsCount} />
                      <CountPill label="תחזיות" value={row.predictionsCount} />
                      <CountPill label="ראש בראש" value={row.h2hCount} />
                      <CountPill label="יחסים" value={row.oddsCount} />
                      <CountPill label="לייב" value={row.liveCount} />
                      <CountPill label="סהכ" value={row.totalCount} />
                    </div>

                    {row.latestStepSummary.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {row.latestStepSummary.map((step) => (
                          <span
                            key={`${row.key}-${step.key}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm"
                          >
                            {step.label}: {step.syncedCount}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
                      <div className="text-xs text-stone-500">עדכון תוכן אחרון: {formatDateTime(row.lastCoverageUpdateAt)}</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            runFetch({
                              actionKey: rowActionKey,
                              seasonYear: row.seasonYear,
                              leagueId: row.competitionApiId,
                              resources: rowResources,
                            })
                          }
                          disabled={activeActionKey === rowActionKey || isPending}
                          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                        >
                          {activeActionKey === rowActionKey ? 'מעדכן...' : getActionLabel(row.status)}
                        </button>
                        {row.teamRows.length ? (
                          <button
                            type="button"
                            onClick={() => toggleRow(row.key)}
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                          >
                            {isExpanded ? 'הסתר קבוצות' : `הצג קבוצות (${row.teamRows.length})`}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                        <table className="min-w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-stone-200 text-stone-500">
                              <th className="px-3 py-3">קבוצה</th>
                              <th className="px-3 py-3">סגל</th>
                              <th className="px-3 py-3">שחקנים</th>
                              <th className="px-3 py-3">משחקים</th>
                              <th className="px-3 py-3">טבלה</th>
                              <th className="px-3 py-3">תחזיות</th>
                              <th className="px-3 py-3">יחסים</th>
                              <th className="px-3 py-3">לייב</th>
                              <th className="px-3 py-3">משיכה אחרונה</th>
                              <th className="px-3 py-3">פעולה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.teamRows.map((teamRow) => {
                              const teamActionKey = `team-${teamRow.key}`;

                              return (
                                <tr key={teamRow.key} className="border-b border-stone-100 align-top">
                                  <td className="px-3 py-3 font-bold text-stone-900">{teamRow.teamNameHe || teamRow.teamNameEn}</td>
                                  <td className="px-3 py-3">{teamRow.rosterPlayersCount}</td>
                                  <td className="px-3 py-3">{teamRow.playersCount}</td>
                                  <td className="px-3 py-3">{teamRow.gamesCount}</td>
                                  <td className="px-3 py-3">{teamRow.standingsCount}</td>
                                  <td className="px-3 py-3">{teamRow.predictionsCount}</td>
                                  <td className="px-3 py-3">{teamRow.oddsCount}</td>
                                  <td className="px-3 py-3">{teamRow.liveCount}</td>
                                  <td className="px-3 py-3 text-xs text-stone-500">{formatDateTime(teamRow.lastFetchAt)}</td>
                                  <td className="px-3 py-3">
                                    <div className="flex min-w-[180px] flex-col items-start gap-2">
                                      <StatusBadge status={teamRow.status} label={teamRow.statusLabel} />
                                      <span className="text-xs leading-6 text-stone-500">{teamRow.statusNote}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          runFetch({
                                            actionKey: teamActionKey,
                                            seasonYear: row.seasonYear,
                                            leagueId: row.competitionApiId,
                                            teamSelection: teamRow.teamId,
                                            resources: buildTeamResourceSelection(row, teamRow),
                                          })
                                        }
                                        disabled={activeActionKey === teamActionKey || isPending}
                                        className="rounded-full bg-white px-3 py-2 text-xs font-bold text-stone-900 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
                                      >
                                        {activeActionKey === teamActionKey ? 'מריץ...' : getActionLabel(teamRow.status)}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
          אין כרגע נתוני כיסוי לעונה שנבחרה.
        </div>
      )}
    </div>
  );
}
