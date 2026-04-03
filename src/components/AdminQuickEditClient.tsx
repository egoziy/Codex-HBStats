'use client';

import type { ChangeEvent } from 'react';
import { useMemo, useRef, useState } from 'react';

type SeasonOption = {
  id: string;
  name: string;
};

type TeamOption = {
  id: string;
  nameHe: string;
  nameEn: string;
};

type PlayerRow = {
  id: string;
  teamId: string;
  teamName: string;
  nameHe: string;
  nameEn: string;
  firstNameHe: string | null;
  lastNameHe: string | null;
  position: string | null;
  jerseyNumber: number | null;
  photoUrl: string | null;
};

type EventPlayerOption = {
  id: string;
  nameHe: string;
  nameEn: string;
  teamId: string;
};

type EventRow = {
  id: string;
  gameId: string;
  gameLabel: string;
  teamId: string | null;
  teamName: string | null;
  minute: number;
  extraMinute: number | null;
  type: string;
  playerId: string | null;
  relatedPlayerId: string | null;
  assistPlayerId: string | null;
  notesHe: string | null;
  sortOrder: number;
};

type GameOption = {
  id: string;
  label: string;
  homeTeamId: string;
  awayTeamId: string;
};

const EVENT_TYPES = [
  'GOAL',
  'ASSIST',
  'YELLOW_CARD',
  'RED_CARD',
  'SUBSTITUTION_IN',
  'SUBSTITUTION_OUT',
  'OWN_GOAL',
  'PENALTY_GOAL',
  'PENALTY_MISSED',
] as const;

type TabKey = 'players' | 'events';

const PLAYER_EXPORT_HEADERS = [
  'id',
  'teamId',
  'teamName',
  'nameHe',
  'nameEn',
  'firstNameHe',
  'lastNameHe',
  'position',
  'jerseyNumber',
  'photoUrl',
] as const;

export default function AdminQuickEditClient({
  seasons,
  selectedSeasonId,
  teams,
  players,
  games,
  events,
  playersByTeam,
}: {
  seasons: SeasonOption[];
  selectedSeasonId: string;
  teams: TeamOption[];
  players: PlayerRow[];
  games: GameOption[];
  events: EventRow[];
  playersByTeam: EventPlayerOption[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('players');

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-stone-900">עריכה מהירה</h1>
            <p className="mt-2 text-sm text-stone-600">
              מסך מהיר לעריכת שחקנים ואירועי משחק בטבלה, בנוסף למסכי העריכה המלאים שכבר קיימים.
            </p>
          </div>

          <form action="/admin/quick-edit" className="flex items-center gap-3">
            <select
              name="season"
              defaultValue={selectedSeasonId}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
            <button className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">טען עונה</button>
          </form>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('players')}
            className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === 'players' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}
          >
            שחקנים
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === 'events' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}
          >
            אירועי משחק
          </button>
        </div>
      </section>

      {activeTab === 'players' ? <QuickPlayersTable teams={teams} players={players} /> : null}
      {activeTab === 'events' ? <QuickEventsTable teams={teams} games={games} events={events} players={playersByTeam} /> : null}
    </div>
  );
}

