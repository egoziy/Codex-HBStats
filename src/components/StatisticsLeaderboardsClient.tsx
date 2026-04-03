'use client';

import { useState } from 'react';

type LeaderboardDetail = {
  id: string;
  roundLabel: string;
  matchLabel: string;
  valueLabel: string;
  minuteLabel?: string | null;
  scoreLabel?: string | null;
  note?: string | null;
};

type LeaderboardPlayerRow = {
  playerId: string;
  playerName: string;
  teamName: string;
  value: number;
  details: LeaderboardDetail[];
  emptyMessage?: string;
};

type LeaderboardCardData = {
  title: string;
  valueLabel: string;
  rows: LeaderboardPlayerRow[];
};

export default function StatisticsLeaderboardsClient({ cards }: { cards: LeaderboardCardData[] }) {
  const [selected, setSelected] = useState<{
    cardTitle: string;
    playerName: string;
    teamName: string;
    value: number;
    valueLabel: string;
    details: LeaderboardDetail[];
    emptyMessage?: string;
  } | null>(null);

  return (
    <>
      <div className="xl:col-span-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <section key={card.title} className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-black text-slate-950">{card.title}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {card.rows.slice(0, 10).map((row, index) => (
                <button
                  key={`${card.title}-${row.playerId}`}
                  type="button"
                  onClick={() =>
                    setSelected({
                      cardTitle: card.title,
                      playerName: row.playerName,
                      teamName: row.teamName,
                      value: row.value,
                      valueLabel: card.valueLabel,
                      details: row.details,
                      emptyMessage: row.emptyMessage,
                    })
                  }
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-right transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 text-sm font-black text-slate-500">{index + 1}</div>
                    <div>
                      <div className="font-black text-slate-950">{row.playerName}</div>
                      <div className="text-xs text-slate-500">{row.teamName || '-'}</div>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-[#5e00ad]">{row.value}</div>
                </button>
              ))}
              {card.rows.length === 0 ? <div className="px-6 py-6 text-sm text-slate-400">אין נתונים זמינים כרגע.</div> : null}
            </div>
          </section>
        ))}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.32)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-xs font-bold tracking-[0.24em] text-slate-400">{selected.cardTitle}</div>
                <h3 className="mt-2 text-2xl font-black text-slate-950">{selected.playerName}</h3>
                <div className="mt-1 text-sm text-slate-500">
                  {selected.teamName} | {selected.value} {selected.valueLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700"
              >
                סגור
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              {selected.details.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-3 py-3">מחזור</th>
                        <th className="px-3 py-3">משחק</th>
                        <th className="px-3 py-3">ערך</th>
                        <th className="px-3 py-3">דקה</th>
                        <th className="px-3 py-3">תוצאה</th>
                        <th className="px-3 py-3">הערה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.details.map((detail) => (
                        <tr key={detail.id} className="border-b border-slate-100 text-sm text-slate-700">
                          <td className="px-3 py-3 font-semibold">{detail.roundLabel}</td>
                          <td className="px-3 py-3 font-semibold text-slate-950">{detail.matchLabel}</td>
                          <td className="px-3 py-3 font-black text-[#5e00ad]">{detail.valueLabel}</td>
                          <td className="px-3 py-3">{detail.minuteLabel || '-'}</td>
                          <td className="px-3 py-3">{detail.scoreLabel || '-'}</td>
                          <td className="px-3 py-3 text-slate-500">{detail.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  {selected.emptyMessage || 'אין פירוט מקומי זמין עבור שחקן זה בקטגוריה שנבחרה.'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
