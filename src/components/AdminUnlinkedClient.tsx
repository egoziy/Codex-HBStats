'use client';

import { useMemo, useState } from 'react';

type SquadPlayer = { id: string; nameHe: string; nameEn: string; jerseyNumber: number | null };
type LineupRow = {
  id: string;
  participantName: string;
  jerseyNumber: number | null;
  role: string;
  gameId: string;
  gameDate: string | null;
  teamId: string | null;
  teamName: string | null;
  opponentName: string | null;
};
type EventRow = {
  id: string;
  participantName: string;
  type: string;
  minute: number;
  gameId: string;
  gameDate: string | null;
  teamId: string | null;
  teamName: string | null;
  opponentName: string | null;
};

export default function AdminUnlinkedClient({
  unlinkedLineups,
  unlinkedEvents,
  squads,
}: {
  unlinkedLineups: LineupRow[];
  unlinkedEvents: EventRow[];
  squads: Record<string, SquadPlayer[]>;
}) {
  const [tab, setTab] = useState<'lineups' | 'events'>(unlinkedLineups.length >= unlinkedEvents.length ? 'lineups' : 'events');
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);

  async function link(kind: 'lineup' | 'event', id: string, playerId: string | '__dismiss__') {
    setBusy((b) => ({ ...b, [id]: true }));
    setError(null);
    try {
      const res = await fetch('/api/admin/unlinked/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, playerId: playerId === '__dismiss__' ? null : playerId, dismiss: playerId === '__dismiss__' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed');
      }
      setDismissed((d) => ({ ...d, [id]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  const visibleLineups = useMemo(() => unlinkedLineups.filter((r) => !dismissed[r.id]), [unlinkedLineups, dismissed]);
  const visibleEvents = useMemo(() => unlinkedEvents.filter((r) => !dismissed[r.id]), [unlinkedEvents, dismissed]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('lineups')}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'lineups' ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}
        >
          הרכבים ({visibleLineups.length})
        </button>
        <button
          onClick={() => setTab('events')}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'events' ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}
        >
          אירועים ({visibleEvents.length})
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {tab === 'lineups' && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {visibleLineups.length === 0 ? (
            <div className="p-8 text-center text-stone-500">אין רשומות לטיפול</div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-100">
                <tr>
                  <th className="px-3 py-2">משחק</th>
                  <th className="px-3 py-2">קבוצה</th>
                  <th className="px-3 py-2">שם מ-Flashscore</th>
                  <th className="px-3 py-2">תפקיד</th>
                  <th className="px-3 py-2">בחירת שחקן</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleLineups.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    squad={row.teamId ? squads[row.teamId] || [] : []}
                    busy={!!busy[row.id]}
                    onSelect={(playerId) => link('lineup', row.id, playerId)}
                  >
                    <span className="font-bold">{row.participantName}</span>
                    {row.jerseyNumber != null && <span className="ms-2 text-stone-500">#{row.jerseyNumber}</span>}
                  </Row>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {visibleEvents.length === 0 ? (
            <div className="p-8 text-center text-stone-500">אין אירועים לטיפול</div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-100">
                <tr>
                  <th className="px-3 py-2">משחק</th>
                  <th className="px-3 py-2">קבוצה</th>
                  <th className="px-3 py-2">שם מ-Flashscore</th>
                  <th className="px-3 py-2">סוג</th>
                  <th className="px-3 py-2">בחירת שחקן</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    squad={row.teamId ? squads[row.teamId] || [] : []}
                    busy={!!busy[row.id]}
                    onSelect={(playerId) => link('event', row.id, playerId)}
                  >
                    <span className="font-bold">{row.participantName}</span>
                    <span className="ms-2 text-stone-500">דקה {row.minute}</span>
                  </Row>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  squad,
  busy,
  onSelect,
  children,
}: {
  row: { gameId: string; gameDate: string | null; teamName: string | null; opponentName: string | null; role?: string; type?: string };
  squad: SquadPlayer[];
  busy: boolean;
  onSelect: (playerId: string) => void;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<string>('');
  return (
    <tr className="border-t border-stone-100">
      <td className="px-3 py-3 align-top">
        <a href={`/games/${row.gameId}`} target="_blank" className="text-stone-900 underline">
          {row.gameDate?.slice(0, 10) ?? '?'} — מול {row.opponentName ?? '?'}
        </a>
      </td>
      <td className="px-3 py-3 align-top">{row.teamName ?? '?'}</td>
      <td className="px-3 py-3 align-top">{children}</td>
      <td className="px-3 py-3 align-top text-stone-600">{row.role ?? row.type ?? ''}</td>
      <td className="px-3 py-3 align-top">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded border border-stone-300 px-2 py-1"
        >
          <option value="">— בחר שחקן —</option>
          {squad.map((p) => (
            <option key={p.id} value={p.id}>
              {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ''}{p.nameHe || p.nameEn}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex gap-2">
          <button
            disabled={busy || !value}
            onClick={() => onSelect(value)}
            className="rounded bg-stone-900 px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
          >
            קישור
          </button>
          <button
            disabled={busy}
            onClick={() => onSelect('__dismiss__')}
            className="rounded border border-stone-300 px-3 py-1 text-sm text-stone-700 disabled:opacity-40"
          >
            דחה
          </button>
        </div>
      </td>
    </tr>
  );
}