function csvEscape(value: string | number | null | undefined) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildPlayersCsv(rows: PlayerRow[]) {
  const header = PLAYER_EXPORT_HEADERS.join(',');
  const body = rows
    .map((row) =>
      [
        row.id,
        row.teamId,
        row.teamName,
        row.nameHe,
        row.nameEn,
        row.firstNameHe || '',
        row.lastNameHe || '',
        row.position || '',
        row.jerseyNumber ?? '',
        row.photoUrl || '',
      ]
        .map(csvEscape)
        .join(',')
    )
    .join('\n');

  return `\uFEFF${header}\n${body}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function normalizeImportedPlayers(text: string) {
  const parsedRows = parseCsv(text);
  if (parsedRows.length < 2) {
    return [];
  }

  const headers = parsedRows[0].map((cell) => cell.replace(/^\uFEFF/, '').trim());

  return parsedRows.slice(1).map((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
    const rawJerseyNumber = record.jerseyNumber?.trim();
    const parsedJerseyNumber = rawJerseyNumber ? Number(rawJerseyNumber) : null;

    return {
      id: record.id?.trim() || '',
      nameHe: record.nameHe?.trim() || '',
      nameEn: record.nameEn?.trim() || '',
      firstNameHe: record.firstNameHe?.trim() || null,
      lastNameHe: record.lastNameHe?.trim() || null,
      position: record.position?.trim() || null,
      jerseyNumber: Number.isFinite(parsedJerseyNumber) ? parsedJerseyNumber : null,
      photoUrl: record.photoUrl?.trim() || null,
    };
  });
}

function QuickPlayersTable({ teams, players }: { teams: TeamOption[]; players: PlayerRow[] }) {
  const [teamFilter, setTeamFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(players);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (teamFilter !== 'all' && row.teamId !== teamFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [row.nameHe, row.nameEn, row.teamName, row.position || '', row.firstNameHe || '', row.lastNameHe || '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, rows, teamFilter]);

  async function saveRow(row: PlayerRow) {
    setSavingId(row.id);
    setMessage('');

    const response = await fetch('/api/players', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: row.id,
        nameHe: row.nameHe,
        nameEn: row.nameEn,
        firstNameHe: row.firstNameHe,
        lastNameHe: row.lastNameHe,
        position: row.position,
        jerseyNumber: row.jerseyNumber,
        photoUrl: row.photoUrl,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setSavingId(null);

    if (!response.ok) {
      setMessage(payload.error || 'שמירת השחקן נכשלה');
      return;
    }

    setMessage('שינויי השחקנים נשמרו.');
  }

  function exportRows() {
    const csv = buildPlayersCsv(visibleRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const teamLabel = teamFilter === 'all' ? 'all-teams' : rows.find((row) => row.teamId === teamFilter)?.teamName || 'team';
    anchor.href = url;
    anchor.download = `players-${teamLabel}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage('');

    try {
      const text = await file.text();
      const importedRows = normalizeImportedPlayers(text).filter((row) => row.id);

      if (importedRows.length === 0) {
        setMessage('לא נמצאו שורות תקינות לייבוא.');
        return;
      }

      const importedById = new Map(importedRows.map((row) => [row.id, row]));
      const matchedRows = rows.filter((row) => importedById.has(row.id));
      const changedRows = matchedRows
        .map((row) => {
          const imported = importedById.get(row.id)!;
          return {
            ...row,
            nameHe: imported.nameHe || row.nameHe,
            nameEn: imported.nameEn || row.nameEn,
            firstNameHe: imported.firstNameHe,
            lastNameHe: imported.lastNameHe,
            position: imported.position,
            jerseyNumber: imported.jerseyNumber,
            photoUrl: imported.photoUrl,
          };
        })
        .filter((row, index) => {
          const original = matchedRows[index];
          if (!original) return false;

          return (
            row.nameHe !== original.nameHe ||
            row.nameEn !== original.nameEn ||
            row.firstNameHe !== original.firstNameHe ||
            row.lastNameHe !== original.lastNameHe ||
            row.position !== original.position ||
            row.jerseyNumber !== original.jerseyNumber ||
            row.photoUrl !== original.photoUrl
          );
        });

      if (changedRows.length === 0) {
        setMessage('לא נמצאו שחקנים תואמים לעדכון.');
        return;
      }

      let successCount = 0;
      const failures: string[] = [];

      for (const row of changedRows) {
        const response = await fetch('/api/players', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.id,
            nameHe: row.nameHe,
            nameEn: row.nameEn,
            firstNameHe: row.firstNameHe,
            lastNameHe: row.lastNameHe,
            position: row.position,
            jerseyNumber: row.jerseyNumber,
            photoUrl: row.photoUrl,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          failures.push(payload.details ? `${row.nameHe || row.nameEn}: ${payload.details}` : payload.error || `שמירה נכשלה עבור ${row.nameHe || row.nameEn}`);
          continue;
        }

        successCount += 1;
      }

      const changedMap = new Map(changedRows.map((row) => [row.id, row]));
      setRows((current) => current.map((row) => (changedMap.has(row.id) ? changedMap.get(row.id)! : row)));
      setMessage(
        failures.length > 0
          ? `עודכנו ${successCount} שחקנים, ${failures.length} נכשלו. ${failures[0]}`
          : `יובאו ועודכנו ${successCount} שחקנים.`
      );
    } catch (error: any) {
      setMessage(error?.message || 'ייבוא הקובץ נכשל.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  }

  function updateRow(id: string, field: keyof PlayerRow, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                field === 'jerseyNumber'
                  ? value.trim()
                    ? Number(value)
                    : null
                  : value,
            }
          : row
      )
    );
  }

  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900">עריכת שחקנים מהירה</h2>
          <p className="mt-2 text-sm text-stone-600">שדות עיקריים לעריכה מהירה בלי להיכנס לכל כרטיס שחקן.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
          <button type="button" onClick={exportRows} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">
            הורד קובץ לאקסל
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {isImporting ? 'מייבא...' : 'טען קובץ שינויים'}
          </button>
          {message ? <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">{message}</div> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש שחקן"
          className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
        />
        <select
          value={teamFilter}
          onChange={(event) => setTeamFilter(event.target.value)}
          className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
        >
          <option value="all">כל הקבוצות</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.nameHe || team.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-stone-100 text-xs text-stone-500">
            <tr>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">שם בעברית</th>
              <th className="px-3 py-3">שם באנגלית</th>
              <th className="px-3 py-3">שם פרטי</th>
              <th className="px-3 py-3">שם משפחה</th>
              <th className="px-3 py-3">עמדה</th>
              <th className="px-3 py-3">מספר</th>
              <th className="px-3 py-3">שמור</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-stone-100">
                <td className="px-3 py-3 text-sm font-semibold text-stone-700">{row.teamName}</td>
                <td className="px-3 py-3">
                  <input value={row.nameHe} onChange={(event) => updateRow(row.id, 'nameHe', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.nameEn} onChange={(event) => updateRow(row.id, 'nameEn', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.firstNameHe || ''} onChange={(event) => updateRow(row.id, 'firstNameHe', event.target.value)} className="w-32 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.lastNameHe || ''} onChange={(event) => updateRow(row.id, 'lastNameHe', event.target.value)} className="w-32 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.position || ''} onChange={(event) => updateRow(row.id, 'position', event.target.value)} className="w-28 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.jerseyNumber ?? ''} onChange={(event) => updateRow(row.id, 'jerseyNumber', event.target.value)} className="w-20 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => saveRow(row)}
                    disabled={savingId === row.id}
                    className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {savingId === row.id ? 'שומר...' : 'שמור'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuickEventsTable({
  teams,
  games,
  events,
  players,
}: {
  teams: TeamOption[];
  games: GameOption[];
  events: EventRow[];
  players: EventPlayerOption[];
}) {
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [rows, setRows] = useState(events);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [newEvent, setNewEvent] = useState({
    minute: '0',
    extraMinute: '',
    type: 'GOAL',
    teamId: '',
    playerId: '',
    relatedPlayerId: '',
    assistPlayerId: '',
    notesHe: '',
    sortOrder: '0',
  });

  const selectedGame = games.find((game) => game.id === gameId) || null;
  const filteredRows = useMemo(() => rows.filter((row) => row.gameId === gameId), [gameId, rows]);
  const teamScopedPlayers = useMemo(
    () =>
      selectedGame
        ? players.filter((player) => player.teamId === selectedGame.homeTeamId || player.teamId === selectedGame.awayTeamId)
        : players,
    [players, selectedGame]
  );

  function patchRow(id: string, field: keyof EventRow, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                field === 'minute' || field === 'sortOrder'
                  ? Number(value || 0)
                  : field === 'extraMinute'
                    ? value.trim()
                      ? Number(value)
                      : null
                    : value || null,
            }
          : row
      )
    );
  }

  async function saveRow(row: EventRow) {
    setSavingId(row.id);
    setMessage('');

    const response = await fetch('/api/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: row.id,
        minute: row.minute,
        extraMinute: row.extraMinute,
        type: row.type,
        teamId: row.teamId,
        playerId: row.playerId,
        relatedPlayerId: row.relatedPlayerId,
        assistPlayerId: row.assistPlayerId,
        notesHe: row.notesHe,
        sortOrder: row.sortOrder,
        team: row.teamName || '',
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setSavingId(null);

    if (!response.ok) {
      setMessage(payload.error || 'שמירת האירוע נכשלה');
      return;
    }

    setMessage('שינויי האירועים נשמרו.');
  }

  async function deleteRow(id: string) {
    if (!confirm('למחוק את האירוע הזה?')) return;

    const response = await fetch(`/api/events?id=${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage('מחיקת האירוע נכשלה');
      return;
    }

    setRows((current) => current.filter((row) => row.id !== id));
    setMessage('האירוע נמחק.');
  }

  async function createEvent() {
    if (!gameId || !newEvent.teamId) {
      setMessage('צריך לבחור משחק וקבוצה.');
      return;
    }

    const team = teams.find((item) => item.id === newEvent.teamId);
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId,
        minute: Number(newEvent.minute || 0),
        extraMinute: newEvent.extraMinute.trim() ? Number(newEvent.extraMinute) : null,
        type: newEvent.type,
        teamId: newEvent.teamId,
        team: team?.nameHe || team?.nameEn || '',
        playerId: newEvent.playerId || null,
        relatedPlayerId: newEvent.relatedPlayerId || null,
        assistPlayerId: newEvent.assistPlayerId || null,
        notesHe: newEvent.notesHe || null,
        sortOrder: Number(newEvent.sortOrder || 0),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || 'יצירת האירוע נכשלה');
      return;
    }

    const playerName = teamScopedPlayers.find((player) => player.id === payload.playerId);
    const relatedPlayerName = teamScopedPlayers.find((player) => player.id === payload.relatedPlayerId);
    setRows((current) => [
      {
        id: payload.id,
        gameId,
        gameLabel: selectedGame?.label || '',
        teamId: payload.teamId,
        teamName: team?.nameHe || team?.nameEn || '',
        minute: payload.minute,
        extraMinute: payload.extraMinute,
        type: payload.type,
        playerId: payload.playerId,
        relatedPlayerId: payload.relatedPlayerId,
        assistPlayerId: payload.assistPlayerId,
        notesHe: payload.notesHe,
        sortOrder: payload.sortOrder,
      },
      ...current,
    ]);
    setNewEvent({
      minute: '0',
      extraMinute: '',
      type: 'GOAL',
      teamId: '',
      playerId: '',
      relatedPlayerId: '',
      assistPlayerId: '',
      notesHe: '',
      sortOrder: '0',
    });
    setMessage(`האירוע נוסף${playerName ? ` עבור ${playerName.nameHe || playerName.nameEn}` : ''}${relatedPlayerName ? '.' : '.'}`);
  }

  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900">עריכת אירועים מהירה</h2>
          <p className="mt-2 text-sm text-stone-600">עדכון דקות, סוג אירוע, שחקן, מבשל והערות מתוך טבלה אחת.</p>
        </div>
        {message ? <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">{message}</div> : null}
      </div>

      <div className="mt-5">
        <select
          value={gameId}
          onChange={(event) => setGameId(event.target.value)}
          className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-[24px] border border-stone-200">
        <table className="min-w-full text-right">
          <thead className="bg-stone-100 text-xs text-stone-500">
            <tr>
              <th className="px-3 py-3">דקה</th>
              <th className="px-3 py-3">תוספת</th>
              <th className="px-3 py-3">סוג</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">שחקן קשור</th>
              <th className="px-3 py-3">מבשל</th>
              <th className="px-3 py-3">הערה</th>
              <th className="px-3 py-3">מיון</th>
              <th className="px-3 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-stone-100 bg-stone-50">
              <td className="px-3 py-3"><input value={newEvent.minute} onChange={(event) => setNewEvent((current) => ({ ...current, minute: event.target.value }))} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
              <td className="px-3 py-3"><input value={newEvent.extraMinute} onChange={(event) => setNewEvent((current) => ({ ...current, extraMinute: event.target.value }))} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
              <td className="px-3 py-3">
                <select value={newEvent.type} onChange={(event) => setNewEvent((current) => ({ ...current, type: event.target.value }))} className="w-36 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                  {EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </td>
              <td className="px-3 py-3">
                <select value={newEvent.teamId} onChange={(event) => setNewEvent((current) => ({ ...current, teamId: event.target.value }))} className="w-36 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                  <option value="">בחר</option>
                  {teams.filter((team) => !selectedGame || team.id === selectedGame.homeTeamId || team.id === selectedGame.awayTeamId).map((team) => (
                    <option key={team.id} value={team.id}>{team.nameHe || team.nameEn}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-3">
                <select value={newEvent.playerId} onChange={(event) => setNewEvent((current) => ({ ...current, playerId: event.target.value }))} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                  <option value="">ללא</option>
                  {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                </select>
              </td>
              <td className="px-3 py-3">
                <select value={newEvent.relatedPlayerId} onChange={(event) => setNewEvent((current) => ({ ...current, relatedPlayerId: event.target.value }))} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                  <option value="">ללא</option>
                  {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                </select>
              </td>
              <td className="px-3 py-3">
                <select value={newEvent.assistPlayerId} onChange={(event) => setNewEvent((current) => ({ ...current, assistPlayerId: event.target.value }))} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                  <option value="">ללא</option>
                  {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                </select>
              </td>
              <td className="px-3 py-3"><input value={newEvent.notesHe} onChange={(event) => setNewEvent((current) => ({ ...current, notesHe: event.target.value }))} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
              <td className="px-3 py-3"><input value={newEvent.sortOrder} onChange={(event) => setNewEvent((current) => ({ ...current, sortOrder: event.target.value }))} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
              <td className="px-3 py-3">
                <button type="button" onClick={createEvent} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white">הוסף</button>
              </td>
            </tr>

            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-stone-100">
                <td className="px-3 py-3"><input value={row.minute} onChange={(event) => patchRow(row.id, 'minute', event.target.value)} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
                <td className="px-3 py-3"><input value={row.extraMinute ?? ''} onChange={(event) => patchRow(row.id, 'extraMinute', event.target.value)} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
                <td className="px-3 py-3">
                  <select value={row.type} onChange={(event) => patchRow(row.id, 'type', event.target.value)} className="w-36 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                    {EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select value={row.teamId || ''} onChange={(event) => patchRow(row.id, 'teamId', event.target.value)} className="w-36 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                    <option value="">ללא</option>
                    {teams.filter((team) => !selectedGame || team.id === selectedGame.homeTeamId || team.id === selectedGame.awayTeamId).map((team) => (
                      <option key={team.id} value={team.id}>{team.nameHe || team.nameEn}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select value={row.playerId || ''} onChange={(event) => patchRow(row.id, 'playerId', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                    <option value="">ללא</option>
                    {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select value={row.relatedPlayerId || ''} onChange={(event) => patchRow(row.id, 'relatedPlayerId', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                    <option value="">ללא</option>
                    {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select value={row.assistPlayerId || ''} onChange={(event) => patchRow(row.id, 'assistPlayerId', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm">
                    <option value="">ללא</option>
                    {teamScopedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nameHe || player.nameEn}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3"><input value={row.notesHe || ''} onChange={(event) => patchRow(row.id, 'notesHe', event.target.value)} className="w-40 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
                <td className="px-3 py-3"><input value={row.sortOrder} onChange={(event) => patchRow(row.id, 'sortOrder', event.target.value)} className="w-16 rounded-xl border border-stone-300 px-2 py-2 text-sm" /></td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveRow(row)} disabled={savingId === row.id} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                      {savingId === row.id ? 'שומר...' : 'שמור'}
                    </button>
                    <button type="button" onClick={() => deleteRow(row.id)} className="rounded-full bg-red-100 px-4 py-2 text-sm font-bold text-red-700">
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
