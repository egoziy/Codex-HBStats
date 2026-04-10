'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { formatPlayerName } from '@/lib/player-display';

type SeasonOption = {
  id: string;
  name: string;
  year: number;
};

type TeamOption = {
  id: string;
  nameHe: string;
  nameEn: string;
};

type CompetitionOption = {
  id: string;
  nameHe: string;
  nameEn: string;
  type: string;
  apiFootballId: number | null;
};

type VenueOption = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  cityEn: string | null;
  cityHe: string | null;
};

type PlayerOption = {
  id: string;
  nameHe: string;
  nameEn: string;
  teamId: string;
  team: {
    id: string;
    nameHe: string;
    nameEn: string;
  };
};

type GameStatForm = {
  homeTeamPossession: string;
  awayTeamPossession: string;
  homeShotsOnTarget: string;
  awayShotsOnTarget: string;
  homeShotsTotal: string;
  awayShotsTotal: string;
  homeCorners: string;
  awayCorners: string;
  homeFouls: string;
  awayFouls: string;
  homeOffsides: string;
  awayOffsides: string;
  homeYellowCards: string;
  awayYellowCards: string;
  homeRedCards: string;
  awayRedCards: string;
};

type GameEventItem = {
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
  relatedPlayerId: string | null;
  assistPlayerId: string | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
  relatedPlayer: { id: string; nameHe: string; nameEn: string } | null;
  eventTeam: { id: string; nameHe: string; nameEn: string } | null;
};

type GameRecord = {
  id: string;
  dateTime: string;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  homeScore: number | null;
  awayScore: number | null;
  roundNameHe: string | null;
  roundNameEn: string | null;
  venueNameHe: string | null;
  venueNameEn: string | null;
  refereeEn: string | null;
  refereeHe: string | null;
  competitionId: string | null;
  venueId: string | null;
  refereeId: string | null;
  seasonId: string;
  homeTeam: TeamOption;
  awayTeam: TeamOption;
  competition: CompetitionOption | null;
  venue: {
    id: string;
    nameHe: string | null;
    nameEn: string;
  } | null;
  referee: {
    id: string;
    nameHe: string | null;
    nameEn: string;
  } | null;
  gameStats:
    | {
        homeTeamPossession: number | null;
        awayTeamPossession: number | null;
        homeShotsOnTarget: number | null;
        awayShotsOnTarget: number | null;
        homeShotsTotal: number | null;
        awayShotsTotal: number | null;
        homeCorners: number | null;
        awayCorners: number | null;
        homeFouls: number | null;
        awayFouls: number | null;
        homeOffsides: number | null;
        awayOffsides: number | null;
        homeYellowCards: number | null;
        awayYellowCards: number | null;
        homeRedCards: number | null;
        awayRedCards: number | null;
      }
    | null;
  events: GameEventItem[];
};

type GameFormState = {
  dateTime: string;
  homeTeamId: string;
  awayTeamId: string;
  competitionId: string;
  roundNameHe: string;
  roundNameEn: string;
  venueId: string;
  venueNameHe: string;
  venueNameEn: string;
  refereeEn: string;
  refereeHe: string;
  homeScore: string;
  awayScore: string;
  status: GameRecord['status'];
};

type EventFormState = {
  minute: string;
  extraMinute: string;
  type: string;
  teamId: string;
  playerId: string;
  relatedPlayerId: string;
  assistPlayerId: string;
  notesHe: string;
  notesEn: string;
  sortOrder: string;
};

function toInputDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toDefaultLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function buildGameForm(game: GameRecord | null, teams: TeamOption[], competitions: CompetitionOption[], venues: VenueOption[]): GameFormState {
  return {
    dateTime: game ? toInputDateTime(game.dateTime) : toDefaultLocalDateTime(),
    homeTeamId: game?.homeTeam.id || teams[0]?.id || '',
    awayTeamId: game?.awayTeam.id || teams[1]?.id || teams[0]?.id || '',
    competitionId: game?.competitionId || competitions[0]?.id || '',
    roundNameHe: game?.roundNameHe || '',
    roundNameEn: game?.roundNameEn || '',
    venueId: game?.venueId || venues[0]?.id || '',
    venueNameHe: game?.venueNameHe || game?.venue?.nameHe || '',
    venueNameEn: game?.venueNameEn || game?.venue?.nameEn || '',
    refereeEn: game?.refereeEn || game?.referee?.nameEn || '',
    refereeHe: game?.refereeHe || game?.referee?.nameHe || '',
    homeScore: game?.homeScore === null ? '' : String(game?.homeScore ?? ''),
    awayScore: game?.awayScore === null ? '' : String(game?.awayScore ?? ''),
    status: game?.status || 'SCHEDULED',
  };
}

