'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { formatPlayerName } from '@/lib/player-display';

type TeamOption = {
  id: string;
  nameHe: string;
  nameEn: string;
};

type PlayerOption = {
  id: string;
  nameHe: string;
  nameEn: string;
  teamId: string;
  team: TeamOption;
};

type EventItem = {
  id: string;
  minute: number;
  extraMinute: number | null;
  type: string;
  team: string;
  teamId: string | null;
  sortOrder: number;
  notesHe: string | null;
  notesEn: string | null;
  playerId: string | null;
  participantName: string | null;
  relatedPlayerId: string | null;
  relatedParticipantName: string | null;
  assistPlayerId: string | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
  relatedPlayer: { id: string; nameHe: string; nameEn: string } | null;
};

type GameFormState = {
  dateTime: string;
  status: string;
  homeScore: string;
  awayScore: string;
  homePenalty: string;
  awayPenalty: string;
  roundNameHe: string;
  roundNameEn: string;
  refereeHe: string;
  refereeEn: string;
};

type EventFormState = {
  minute: string;
  extraMinute: string;
  type: string;
  teamId: string;
  playerId: string;
  participantName: string;
  relatedPlayerId: string;
  relatedParticipantName: string;
  assistPlayerId: string;
  notesHe: string;
  notesEn: string;
  sortOrder: string;
};

const eventTypeOptions = [
  { value: 'GOAL', label: 'שער' },
  { value: 'ASSIST', label: 'בישול' },
  { value: 'YELLOW_CARD', label: 'כרטיס צהוב' },
  { value: 'RED_CARD', label: 'כרטיס אדום' },
  { value: 'SUBSTITUTION_IN', label: 'חילוף נכנס' },
  { value: 'SUBSTITUTION_OUT', label: 'חילוף יוצא' },
  { value: 'OWN_GOAL', label: 'שער עצמי' },
  { value: 'PENALTY_GOAL', label: 'פנדל' },
  { value: 'PENALTY_MISSED', label: 'פנדל מוחמץ' },
] as const;

const gameStatusOptions = [
  { value: 'SCHEDULED', label: 'מתוכנן' },
  { value: 'ONGOING', label: 'במשחק' },
  { value: 'COMPLETED', label: 'הסתיים' },
  { value: 'CANCELLED', label: 'בוטל' },
] as const;

function toInputDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function buildGameForm(game: {
  dateTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenalty: number | null;
  awayPenalty: number | null;
  roundNameHe: string | null;
  roundNameEn: string | null;
  refereeHe: string | null;
  refereeEn: string | null;
}): GameFormState {
  return {
    dateTime: toInputDateTime(game.dateTime),
    status: game.status || 'SCHEDULED',
    homeScore: game.homeScore === null ? '' : String(game.homeScore),
    awayScore: game.awayScore === null ? '' : String(game.awayScore),
    homePenalty: game.homePenalty === null ? '' : String(game.homePenalty),
    awayPenalty: game.awayPenalty === null ? '' : String(game.awayPenalty),
    roundNameHe: game.roundNameHe || '',
    roundNameEn: game.roundNameEn || '',
    refereeHe: game.refereeHe || '',
    refereeEn: game.refereeEn || '',
  };
}

function buildEventForm(event: EventItem, defaultTeamId: string): EventFormState {
  return {
    minute: String(event.minute),
    extraMinute: event.extraMinute === null ? '' : String(event.extraMinute),
    type: event.type,
    teamId: event.teamId || defaultTeamId,
    playerId: event.playerId || '',
    participantName: event.participantName || '',
    relatedPlayerId: event.relatedPlayerId || '',
    relatedParticipantName: event.relatedParticipantName || '',
    assistPlayerId: event.assistPlayerId || '',
    notesHe: event.notesHe || '',
    notesEn: event.notesEn || '',
    sortOrder: String(event.sortOrder),
  };
}

function buildNewEventForm(defaultTeamId: string): EventFormState {
  return {
    minute: '0',
    extraMinute: '',
    type: 'GOAL',
    teamId: defaultTeamId,
    playerId: '',
    participantName: '',
    relatedPlayerId: '',
    relatedParticipantName: '',
    assistPlayerId: '',
    notesHe: '',
    notesEn: '',
    sortOrder: '0',
  };
}