function buildGameStatsForm(gameStats: GameRecord['gameStats']): GameStatForm {
  return {
    homeTeamPossession: gameStats?.homeTeamPossession === null ? '' : String(gameStats?.homeTeamPossession ?? ''),
    awayTeamPossession: gameStats?.awayTeamPossession === null ? '' : String(gameStats?.awayTeamPossession ?? ''),
    homeShotsOnTarget: gameStats?.homeShotsOnTarget === null ? '' : String(gameStats?.homeShotsOnTarget ?? ''),
    awayShotsOnTarget: gameStats?.awayShotsOnTarget === null ? '' : String(gameStats?.awayShotsOnTarget ?? ''),
    homeShotsTotal: gameStats?.homeShotsTotal === null ? '' : String(gameStats?.homeShotsTotal ?? ''),
    awayShotsTotal: gameStats?.awayShotsTotal === null ? '' : String(gameStats?.awayShotsTotal ?? ''),
    homeCorners: gameStats?.homeCorners === null ? '' : String(gameStats?.homeCorners ?? ''),
    awayCorners: gameStats?.awayCorners === null ? '' : String(gameStats?.awayCorners ?? ''),
    homeFouls: gameStats?.homeFouls === null ? '' : String(gameStats?.homeFouls ?? ''),
    awayFouls: gameStats?.awayFouls === null ? '' : String(gameStats?.awayFouls ?? ''),
    homeOffsides: gameStats?.homeOffsides === null ? '' : String(gameStats?.homeOffsides ?? ''),
    awayOffsides: gameStats?.awayOffsides === null ? '' : String(gameStats?.awayOffsides ?? ''),
    homeYellowCards: gameStats?.homeYellowCards === null ? '' : String(gameStats?.homeYellowCards ?? ''),
    awayYellowCards: gameStats?.awayYellowCards === null ? '' : String(gameStats?.awayYellowCards ?? ''),
    homeRedCards: gameStats?.homeRedCards === null ? '' : String(gameStats?.homeRedCards ?? ''),
    awayRedCards: gameStats?.awayRedCards === null ? '' : String(gameStats?.awayRedCards ?? ''),
  };
}

function buildNewGameForm(teams: TeamOption[], competitions: CompetitionOption[], venues: VenueOption[]): GameFormState {
  return buildGameForm(null, teams, competitions, venues);
}

function buildNewEventForm(game: GameRecord | null, players: PlayerOption[]): EventFormState {
  const teamId = game?.homeTeam.id || '';
  const firstPlayer = players.find((player) => player.teamId === teamId) || players[0] || null;

  return {
    minute: '0',
    extraMinute: '',
    type: 'GOAL',
    teamId,
    playerId: firstPlayer?.id || '',
    relatedPlayerId: '',
    assistPlayerId: '',
    notesHe: '',
    notesEn: '',
    sortOrder: '0',
  };
}

function parseNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalNumberString(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export default function AdminGameEditorClient({
  seasons,
  selectedSeasonId,
  teams,
  competitions,
  venues,
  players,
  games,
  selectedGameId,
}: {
  seasons: SeasonOption[];
  selectedSeasonId: string;
  teams: TeamOption[];
  competitions: CompetitionOption[];
  venues: VenueOption[];
  players: PlayerOption[];
  games: GameRecord[];
  selectedGameId: string | null;
}) {
  const router = useRouter();
  const [isTransitioning, startTransition] = useTransition();
  const selectedGame = games.find((game) => game.id === selectedGameId) || games[0] || null;
  const gameTeams = useMemo(
    () => (selectedGame ? [selectedGame.homeTeam, selectedGame.awayTeam] : teams),
    [selectedGame?.id, teams]
  );
  const gamePlayers = useMemo(
    () => players.filter((player) => gameTeams.some((team) => team.id === player.teamId)),
    [players, gameTeams]
  );

  const [gameForm, setGameForm] = useState(() => buildGameForm(selectedGame, teams, competitions, venues));
  const [gameStatsForm, setGameStatsForm] = useState(() => buildGameStatsForm(selectedGame?.gameStats || null));
  const [newGameForm, setNewGameForm] = useState(() => buildNewGameForm(teams, competitions, venues));
  const [newEventForm, setNewEventForm] = useState(() => buildNewEventForm(selectedGame, gamePlayers));
  const [selectedGameMessage, setSelectedGameMessage] = useState('');
  const [newGameMessage, setNewGameMessage] = useState('');
  const [newEventMessage, setNewEventMessage] = useState('');
  const [gameSearch, setGameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GameRecord['status']>('ALL');

  const filteredGames = useMemo(() => {
    const query = gameSearch.trim().toLowerCase();

    return games.filter((game) => {
      if (statusFilter !== 'ALL' && game.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        game.homeTeam.nameHe,
        game.homeTeam.nameEn,
        game.awayTeam.nameHe,
        game.awayTeam.nameEn,
        game.competition?.nameHe || '',
        game.competition?.nameEn || '',
        game.referee?.nameHe || '',
        game.referee?.nameEn || '',
        game.venue?.nameHe || '',
        game.venue?.nameEn || '',
        game.roundNameHe || '',
        game.roundNameEn || '',
        game.homeScore === null ? '' : String(game.homeScore),
        game.awayScore === null ? '' : String(game.awayScore),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [games, gameSearch, statusFilter]);

  useEffect(() => {
    setGameForm(buildGameForm(selectedGame, teams, competitions, venues));
    setGameStatsForm(buildGameStatsForm(selectedGame?.gameStats || null));
    setNewEventForm(buildNewEventForm(selectedGame, gamePlayers));
    setSelectedGameMessage('');
    setNewEventMessage('');
  }, [selectedGame?.id, selectedSeasonId, teams, competitions, venues, gamePlayers]);

  useEffect(() => {
    setNewGameForm(buildNewGameForm(teams, competitions, venues));
    setNewGameMessage('');
  }, [selectedSeasonId, teams, competitions, venues]);

  async function saveGame(mode: 'create' | 'update', payloadForm: GameFormState, statsForm: GameStatForm, gameId?: string) {
    const body = {
      ...(mode === 'update' && gameId ? { id: gameId } : {}),
      dateTime: payloadForm.dateTime,
      homeTeamId: payloadForm.homeTeamId,
      awayTeamId: payloadForm.awayTeamId,
      seasonId: selectedSeasonId,
      competitionId: payloadForm.competitionId || null,
      roundNameHe: payloadForm.roundNameHe,
      roundNameEn: payloadForm.roundNameEn,
      venueId: payloadForm.venueId || null,
      venueNameHe: payloadForm.venueNameHe,
      venueNameEn: payloadForm.venueNameEn,
      refereeEn: payloadForm.refereeEn,
      refereeHe: payloadForm.refereeHe,
      homeScore: payloadForm.homeScore,
      awayScore: payloadForm.awayScore,
      status: payloadForm.status,
      gameStats: {
        homeTeamPossession: statsForm.homeTeamPossession,
        awayTeamPossession: statsForm.awayTeamPossession,
        homeShotsOnTarget: statsForm.homeShotsOnTarget,
        awayShotsOnTarget: statsForm.awayShotsOnTarget,
        homeShotsTotal: statsForm.homeShotsTotal,
        awayShotsTotal: statsForm.awayShotsTotal,
        homeCorners: statsForm.homeCorners,
        awayCorners: statsForm.awayCorners,
        homeFouls: statsForm.homeFouls,
        awayFouls: statsForm.awayFouls,
        homeOffsides: statsForm.homeOffsides,
        awayOffsides: statsForm.awayOffsides,
        homeYellowCards: statsForm.homeYellowCards,
        awayYellowCards: statsForm.awayYellowCards,
        homeRedCards: statsForm.homeRedCards,
        awayRedCards: statsForm.awayRedCards,
      },
    };

    const response = await fetch('/api/games', {
      method: mode === 'create' ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || 'שמירת המשחק נכשלה');
    }

    return payload;
  }

  async function onSaveSelectedGame() {
    if (!selectedGame) return;
    setSelectedGameMessage('');

    try {
      await saveGame('update', gameForm, gameStatsForm, selectedGame.id);
      setSelectedGameMessage('המשחק והסטטיסטיקות נשמרו.');
      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      setSelectedGameMessage(error.message || 'שמירת המשחק נכשלה.');
    }
  }

  async function onCreateGame() {
    setNewGameMessage('');

    try {
      const payload = await saveGame('create', newGameForm, buildGameStatsForm(null));
      setNewGameMessage('המשחק החדש נשמר.');
      const nextGameId = payload?.id;
      if (nextGameId) {
        startTransition(() => {
          router.push(`/admin/games?season=${selectedSeasonId}&gameId=${nextGameId}`);
          router.refresh();
        });
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (error: any) {
      setNewGameMessage(error.message || 'יצירת המשחק נכשלה.');
    }
  }

  async function onCreateEvent() {
    if (!selectedGame) return;
    setNewEventMessage('');

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          gameId: selectedGame.id,
          minute: newEventForm.minute,
          extraMinute: parseOptionalNumberString(newEventForm.extraMinute),
          type: newEventForm.type,
          team: gameTeams.find((team) => team.id === newEventForm.teamId)?.nameHe ||
            gameTeams.find((team) => team.id === newEventForm.teamId)?.nameEn ||
            '',
          teamId: newEventForm.teamId,
          playerId: newEventForm.playerId || null,
          relatedPlayerId: newEventForm.relatedPlayerId || null,
          assistPlayerId: newEventForm.assistPlayerId || null,
          notesHe: newEventForm.notesHe,
          notesEn: newEventForm.notesEn,
          sortOrder: newEventForm.sortOrder,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'הוספת האירוע נכשלה');
      }

      setNewEventMessage('האירוע נשמר.');
      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      setNewEventMessage(error.message || 'הוספת האירוע נכשלה.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-stone-900">בחירת עונה</h2>
            <p className="mt-2 text-sm text-stone-600">המעבר בין העונות שומר את כל מסכי העריכה בתוך אותו דפדפן.</p>
          </div>
          <div className="text-sm font-bold text-stone-600">
            {isTransitioning ? 'טוען...' : `${games.length} משחקים בעונה`}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {seasons.map((season) => (
            <Link
              key={season.id}
              href={`/admin/games?season=${season.id}`}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                season.id === selectedSeasonId
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-stone-50 text-stone-700'
              }`}
            >
              {season.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-stone-900">הזנת משחק חדש</h2>
            <p className="mt-2 text-sm text-stone-600">
              אפשר להוסיף כאן משחק היסטורי ולהשלים לו מסגרת, תוצאה, אצטדיון, שופט וסטטיסטיקות.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateGame}
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white"
          >
            שמור משחק חדש
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="תאריך ושעה" type="datetime-local" value={newGameForm.dateTime} onChange={(value) => setNewGameForm((current) => ({ ...current, dateTime: value }))} />
          <SelectField
            label="מסגרת"
            value={newGameForm.competitionId}
            onChange={(value) => setNewGameForm((current) => ({ ...current, competitionId: value }))}
            options={competitions.map((competition) => ({
              value: competition.id,
              label: `${competition.nameHe || competition.nameEn}${competition.apiFootballId ? ` · ${competition.apiFootballId}` : ''}`,
            }))}
          />
          <SelectField
            label="קבוצה בית"
            value={newGameForm.homeTeamId}
            onChange={(value) => setNewGameForm((current) => ({ ...current, homeTeamId: value }))}
            options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
          />
          <SelectField
            label="קבוצה חוץ"
            value={newGameForm.awayTeamId}
            onChange={(value) => setNewGameForm((current) => ({ ...current, awayTeamId: value }))}
            options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
          />
          <Field label="מחזור בעברית" value={newGameForm.roundNameHe} onChange={(value) => setNewGameForm((current) => ({ ...current, roundNameHe: value }))} />
          <Field label="Round Name באנגלית" value={newGameForm.roundNameEn} onChange={(value) => setNewGameForm((current) => ({ ...current, roundNameEn: value }))} />
          <SelectField
            label="אצטדיון משויך"
            value={newGameForm.venueId}
            onChange={(value) => setNewGameForm((current) => ({ ...current, venueId: value }))}
            options={venues.map((venue) => ({
              value: venue.id,
              label: `${venue.nameHe || venue.nameEn}${venue.cityHe || venue.cityEn ? ` · ${venue.cityHe || venue.cityEn}` : ''}`,
            }))}
          />
          <Field label="אצטדיון בעברית" value={newGameForm.venueNameHe} onChange={(value) => setNewGameForm((current) => ({ ...current, venueNameHe: value }))} />
          <Field label="אצטדיון באנגלית" value={newGameForm.venueNameEn} onChange={(value) => setNewGameForm((current) => ({ ...current, venueNameEn: value }))} />
          <Field label="שופט באנגלית" value={newGameForm.refereeEn} onChange={(value) => setNewGameForm((current) => ({ ...current, refereeEn: value }))} />
          <Field label="שופט בעברית" value={newGameForm.refereeHe} onChange={(value) => setNewGameForm((current) => ({ ...current, refereeHe: value }))} />
          <Field label="תוצאה בית" type="number" value={newGameForm.homeScore} onChange={(value) => setNewGameForm((current) => ({ ...current, homeScore: value }))} />
          <Field label="תוצאה חוץ" type="number" value={newGameForm.awayScore} onChange={(value) => setNewGameForm((current) => ({ ...current, awayScore: value }))} />
          <SelectField
            label="סטטוס"
            value={newGameForm.status}
            onChange={(value) => setNewGameForm((current) => ({ ...current, status: value as GameRecord['status'] }))}
            options={[
              { value: 'SCHEDULED', label: 'מתוכנן' },
              { value: 'ONGOING', label: 'חי' },
              { value: 'COMPLETED', label: 'הסתיים' },
              { value: 'CANCELLED', label: 'בוטל' },
            ]}
          />
        </div>

        <p className="mt-4 text-xs text-stone-500">
          לנתוני המשחק הישנים אפשר גם להשלים סטטיסטיקות משחק למטה אחרי שמירת המשחק.
        </p>
        {newGameMessage ? <div className="mt-3 text-sm font-semibold text-stone-600">{newGameMessage}</div> : null}
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-stone-900">בחירת משחק לעריכה</h2>
            <p className="mt-2 text-sm text-stone-600">לחיצה על משחק מחליפה את הטופס לנתונים שלו, כולל אירועים וסטטיסטיקות.</p>
          </div>
          <div className="text-sm text-stone-500">{selectedGame ? `${selectedGame.homeTeam.nameHe || selectedGame.homeTeam.nameEn} - ${selectedGame.awayTeam.nameHe || selectedGame.awayTeam.nameEn}` : 'אין משחק נבחר'}</div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_auto]">
          <Field label="חיפוש משחק" value={gameSearch} onChange={setGameSearch} />
          <div className="flex flex-wrap items-end gap-2">
            {(['ALL', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-3 text-sm font-bold ${
                  statusFilter === status
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-300 bg-stone-50 text-stone-700'
                }`}
              >
                {status === 'ALL' ? 'הכול' : status === 'SCHEDULED' ? 'מתוכנן' : status === 'ONGOING' ? 'חי' : status === 'COMPLETED' ? 'הסתיים' : 'בוטל'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-sm font-semibold text-stone-500">
          מציג {filteredGames.length} משחקים מתוך {games.length}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredGames.map((game) => {
            const isSelected = game.id === selectedGame?.id;
            return (
              <Link
                key={game.id}
                href={`/admin/games?season=${selectedSeasonId}&gameId=${game.id}`}
                className={`rounded-[20px] border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  isSelected ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-stone-500">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(game.dateTime))}
                    </div>
                    <div className="mt-1 text-lg font-black text-stone-900">
                      {game.homeTeam.nameHe || game.homeTeam.nameEn} - {game.awayTeam.nameHe || game.awayTeam.nameEn}
                    </div>
                  </div>
                  <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">{game.status === 'SCHEDULED' ? 'מתוכנן' : game.status === 'ONGOING' ? 'חי' : game.status === 'COMPLETED' ? 'הסתיים' : 'בוטל'}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-stone-600">
                  <span className="rounded-full bg-stone-100 px-3 py-1">{game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת'}</span>
                  <span className="rounded-full bg-stone-100 px-3 py-1">{game.roundNameHe || game.roundNameEn || 'ללא מחזור'}</span>
                  <span className="rounded-full bg-stone-100 px-3 py-1">{game.venue?.nameHe || game.venue?.nameEn || 'ללא אצטדיון'}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
                  <div>שופט: {game.referee?.nameHe || game.referee?.nameEn || game.refereeHe || game.refereeEn || 'לא זמין'}</div>
                  <div className="font-black text-stone-900">
                    {game.homeScore ?? '-'}:{game.awayScore ?? '-'}
                  </div>
                </div>
              </Link>
            );
          })}
          {filteredGames.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500 md:col-span-2 xl:col-span-3">
              לא נמצאו משחקים שמתאימים לחיפוש הנוכחי.
            </div>
          ) : null}
        </div>
      </section>

      {selectedGame ? (
        <>
          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-stone-900">עריכת משחק</h2>
                <p className="mt-2 text-sm text-stone-600">
                  כאן אפשר לשנות את תאריך המשחק, המסגרת, תוצאה, אצטדיון, שופט וסטטיסטיקות.
                </p>
              </div>
              <button
                type="button"
                onClick={onSaveSelectedGame}
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white"
              >
                שמור משחק
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="תאריך ושעה" type="datetime-local" value={gameForm.dateTime} onChange={(value) => setGameForm((current) => ({ ...current, dateTime: value }))} />
              <SelectField
                label="מסגרת"
                value={gameForm.competitionId}
                onChange={(value) => setGameForm((current) => ({ ...current, competitionId: value }))}
                options={competitions.map((competition) => ({
                  value: competition.id,
                  label: `${competition.nameHe || competition.nameEn}${competition.apiFootballId ? ` · ${competition.apiFootballId}` : ''}`,
                }))}
              />
              <SelectField
                label="קבוצה בית"
                value={gameForm.homeTeamId}
                onChange={(value) => setGameForm((current) => ({ ...current, homeTeamId: value }))}
                options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
              />
              <SelectField
                label="קבוצה חוץ"
                value={gameForm.awayTeamId}
                onChange={(value) => setGameForm((current) => ({ ...current, awayTeamId: value }))}
                options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
              />
              <Field label="מחזור בעברית" value={gameForm.roundNameHe} onChange={(value) => setGameForm((current) => ({ ...current, roundNameHe: value }))} />
              <Field label="Round Name באנגלית" value={gameForm.roundNameEn} onChange={(value) => setGameForm((current) => ({ ...current, roundNameEn: value }))} />
              <SelectField
                label="אצטדיון משויך"
                value={gameForm.venueId}
                onChange={(value) => setGameForm((current) => ({ ...current, venueId: value }))}
                options={venues.map((venue) => ({
                  value: venue.id,
                  label: `${venue.nameHe || venue.nameEn}${venue.cityHe || venue.cityEn ? ` · ${venue.cityHe || venue.cityEn}` : ''}`,
                }))}
              />
              <Field label="אצטדיון בעברית" value={gameForm.venueNameHe} onChange={(value) => setGameForm((current) => ({ ...current, venueNameHe: value }))} />
              <Field label="אצטדיון באנגלית" value={gameForm.venueNameEn} onChange={(value) => setGameForm((current) => ({ ...current, venueNameEn: value }))} />
              <Field label="שופט באנגלית" value={gameForm.refereeEn} onChange={(value) => setGameForm((current) => ({ ...current, refereeEn: value }))} />
              <Field label="שופט בעברית" value={gameForm.refereeHe} onChange={(value) => setGameForm((current) => ({ ...current, refereeHe: value }))} />
              <Field label="תוצאה בית" type="number" value={gameForm.homeScore} onChange={(value) => setGameForm((current) => ({ ...current, homeScore: value }))} />
              <Field label="תוצאה חוץ" type="number" value={gameForm.awayScore} onChange={(value) => setGameForm((current) => ({ ...current, awayScore: value }))} />
              <SelectField
                label="סטטוס"
                value={gameForm.status}
                onChange={(value) => setGameForm((current) => ({ ...current, status: value as GameRecord['status'] }))}
                options={[
                  { value: 'SCHEDULED', label: 'מתוכנן' },
                  { value: 'ONGOING', label: 'חי' },
                  { value: 'COMPLETED', label: 'הסתיים' },
                  { value: 'CANCELLED', label: 'בוטל' },
                ]}
              />
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-black text-stone-900">סטטיסטיקות משחק</h3>
              <p className="mt-1 text-sm text-stone-600">אפשר להשלים כאן גם נתונים ידניים למשחקים ותיקים.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="אחזקה בית" type="number" value={gameStatsForm.homeTeamPossession} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeTeamPossession: value }))} />
                <Field label="אחזקה חוץ" type="number" value={gameStatsForm.awayTeamPossession} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayTeamPossession: value }))} />
                <Field label="בעיטות למסגרת בית" type="number" value={gameStatsForm.homeShotsOnTarget} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeShotsOnTarget: value }))} />
                <Field label="בעיטות למסגרת חוץ" type="number" value={gameStatsForm.awayShotsOnTarget} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayShotsOnTarget: value }))} />
                <Field label="בעיטות סך הכול בית" type="number" value={gameStatsForm.homeShotsTotal} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeShotsTotal: value }))} />
                <Field label="בעיטות סך הכול חוץ" type="number" value={gameStatsForm.awayShotsTotal} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayShotsTotal: value }))} />
                <Field label="קרנות בית" type="number" value={gameStatsForm.homeCorners} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeCorners: value }))} />
                <Field label="קרנות חוץ" type="number" value={gameStatsForm.awayCorners} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayCorners: value }))} />
                <Field label="עבירות בית" type="number" value={gameStatsForm.homeFouls} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeFouls: value }))} />
                <Field label="עבירות חוץ" type="number" value={gameStatsForm.awayFouls} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayFouls: value }))} />
                <Field label="נבדלים בית" type="number" value={gameStatsForm.homeOffsides} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeOffsides: value }))} />
                <Field label="נבדלים חוץ" type="number" value={gameStatsForm.awayOffsides} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayOffsides: value }))} />
                <Field label="צהובים בית" type="number" value={gameStatsForm.homeYellowCards} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeYellowCards: value }))} />
                <Field label="צהובים חוץ" type="number" value={gameStatsForm.awayYellowCards} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayYellowCards: value }))} />
                <Field label="אדומים בית" type="number" value={gameStatsForm.homeRedCards} onChange={(value) => setGameStatsForm((current) => ({ ...current, homeRedCards: value }))} />
                <Field label="אדומים חוץ" type="number" value={gameStatsForm.awayRedCards} onChange={(value) => setGameStatsForm((current) => ({ ...current, awayRedCards: value }))} />
              </div>
            </div>

            {selectedGameMessage ? <div className="mt-4 text-sm font-semibold text-stone-600">{selectedGameMessage}</div> : null}
          </section>

          <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-stone-900">אירועים במשחק</h2>
                <p className="mt-2 text-sm text-stone-600">כאן אפשר להוסיף, לערוך ולמחוק אירועים קשורים למשחק הנבחר.</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <h3 className="text-lg font-black text-stone-900">הוספת אירוע</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="דקה" type="number" value={newEventForm.minute} onChange={(value) => setNewEventForm((current) => ({ ...current, minute: value }))} />
                <Field label="תוספת דקה" type="number" value={newEventForm.extraMinute} onChange={(value) => setNewEventForm((current) => ({ ...current, extraMinute: value }))} />
                <SelectField
                  label="סוג אירוע"
                  value={newEventForm.type}
                  onChange={(value) => setNewEventForm((current) => ({ ...current, type: value }))}
                  options={[
                    { value: 'GOAL', label: 'שער' },
                    { value: 'ASSIST', label: 'בישול' },
                    { value: 'YELLOW_CARD', label: 'כרטיס צהוב' },
                    { value: 'RED_CARD', label: 'כרטיס אדום' },
                    { value: 'SUBSTITUTION_IN', label: 'חילוף נכנס' },
                    { value: 'SUBSTITUTION_OUT', label: 'חילוף יוצא' },
                    { value: 'OWN_GOAL', label: 'שער עצמי' },
                    { value: 'PENALTY_GOAL', label: 'פנדל' },
                    { value: 'PENALTY_MISSED', label: 'פנדל מוחמץ' },
                  ]}
                />
                <SelectField
                  label="קבוצה"
                  value={newEventForm.teamId}
                  onChange={(value) => setNewEventForm((current) => ({ ...current, teamId: value }))}
                  options={gameTeams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
                />
                <SelectField
                  label="שחקן"
                  value={newEventForm.playerId}
                  onChange={(value) => setNewEventForm((current) => ({ ...current, playerId: value }))}
                  options={gamePlayers.map((player) => ({
                    value: player.id,
                    label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}`,
                  }))}
                />
                <SelectField
                  label="שחקן קשור"
                  value={newEventForm.relatedPlayerId}
                  onChange={(value) => setNewEventForm((current) => ({ ...current, relatedPlayerId: value }))}
                  options={gamePlayers.map((player) => ({
                    value: player.id,
                    label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}`,
                  }))}
                />
                <SelectField
                  label="שחקן בישול"
                  value={newEventForm.assistPlayerId}
                  onChange={(value) => setNewEventForm((current) => ({ ...current, assistPlayerId: value }))}
                  options={gamePlayers.map((player) => ({
                    value: player.id,
                    label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}`,
                  }))}
                />
                <Field label="סדר" type="number" value={newEventForm.sortOrder} onChange={(value) => setNewEventForm((current) => ({ ...current, sortOrder: value }))} />
                <Field label="הערה בעברית" value={newEventForm.notesHe} onChange={(value) => setNewEventForm((current) => ({ ...current, notesHe: value }))} />
                <Field label="הערה באנגלית" value={newEventForm.notesEn} onChange={(value) => setNewEventForm((current) => ({ ...current, notesEn: value }))} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onCreateEvent}
                  className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white"
                >
                  שמור אירוע
                </button>
                {newEventMessage ? <span className="text-sm font-semibold text-stone-600">{newEventMessage}</span> : null}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {selectedGame.events.map((event) => (
                <GameEventEditor
                  key={event.id}
                  event={event}
                  players={gamePlayers}
                  teams={gameTeams}
                  onSaved={() => startTransition(() => router.refresh())}
                />
              ))}
              {selectedGame.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-stone-500">
                  אין אירועים שמורים למשחק זה.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-stone-900">אין משחקים לעונה הזו</h2>
          <p className="mt-2 text-sm text-stone-600">אפשר להתחיל מהזנת משחק חדש בראש העמוד.</p>
        </section>
      )}
    </div>
  );
}

function GameEventEditor({
  event,
  players,
  teams,
  onSaved,
}: {
  event: GameEventItem;
  players: PlayerOption[];
  teams: TeamOption[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EventFormState>(() => ({
    minute: String(event.minute),
    extraMinute: event.extraMinute === null ? '' : String(event.extraMinute),
    type: event.type,
    teamId: event.teamId || teams.find((team) => team.nameHe === event.team || team.nameEn === event.team)?.id || teams[0]?.id || '',
    playerId: event.playerId || '',
    relatedPlayerId: event.relatedPlayerId || '',
    assistPlayerId: event.assistPlayerId || '',
    notesHe: event.notesHe || '',
    notesEn: event.notesEn || '',
    sortOrder: String(event.sortOrder),
  }));
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm({
      minute: String(event.minute),
      extraMinute: event.extraMinute === null ? '' : String(event.extraMinute),
      type: event.type,
      teamId: event.teamId || teams.find((team) => team.nameHe === event.team || team.nameEn === event.team)?.id || teams[0]?.id || '',
      playerId: event.playerId || '',
      relatedPlayerId: event.relatedPlayerId || '',
      assistPlayerId: event.assistPlayerId || '',
      notesHe: event.notesHe || '',
      notesEn: event.notesEn || '',
      sortOrder: String(event.sortOrder),
    });
  }, [event, teams]);

  async function saveEvent() {
    setMessage('');
    const response = await fetch('/api/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: event.id,
        minute: form.minute,
        extraMinute: form.extraMinute,
        type: form.type,
        team: teams.find((team) => team.id === form.teamId)?.nameHe || teams.find((team) => team.id === form.teamId)?.nameEn || event.team,
        teamId: form.teamId,
        playerId: form.playerId || null,
        relatedPlayerId: form.relatedPlayerId || null,
        assistPlayerId: form.assistPlayerId || null,
        notesHe: form.notesHe,
        notesEn: form.notesEn,
        sortOrder: form.sortOrder,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || 'שמירת האירוע נכשלה.');
      return;
    }
    setMessage('האירוע נשמר.');
    onSaved();
  }

  async function deleteEvent() {
    const response = await fetch(`/api/events?id=${event.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || 'מחיקת האירוע נכשלה.');
      return;
    }
    onSaved();
  }

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black text-stone-900">
            {event.minute}
            {event.extraMinute ? `+${event.extraMinute}` : ''}&apos; · {event.type}
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="דקה" type="number" value={form.minute} onChange={(value) => setForm((current) => ({ ...current, minute: value }))} />
        <Field label="תוספת דקה" type="number" value={form.extraMinute} onChange={(value) => setForm((current) => ({ ...current, extraMinute: value }))} />
        <SelectField
          label="סוג אירוע"
          value={form.type}
          onChange={(value) => setForm((current) => ({ ...current, type: value }))}
          options={[
            { value: 'GOAL', label: 'שער' },
            { value: 'ASSIST', label: 'בישול' },
            { value: 'YELLOW_CARD', label: 'כרטיס צהוב' },
            { value: 'RED_CARD', label: 'כרטיס אדום' },
            { value: 'SUBSTITUTION_IN', label: 'חילוף נכנס' },
            { value: 'SUBSTITUTION_OUT', label: 'חילוף יוצא' },
            { value: 'OWN_GOAL', label: 'שער עצמי' },
            { value: 'PENALTY_GOAL', label: 'פנדל' },
            { value: 'PENALTY_MISSED', label: 'פנדל מוחמץ' },
          ]}
        />
        <SelectField
          label="קבוצה"
          value={form.teamId}
          onChange={(value) => setForm((current) => ({ ...current, teamId: value }))}
          options={teams.map((team) => ({ value: team.id, label: team.nameHe || team.nameEn }))}
        />
        <SelectField
          label="שחקן"
          value={form.playerId}
          onChange={(value) => setForm((current) => ({ ...current, playerId: value }))}
          options={players.map((player) => ({ value: player.id, label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}` }))}
        />
        <SelectField
          label="שחקן קשור"
          value={form.relatedPlayerId}
          onChange={(value) => setForm((current) => ({ ...current, relatedPlayerId: value }))}
          options={players.map((player) => ({ value: player.id, label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}` }))}
        />
        <SelectField
          label="שחקן בישול"
          value={form.assistPlayerId}
          onChange={(value) => setForm((current) => ({ ...current, assistPlayerId: value }))}
          options={players.map((player) => ({ value: player.id, label: `${formatPlayerName(player)} · ${player.team.nameHe || player.team.nameEn}` }))}
        />
        <Field label="סדר" type="number" value={form.sortOrder} onChange={(value) => setForm((current) => ({ ...current, sortOrder: value }))} />
        <Field label="הערה בעברית" value={form.notesHe} onChange={(value) => setForm((current) => ({ ...current, notesHe: value }))} />
        <Field label="הערה באנגלית" value={form.notesEn} onChange={(value) => setForm((current) => ({ ...current, notesEn: value }))} />
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