export default function GameAdminQuickEditorClient({
  game,
  teams,
  players,
}: {
  game: {
    id: string;
    dateTime: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homePenalty: number | null;
    awayPenalty: number | null;
    roundNameHe: string | null;
    roundNameEn: string | null;
    refereeHe: string | null;
    refereeEn: string | null;
    events: EventItem[];
  };
  teams: TeamOption[];
  players: PlayerOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gameForm, setGameForm] = useState(() => buildGameForm(game));
  const [newEventForm, setNewEventForm] = useState(() => buildNewEventForm(teams[0]?.id || ''));
  const [gameMessage, setGameMessage] = useState('');
  const [eventMessage, setEventMessage] = useState('');

  async function parseResponsePayload(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  const playersByTeam = useMemo(() => {
    return new Map(
      teams.map((team) => [
        team.id,
        players.filter((player) => player.teamId === team.id),
      ])
    );
  }, [players, teams]);

  async function saveGame() {
    setGameMessage('');

    try {
      const response = await fetch('/api/games', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: game.id,
          dateTime: gameForm.dateTime,
          status: gameForm.status,
          homeScore: gameForm.homeScore,
          awayScore: gameForm.awayScore,
          homePenalty: gameForm.homePenalty,
          awayPenalty: gameForm.awayPenalty,
          roundNameHe: gameForm.roundNameHe,
          roundNameEn: gameForm.roundNameEn,
          refereeHe: gameForm.refereeHe,
          refereeEn: gameForm.refereeEn,
        }),
      });

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        setGameMessage(payload?.error || 'שמירת המשחק נכשלה.');
        return;
      }

      setGameMessage('נתוני המשחק נשמרו.');
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setGameMessage('שמירת המשחק נכשלה בגלל בעיית תקשורת עם השרת.');
    }
  }

  async function createEvent() {
    setEventMessage('');

    const teamLabel =
      teams.find((team) => team.id === newEventForm.teamId)?.nameHe ||
      teams.find((team) => team.id === newEventForm.teamId)?.nameEn ||
      '';

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          gameId: game.id,
          minute: newEventForm.minute,
          extraMinute: newEventForm.extraMinute,
          type: newEventForm.type,
          team: teamLabel,
          teamId: newEventForm.teamId,
          playerId: newEventForm.playerId || null,
          participantName: newEventForm.participantName || null,
          relatedPlayerId: newEventForm.relatedPlayerId || null,
          relatedParticipantName: newEventForm.relatedParticipantName || null,
          assistPlayerId: newEventForm.assistPlayerId || null,
          notesHe: newEventForm.notesHe,
          notesEn: newEventForm.notesEn,
          sortOrder: newEventForm.sortOrder,
        }),
      });

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        setEventMessage(payload?.error || 'הוספת האירוע נכשלה.');
        return;
      }

      setEventMessage('האירוע נוסף.');
      setNewEventForm(buildNewEventForm(newEventForm.teamId));
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setEventMessage('הוספת האירוע נכשלה בגלל בעיית תקשורת עם השרת.');
    }
  }

  return (
    <section id="admin-editor" className="rounded-[28px] border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900">עריכת אדמין מהירה</h2>
          <p className="mt-2 text-sm text-stone-600">
            האזור הזה מופיע רק למשתמשי אדמין, ומאפשר לעדכן את פרטי המשחק ואת אירועי המשחק ישירות מתוך הדף.
          </p>
        </div>
        <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-800">
          {isPending ? 'מרענן נתונים...' : 'אדמין בלבד'}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[24px] border border-amber-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-stone-900">נתוני משחק</h3>
            <button
              type="button"
              onClick={saveGame}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white"
            >
              שמור משחק
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="תאריך ושעה" type="datetime-local" value={gameForm.dateTime} onChange={(value) => setGameForm((current) => ({ ...current, dateTime: value }))} />
            <SelectField label="סטטוס" value={gameForm.status} onChange={(value) => setGameForm((current) => ({ ...current, status: value }))} options={gameStatusOptions.map((option) => ({ value: option.value, label: option.label }))} />
            <Field label="שערי בית" type="number" value={gameForm.homeScore} onChange={(value) => setGameForm((current) => ({ ...current, homeScore: value }))} />
            <Field label="שערי חוץ" type="number" value={gameForm.awayScore} onChange={(value) => setGameForm((current) => ({ ...current, awayScore: value }))} />
            <Field label="פנדלים בית" type="number" value={gameForm.homePenalty} onChange={(value) => setGameForm((current) => ({ ...current, homePenalty: value }))} />
            <Field label="פנדלים חוץ" type="number" value={gameForm.awayPenalty} onChange={(value) => setGameForm((current) => ({ ...current, awayPenalty: value }))} />
            <Field label="מחזור בעברית" value={gameForm.roundNameHe} onChange={(value) => setGameForm((current) => ({ ...current, roundNameHe: value }))} />
            <Field label="מחזור באנגלית" value={gameForm.roundNameEn} onChange={(value) => setGameForm((current) => ({ ...current, roundNameEn: value }))} />
            <Field label="שופט בעברית" value={gameForm.refereeHe} onChange={(value) => setGameForm((current) => ({ ...current, refereeHe: value }))} />
            <Field label="שופט באנגלית" value={gameForm.refereeEn} onChange={(value) => setGameForm((current) => ({ ...current, refereeEn: value }))} />
          </div>

          {gameMessage ? <div className="mt-4 text-sm font-semibold text-stone-600">{gameMessage}</div> : null}
        </div>

        <div className="rounded-[24px] border border-amber-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-stone-900">הוספת אירוע</h3>
            <button
              type="button"
              onClick={createEvent}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white"
            >
              הוסף אירוע
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="דקה" type="number" value={newEventForm.minute} onChange={(value) => setNewEventForm((current) => ({ ...current, minute: value }))} />
            <Field label="תוספת דקה" type="number" value={newEventForm.extraMinute} onChange={(value) => setNewEventForm((current) => ({ ...current, extraMinute: value }))} />
            <SelectField label="סוג אירוע" value={newEventForm.type} onChange={(value) => setNewEventForm((current) => ({ ...current, type: value }))} options={eventTypeOptions.map((option) => ({ value: option.value, label: option.label }))} />
            <SelectField label="קבוצה" value={newEventForm.teamId} onChange={(value) => setNewEventForm((current) => ({ ...current, teamId: value, playerId: '', relatedPlayerId: '', assistPlayerId: '' }))} options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))} />
            <SelectField label="שחקן" value={newEventForm.playerId} onChange={(value) => setNewEventForm((current) => ({ ...current, playerId: value }))} options={(playersByTeam.get(newEventForm.teamId) || []).map((player) => ({ value: player.id, label: formatPlayerName(player) }))} />
            <SelectField label="שחקן קשור" value={newEventForm.relatedPlayerId} onChange={(value) => setNewEventForm((current) => ({ ...current, relatedPlayerId: value }))} options={players.map((player) => ({ value: player.id, label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}` }))} />
            <Field label="סדר" type="number" value={newEventForm.sortOrder} onChange={(value) => setNewEventForm((current) => ({ ...current, sortOrder: value }))} />
            <Field label="הערה בעברית" value={newEventForm.notesHe} onChange={(value) => setNewEventForm((current) => ({ ...current, notesHe: value }))} />
          </div>

          {eventMessage ? <div className="mt-4 text-sm font-semibold text-stone-600">{eventMessage}</div> : null}
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-amber-200 bg-white p-5">
        <h3 className="text-xl font-black text-stone-900">אירועי המשחק לעריכה</h3>
        <div className="mt-4 space-y-4">
          {game.events.map((event) => (
            <EventRowEditor
              key={event.id}
              event={event}
              teams={teams}
              players={players}
              onSaved={() =>
                startTransition(() => {
                  router.refresh();
                })
              }
            />
          ))}
          {game.events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center text-sm text-stone-500">
              אין כרגע אירועים שמורים למשחק הזה.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EventRowEditor({
  event,
  teams,
  players,
  onSaved,
}: {
  event: EventItem;
  teams: TeamOption[];
  players: PlayerOption[];
  onSaved: () => void;
}) {
  const defaultTeamId = event.teamId || teams[0]?.id || '';
  const [form, setForm] = useState(() => buildEventForm(event, defaultTeamId));
  const [message, setMessage] = useState('');

  async function parseResponsePayload(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  const availablePlayers = useMemo(() => {
    return players.filter((player) => player.teamId === form.teamId);
  }, [players, form.teamId]);

  async function saveEvent() {
    setMessage('');

    const teamLabel =
      teams.find((team) => team.id === form.teamId)?.nameHe ||
      teams.find((team) => team.id === form.teamId)?.nameEn ||
      event.team;

    try {
      const response = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: event.id,
          minute: form.minute,
          extraMinute: form.extraMinute,
          type: form.type,
          team: teamLabel,
          teamId: form.teamId,
          playerId: form.playerId || null,
          participantName: form.participantName || null,
          relatedPlayerId: form.relatedPlayerId || null,
          relatedParticipantName: form.relatedParticipantName || null,
          assistPlayerId: form.assistPlayerId || null,
          notesHe: form.notesHe,
          notesEn: form.notesEn,
          sortOrder: form.sortOrder,
        }),
      });

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        setMessage(payload?.error || 'שמירת האירוע נכשלה.');
        return;
      }

      setMessage('האירוע נשמר.');
      onSaved();
    } catch {
      setMessage('שמירת האירוע נכשלה בגלל בעיית תקשורת עם השרת.');
    }
  }

  async function deleteEvent() {
    setMessage('');

    try {
      const response = await fetch(`/api/events?id=${event.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        setMessage(payload?.error || 'מחיקת האירוע נכשלה.');
        return;
      }

      onSaved();
    } catch {
      setMessage('מחיקת האירוע נכשלה בגלל בעיית תקשורת עם השרת.');
    }
  }

  return (
    <article className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black text-stone-900">
            {event.minute}
            {event.extraMinute ? `+${event.extraMinute}` : ''}&apos; · {eventTypeOptions.find((option) => option.value === event.type)?.label || event.type}
          </div>
          <div className="mt-1 text-sm text-stone-600">
            {event.player ? formatPlayerName(event.player) : 'ללא שחקן'}
            {event.relatedPlayer ? ` | ${formatPlayerName(event.relatedPlayer)}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveEvent} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">
            שמור
          </button>
          <button type="button" onClick={deleteEvent} className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700">
            מחק
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="דקה" type="number" value={form.minute} onChange={(value) => setForm((current) => ({ ...current, minute: value }))} />
        <Field label="תוספת" type="number" value={form.extraMinute} onChange={(value) => setForm((current) => ({ ...current, extraMinute: value }))} />
        <SelectField label="סוג" value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value }))} options={eventTypeOptions.map((option) => ({ value: option.value, label: option.label }))} />
        <SelectField label="קבוצה" value={form.teamId} onChange={(value) => setForm((current) => ({ ...current, teamId: value, playerId: '' }))} options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))} />
        <Field label="סדר" type="number" value={form.sortOrder} onChange={(value) => setForm((current) => ({ ...current, sortOrder: value }))} />
        <SelectField label="שחקן" value={form.playerId} onChange={(value) => setForm((current) => ({ ...current, playerId: value }))} options={availablePlayers.map((player) => ({ value: player.id, label: formatPlayerName(player) }))} />
        <SelectField label="שחקן קשור" value={form.relatedPlayerId} onChange={(value) => setForm((current) => ({ ...current, relatedPlayerId: value }))} options={players.map((player) => ({ value: player.id, label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}` }))} />
        <Field label="הערה בעברית" value={form.notesHe} onChange={(value) => setForm((current) => ({ ...current, notesHe: value }))} />
      </div>

      {message ? <div className="mt-3 text-sm font-semibold text-stone-600">{message}</div> : null}
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-amber-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-amber-500"
      >
        <option value="">--</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
