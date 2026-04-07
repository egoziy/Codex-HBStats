'use client';

import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import AdminDataCoveragePanel from '@/components/AdminDataCoveragePanel';
import ApiFetchForm from '@/components/ApiFetchForm';
import type { AdminCoverageRow } from '@/lib/admin-data-coverage';
import { formatCoachName, getLatestCoachAssignment } from '@/lib/coach-display';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { formatPlayerName } from '@/lib/player-display';

type TeamGroup = {
  key: string;
  displayNameHe: string | null;
  displayNameEn: string;
  logoUrl: string | null;
  seasons: string[];
  latestSeasonYear: number;
};

type FetchJob = {
  id: string;
  labelHe: string;
  status: string;
  progressPercent: number;
  createdAt: Date | string;
};

type FetchTeam = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  logoUrl: string | null;
};

type Season = {
  id: string;
  year: number;
  name: string;
};

type RawCompetition = {
  id: string;
  nameHe: string;
  nameEn: string;
  apiFootballId: number | null;
};

type RawStanding = {
  id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
  competition: RawCompetition | null;
  team?: {
    id: string;
    nameHe: string;
    nameEn: string;
  };
};

type RawPlayer = {
  id: string;
  nameEn: string;
  nameHe: string;
  position: string | null;
  jerseyNumber: number | null;
  photoUrl: string | null;
};

type RawTeam = {
  id: string;
  apiFootballId: number | null;
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
  coachHe: string | null;
  coach: string | null;
  coachAssignments: {
    id: string;
    coachNameEn: string;
    coachNameHe: string | null;
    startDate: string | Date | null;
    endDate: string | Date | null;
    createdAt?: string | Date;
  }[];
  players: RawPlayer[];
  standings: RawStanding[];
};

type RawGameEvent = {
  id: string;
  minute: number;
  extraMinute: number | null;
  type: string;
  team: string;
  notesHe: string | null;
  notesEn: string | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
  relatedPlayer: { id: string; nameHe: string; nameEn: string } | null;
  eventTeam: { id: string; nameHe: string; nameEn: string } | null;
};

type RawGameLineupEntry = {
  id: string;
  role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
  participantType: 'PLAYER' | 'COACH';
  participantName: string | null;
  formation: string | null;
  positionName: string | null;
  positionGrid: string | null;
  jerseyNumber: number | null;
  team: { id: string; nameHe: string; nameEn: string };
  player: { id: string; nameHe: string; nameEn: string } | null;
};

type RawGame = {
  id: string;
  apiFootballId: number | null;
  roundNameHe: string | null;
  roundNameEn: string | null;
  dateTime: string | Date;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; nameHe: string; nameEn: string };
  awayTeam: { id: string; nameHe: string; nameEn: string };
  competition: RawCompetition | null;
  lineupEntries: RawGameLineupEntry[];
  events: RawGameEvent[];
  gameStats: {
    homeShotsOnTarget: number | null;
    awayShotsOnTarget: number | null;
    homeYellowCards: number | null;
    awayYellowCards: number | null;
    homeRedCards: number | null;
    awayRedCards: number | null;
  } | null;
};

type RawFetchJob = {
  id: string;
  labelHe: string;
  status: string;
  progressPercent: number;
  createdAt: string | Date;
  competition: RawCompetition | null;
  team: { id: string; nameHe: string; nameEn: string } | null;
};

type RawPlayerStat = {
  id: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  gamesPlayed: number;
  minutesPlayed: number;
  competition: RawCompetition | null;
  player: {
    id: string;
    nameHe: string;
    nameEn: string;
    team: { id: string; nameHe: string; nameEn: string };
  };
};

type RawTeamStat = {
  id: string;
  totalGoals: number;
  totalAssists: number;
  goalsConceded: number;
  cleanSheets: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  competition: RawCompetition | null;
  team: { id: string; nameHe: string; nameEn: string };
};

type RawCompetitionSeason = {
  id: string;
  stageNameHe: string | null;
  currentRoundHe: string | null;
  competition: RawCompetition;
};

type RawLeaderboardEntry = {
  id: string;
  category: 'TOP_SCORERS' | 'TOP_ASSISTS';
  rank: number;
  value: number;
  gamesPlayed: number;
  competition: RawCompetition;
  player: { id: string; nameHe: string; nameEn: string } | null;
  team: { id: string; nameHe: string; nameEn: string } | null;
  playerNameHe: string | null;
  playerNameEn: string | null;
  teamNameHe: string | null;
  teamNameEn: string | null;
};

type RawInjury = {
  id: string;
  playerNameHe: string | null;
  playerNameEn: string | null;
  teamNameHe: string | null;
  teamNameEn: string | null;
  typeHe: string | null;
  typeEn: string | null;
  reasonHe: string | null;
  reasonEn: string | null;
  fixtureDate: string | Date | null;
  competition: RawCompetition | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
  team: { id: string; nameHe: string; nameEn: string } | null;
  game: {
    id: string;
    homeTeam: { id: string; nameHe: string; nameEn: string };
    awayTeam: { id: string; nameHe: string; nameEn: string };
  } | null;
};

type RawTransfer = {
  id: string;
  playerNameHe: string | null;
  playerNameEn: string | null;
  transferDate: string | Date | null;
  transferTypeHe: string | null;
  transferTypeEn: string | null;
  sourceTeamNameHe: string | null;
  sourceTeamNameEn: string | null;
  destinationTeamNameHe: string | null;
  destinationTeamNameEn: string | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
};

type RawTrophy = {
  id: string;
  playerNameHe: string | null;
  playerNameEn: string | null;
  leagueNameHe: string | null;
  leagueNameEn: string;
  countryHe: string | null;
  countryEn: string | null;
  seasonLabel: string | null;
  placeHe: string | null;
  placeEn: string | null;
  player: { id: string; nameHe: string; nameEn: string } | null;
};

type RawPrediction = {
  id: string;
  winnerTeamNameHe: string | null;
  winnerTeamNameEn: string | null;
  winnerCommentHe: string | null;
  winnerCommentEn: string | null;
  adviceHe: string | null;
  adviceEn: string | null;
  winOrDraw: boolean | null;
  goalsHome: string | null;
  goalsAway: string | null;
  percentHome: number | null;
  percentDraw: number | null;
  percentAway: number | null;
  game: {
    id: string;
    homeTeam: { id: string; nameHe: string; nameEn: string };
    awayTeam: { id: string; nameHe: string; nameEn: string };
  };
};

type RawHeadToHeadEntry = {
  id: string;
  relatedCompetitionNameHe: string | null;
  relatedCompetitionNameEn: string | null;
  relatedRoundHe: string | null;
  relatedRoundEn: string | null;
  relatedDate: string | Date | null;
  homeTeamNameHe: string | null;
  homeTeamNameEn: string | null;
  awayTeamNameHe: string | null;
  awayTeamNameEn: string | null;
  homeScore: number | null;
  awayScore: number | null;
  game: {
    id: string;
    homeTeam: { id: string; nameHe: string; nameEn: string };
    awayTeam: { id: string; nameHe: string; nameEn: string };
  };
};

type RawOddsValue = {
  id: string;
  bookmakerName: string;
  marketName: string;
  selectionValue: string;
  odd: string;
  oddsUpdatedAt: string | Date | null;
  game: {
    id: string;
    homeTeam: { id: string; nameHe: string; nameEn: string };
    awayTeam: { id: string; nameHe: string; nameEn: string };
  };
};

type RawLiveSnapshot = {
  id: string;
  leagueNameHe: string | null;
  leagueNameEn: string | null;
  roundHe: string | null;
  roundEn: string | null;
  statusShort: string | null;
  statusLong: string | null;
  elapsed: number | null;
  extra: number | null;
  snapshotAt: string | Date;
  fixtureDate: string | Date | null;
  homeTeamNameHe: string | null;
  homeTeamNameEn: string | null;
  awayTeamNameHe: string | null;
  awayTeamNameEn: string | null;
  homeScore: number | null;
  awayScore: number | null;
  eventCount: number;
};

type RawData = {
  id: string;
  name: string;
  year: number;
  teams: RawTeam[];
  games: RawGame[];
  standings: RawStanding[];
  fetchJobs: RawFetchJob[];
  playerStats: RawPlayerStat[];
  teamStats: RawTeamStat[];
  competitions: RawCompetitionSeason[];
  leaderboardEntries: RawLeaderboardEntry[];
  injuries: RawInjury[];
  transfers: RawTransfer[];
  trophies: RawTrophy[];
  predictions: RawPrediction[];
  headToHeadEntries: RawHeadToHeadEntry[];
  oddsValues: RawOddsValue[];
  liveSnapshots: RawLiveSnapshot[];
};

type RawView =
  | 'competitions'
  | 'teams'
  | 'players'
  | 'games'
  | 'events'
  | 'lineups'
  | 'standings'
  | 'playerStats'
  | 'teamStats'
  | 'leaderboards'
  | 'injuries'
  | 'transfers'
  | 'trophies'
  | 'predictions'
  | 'h2h'
  | 'odds'
  | 'livescore'
  | 'jobs';

const RAW_EVENT_LABELS: Record<string, string> = {
  GOAL: 'שער',
  ASSIST: 'בישול',
  YELLOW_CARD: 'כרטיס צהוב',
  RED_CARD: 'כרטיס אדום',
  SUBSTITUTION_IN: 'חילוף נכנס',
  SUBSTITUTION_OUT: 'חילוף יוצא',
  OWN_GOAL: 'שער עצמי',
  PENALTY_GOAL: 'שער בפנדל',
  PENALTY_MISSED: 'פנדל מוחמץ',
};

const RAW_LINEUP_ROLE_LABELS: Record<string, string> = {
  STARTER: 'הרכב פותח',
  SUBSTITUTE: 'ספסל',
  COACH: 'מאמן',
};

const RAW_LEADERBOARD_LABELS: Record<string, string> = {
  TOP_SCORERS: 'מלך השערים',
  TOP_ASSISTS: 'מלך הבישולים',
};

export default function AdminManagerClient({
  teams,
  fetchTeams,
  fetchJobs,
  seasons,
  selectedSeasonId,
  rawData,
  coverageRows,
}: {
  teams: TeamGroup[];
  fetchTeams: FetchTeam[];
  fetchJobs: FetchJob[];
  seasons: Season[];
  selectedSeasonId: string | null;
  rawData: RawData | null;
  coverageRows: AdminCoverageRow[];
}) {
  function normalizeAdminSearchValue(value: string) {
    return value.trim().toLocaleLowerCase('he-IL');
  }

  const [openSection, setOpenSection] = useState<'fetch' | 'coverage' | 'raw' | 'teams' | 'jobs'>('coverage');
  const [rawView, setRawView] = useState<RawView>('teams');
  const [teamSearch, setTeamSearch] = useState('');
  const [showSelectedSeasonTeamsOnly, setShowSelectedSeasonTeamsOnly] = useState(true);
  const deferredTeamSearch = useDeferredValue(teamSearch);
  const selectedSeasonName = seasons.find((season) => season.id === selectedSeasonId)?.name ?? null;
  const rawEvents = rawData?.games.flatMap((game) =>
    game.events.map((event) => ({
      ...event,
      gameId: game.id,
      gameLabel: `${game.homeTeam.nameHe || game.homeTeam.nameEn} - ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
      dateTime: game.dateTime,
      competition: game.competition,
      roundNameHe: game.roundNameHe,
      roundNameEn: game.roundNameEn,
    }))
  ) || [];
  const rawPlayers = rawData?.teams.flatMap((team) =>
    team.players.map((player) => ({
      ...player,
      teamId: team.id,
      teamNameHe: team.nameHe,
      teamNameEn: team.nameEn,
    }))
  ) || [];
  const rawLineups = rawData?.games.flatMap((game) =>
    game.lineupEntries.map((entry) => ({
      ...entry,
      gameId: game.id,
      gameLabel: `${game.homeTeam.nameHe || game.homeTeam.nameEn} - ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
    }))
  ) || [];
  const sectionOrder: Array<'fetch' | 'coverage' | 'raw' | 'teams' | 'jobs'> = ['fetch', 'coverage', 'raw', 'teams', 'jobs'];
  const normalizedTeamSearch = normalizeAdminSearchValue(deferredTeamSearch);
  const filteredTeams = teams.filter((team) => {
    const matchesSelectedSeason = !showSelectedSeasonTeamsOnly || !selectedSeasonName || team.seasons.includes(selectedSeasonName);

    if (!matchesSelectedSeason) {
      return false;
    }

    if (!normalizedTeamSearch) {
      return true;
    }

    const searchableValues = [team.displayNameHe || '', team.displayNameEn, ...team.seasons];
    return searchableValues.some((value) => normalizeAdminSearchValue(value).includes(normalizedTeamSearch));
  });
  const rawViewOptions: Array<{ key: RawView; label: string; count: number }> = [
    { key: 'competitions', label: 'מסגרות', count: rawData?.competitions.length || 0 },
    { key: 'teams', label: 'קבוצות', count: rawData?.teams.length || 0 },
    { key: 'players', label: 'סגלים ושחקנים', count: rawPlayers.length },
    { key: 'games', label: 'משחקים', count: rawData?.games.length || 0 },
    { key: 'events', label: 'אירועים', count: rawEvents.length },
    { key: 'lineups', label: 'הרכבים', count: rawLineups.length },
    { key: 'standings', label: 'טבלה', count: rawData?.standings.length || 0 },
    { key: 'playerStats', label: 'סטטיסטיקות שחקן', count: rawData?.playerStats.length || 0 },
    { key: 'teamStats', label: 'סטטיסטיקות קבוצה', count: rawData?.teamStats.length || 0 },
    { key: 'leaderboards', label: 'מלכי שערים/בישולים', count: rawData?.leaderboardEntries.length || 0 },
    { key: 'injuries', label: 'פציעות', count: rawData?.injuries.length || 0 },
    { key: 'transfers', label: 'העברות', count: rawData?.transfers.length || 0 },
    { key: 'trophies', label: 'תארים', count: rawData?.trophies.length || 0 },
    { key: 'predictions', label: 'תחזיות', count: rawData?.predictions.length || 0 },
    { key: 'h2h', label: 'ראש בראש', count: rawData?.headToHeadEntries.length || 0 },
    { key: 'odds', label: 'יחסים', count: rawData?.oddsValues.length || 0 },
    { key: 'livescore', label: 'לייב', count: rawData?.liveSnapshots.length || 0 },
    { key: 'jobs', label: 'עבודות משיכה', count: rawData?.fetchJobs.length || 0 },
  ];

  function cycleSection(current: 'fetch' | 'coverage' | 'raw' | 'teams' | 'jobs') {
    const index = sectionOrder.indexOf(current);
    return sectionOrder[(index + 1) % sectionOrder.length];
  }

  return (
    <div className="space-y-4">
      <Accordion
        title="משיכת נתונים"
        open={openSection === 'fetch'}
        onToggle={() => setOpenSection(openSection === 'fetch' ? cycleSection('fetch') : 'fetch')}
      >
        <ApiFetchForm teams={fetchTeams} />
      </Accordion>

      <Accordion
        title="נתונים קיימים והמלצת עדכון"
        open={openSection === 'coverage'}
        onToggle={() => setOpenSection(openSection === 'coverage' ? cycleSection('coverage') : 'coverage')}
      >
        <AdminDataCoveragePanel
          rows={coverageRows}
          seasons={seasons.map((season) => ({
            id: season.id,
            name: season.name,
          }))}
          initialSeasonId={selectedSeasonId}
        />
      </Accordion>

      <Accordion
        title="דאטה גולמי לפי עונה"
        open={openSection === 'raw'}
        onToggle={() => setOpenSection(openSection === 'raw' ? cycleSection('raw') : 'raw')}
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 font-bold text-stone-900">בחירת עונה</div>
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => (
                <Link
                  key={season.id}
                  href={`/admin?season=${season.id}`}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    selectedSeasonId === season.id
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-300 bg-stone-50 text-stone-700'
                  }`}
                >
                  {season.name}
                </Link>
              ))}
            </div>
          </div>

          {rawData ? (
            <>
              <div className="flex flex-wrap gap-2">
                {rawViewOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setRawView(option.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      rawView === option.key
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {option.label} <span className="text-[10px] opacity-60">{option.count}</span>
                  </button>
                ))}
              </div>

              {rawView === 'competitions' ? <RawCompetitionsView rawData={rawData} /> : null}
              {rawView === 'teams' ? <RawTeamsView rawData={rawData} /> : null}
              {rawView === 'players' ? <RawPlayersView rawPlayers={rawPlayers} /> : null}
              {rawView === 'games' ? <RawGamesView rawData={rawData} /> : null}
              {rawView === 'events' ? <RawEventsView rawEvents={rawEvents} /> : null}
              {rawView === 'lineups' ? <RawLineupsView rawLineups={rawLineups} /> : null}
              {rawView === 'standings' ? <RawStandingsView rawData={rawData} /> : null}
              {rawView === 'playerStats' ? <RawPlayerStatsView rawData={rawData} /> : null}
              {rawView === 'teamStats' ? <RawTeamStatsView rawData={rawData} /> : null}
              {rawView === 'leaderboards' ? <RawLeaderboardsView rawData={rawData} /> : null}
              {rawView === 'injuries' ? <RawInjuriesView rawData={rawData} /> : null}
              {rawView === 'transfers' ? <RawTransfersView rawData={rawData} /> : null}
              {rawView === 'trophies' ? <RawTrophiesView rawData={rawData} /> : null}
              {rawView === 'predictions' ? <RawPredictionsView rawData={rawData} /> : null}
              {rawView === 'h2h' ? <RawHeadToHeadView rawData={rawData} /> : null}
              {rawView === 'odds' ? <RawOddsView rawData={rawData} /> : null}
              {rawView === 'livescore' ? <RawLivescoreView rawData={rawData} /> : null}
              {rawView === 'jobs' ? <RawJobsView rawData={rawData} /> : null}
            </>
          ) : (
            <EmptyAdminState text="אין עונה זמינה להצגת דאטה גולמי." />
          )}
        </div>
      </Accordion>

      <Accordion
        title="קבוצות במערכת"
        open={openSection === 'teams'}
        onToggle={() => setOpenSection(openSection === 'teams' ? cycleSection('teams') : 'teams')}
      >
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          כל קבוצה מוצגת פעם אחת בלבד. לחיצה על קבוצה תוביל למיני-סייט עריכה שבו בוחרים עונה ומנהלים
          את פרטי הקבוצה והשחקנים.
        </div>

        <div className="mb-4 rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <label htmlFor="admin-team-search" className="mb-2 block text-sm font-bold text-stone-900">
                חיפוש קבוצה לעריכה
              </label>
              <input
                id="admin-team-search"
                type="search"
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                placeholder="כתוב שם קבוצה בעברית, באנגלית או שם עונה"
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-red-400 focus:bg-white"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={showSelectedSeasonTeamsOnly}
                onChange={(event) => setShowSelectedSeasonTeamsOnly(event.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
              />
              {selectedSeasonName ? `רק קבוצות מהעונה ${selectedSeasonName}` : 'רק קבוצות מהעונה הנבחרת'}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-800">
              {filteredTeams.length} מתוך {teams.length} קבוצות
            </span>
            {normalizedTeamSearch ? (
              <button
                type="button"
                onClick={() => setTeamSearch('')}
                className="rounded-full border border-stone-300 px-3 py-1 font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              >
                נקה חיפוש
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTeams.map((team) => (
            <Link
              key={team.key}
              href={`/admin/teams/${team.key}`}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-red-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    alt={team.displayNameHe || team.displayNameEn}
                    className="h-12 w-12 rounded-full border border-stone-200 bg-white object-contain p-1"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate font-bold text-stone-900">{team.displayNameHe || team.displayNameEn}</div>
                  <div className="truncate text-sm text-stone-500">{team.displayNameEn}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {team.seasons.slice(0, 4).map((season) => (
                  <span key={season} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                    {season}
                  </span>
                ))}
                {team.seasons.length > 4 ? (
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                    +{team.seasons.length - 4}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
          {teams.length === 0 ? <EmptyAdminState text="עדיין אין קבוצות שנשמרו במערכת." /> : null}
        </div>
      </Accordion>

      <Accordion
        title="עבודות משיכה אחרונות"
        open={openSection === 'jobs'}
        onToggle={() => setOpenSection(openSection === 'jobs' ? cycleSection('jobs') : 'jobs')}
      >
        <div className="mb-4 text-sm text-stone-500">עונות זמינות במערכת: {seasons.map((season) => season.name).join(', ')}</div>
        <div className="space-y-3">
          {fetchJobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-stone-900">{job.labelHe}</div>
                  <div className="text-xs text-stone-500">
                    {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(
                      new Date(job.createdAt)
                    )}
                  </div>
                </div>
                <div className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-700">
                  {job.status} | {job.progressPercent}%
                </div>
              </div>
            </article>
          ))}
          {fetchJobs.length === 0 ? <EmptyAdminState text="עדיין אין עבודות משיכה שמורות." /> : null}
        </div>
      </Accordion>
    </div>
  );
}

function DataCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-lg font-black text-stone-900">{title}</h3>
      {children}
    </section>
  );
}

function RawCompetitionsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="מסגרות לעונה">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rawData.competitions.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="font-bold text-stone-900">{getCompetitionDisplayName(entry.competition)}</div>
            <div className="mt-1 text-sm text-stone-500">{entry.competition.nameEn}</div>
            {entry.stageNameHe || entry.currentRoundHe ? (
              <div className="mt-3 text-xs text-stone-600">
                {entry.stageNameHe || 'ללא שלב'} | {entry.currentRoundHe || 'ללא מחזור נוכחי'}
              </div>
            ) : null}
          </div>
        ))}
        {rawData.competitions.length === 0 ? <EmptyAdminState text="אין מסגרות שמורות לעונה הזו." /> : null}
      </div>
    </DataCard>
  );
}

function RawTeamsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="קבוצות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">שם מקור</th>
              <th className="px-3 py-3">API ID</th>
              <th className="px-3 py-3">מאמן</th>
              <th className="px-3 py-3">שחקנים</th>
            </tr>
          </thead>
          <tbody>
            {rawData.teams.map((team) => {
              const latestCoachAssignment = getLatestCoachAssignment(team.coachAssignments || []);

              return (
                <tr key={team.id} className="border-b border-stone-100">
                  <td className="px-3 py-3 font-semibold text-stone-900">{team.nameHe || team.nameEn}</td>
                  <td className="px-3 py-3 text-stone-600">{team.nameEn}</td>
                  <td className="px-3 py-3">{team.apiFootballId ?? '-'}</td>
                  <td className="px-3 py-3">{formatCoachName(latestCoachAssignment) || team.coachHe || team.coach || '-'}</td>
                  <td className="px-3 py-3">{team.players.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rawData.teams.length === 0 ? <EmptyAdminState text="אין קבוצות שמורות לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawPlayersView({
  rawPlayers,
}: {
  rawPlayers: Array<RawPlayer & { teamId: string; teamNameHe: string; teamNameEn: string }>;
}) {
  return (
    <DataCard title="סגלים ושחקנים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">שם מקור</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">עמדה</th>
              <th className="px-3 py-3">מספר</th>
            </tr>
          </thead>
          <tbody>
            {rawPlayers.map((player) => (
              <tr key={player.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">{formatPlayerName(player)}</td>
                <td className="px-3 py-3 text-stone-600">{player.nameEn}</td>
                <td className="px-3 py-3">{player.teamNameHe || player.teamNameEn}</td>
                <td className="px-3 py-3">{player.position || '-'}</td>
                <td className="px-3 py-3">{player.jerseyNumber ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawPlayers.length === 0 ? <EmptyAdminState text="אין שחקנים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawGamesView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="משחקים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">תאריך</th>
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">תוצאה</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">מחזור</th>
              <th className="px-3 py-3">אירועים</th>
            </tr>
          </thead>
          <tbody>
            {rawData.games.map((game) => (
              <tr key={game.id} className="border-b border-stone-100">
                <td className="px-3 py-3 text-stone-600">
                  {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(
                    new Date(game.dateTime)
                  )}
                </td>
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {game.homeTeam.nameHe || game.homeTeam.nameEn} - {game.awayTeam.nameHe || game.awayTeam.nameEn}
                </td>
                <td className="px-3 py-3">{getGameScoreDisplay(game)}</td>
                <td className="px-3 py-3">{getCompetitionDisplayName(game.competition)}</td>
                <td className="px-3 py-3">{getRoundDisplayName(game.roundNameHe, game.roundNameEn)}</td>
                <td className="px-3 py-3">{game.events.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.games.length === 0 ? <EmptyAdminState text="אין משחקים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawEventsView({
  rawEvents,
}: {
  rawEvents: Array<
    RawGameEvent & {
      gameId: string;
      gameLabel: string;
      dateTime: string | Date;
      competition: RawCompetition | null;
      roundNameHe: string | null;
      roundNameEn: string | null;
    }
  >;
}) {
  return (
    <DataCard title="אירועי משחק">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">דקה</th>
              <th className="px-3 py-3">סוג</th>
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">שחקן קשור</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">הערה</th>
            </tr>
          </thead>
          <tbody>
            {rawEvents.map((event) => (
              <tr key={event.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">{event.gameLabel}</td>
                <td className="px-3 py-3">
                  {event.minute}
                  {event.extraMinute ? `+${event.extraMinute}` : ''}
                </td>
                <td className="px-3 py-3">{RAW_EVENT_LABELS[event.type] || event.type}</td>
                <td className="px-3 py-3">{event.player ? formatPlayerName(event.player) : '-'}</td>
                <td className="px-3 py-3">{event.relatedPlayer ? formatPlayerName(event.relatedPlayer) : '-'}</td>
                <td className="px-3 py-3">{event.eventTeam?.nameHe || event.team || '-'}</td>
                <td className="px-3 py-3 text-stone-600">{event.notesHe || event.notesEn || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawEvents.length === 0 ? <EmptyAdminState text="אין אירועים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawLineupsView({
  rawLineups,
}: {
  rawLineups: Array<
    RawGameLineupEntry & {
      gameId: string;
      gameLabel: string;
    }
  >;
}) {
  return (
    <DataCard title="הרכבים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">סוג</th>
              <th className="px-3 py-3">משתתף</th>
              <th className="px-3 py-3">עמדה</th>
              <th className="px-3 py-3">גריד</th>
              <th className="px-3 py-3">מספר</th>
              <th className="px-3 py-3">מערך</th>
            </tr>
          </thead>
          <tbody>
            {rawLineups.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">{entry.gameLabel}</td>
                <td className="px-3 py-3">{entry.team.nameHe || entry.team.nameEn}</td>
                <td className="px-3 py-3">{RAW_LINEUP_ROLE_LABELS[entry.role] || entry.role}</td>
                <td className="px-3 py-3">{entry.player ? formatPlayerName(entry.player) : entry.participantName || '-'}</td>
                <td className="px-3 py-3">{entry.positionName || '-'}</td>
                <td className="px-3 py-3">{entry.positionGrid || '-'}</td>
                <td className="px-3 py-3">{entry.jerseyNumber ?? '-'}</td>
                <td className="px-3 py-3">{entry.formation || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawLineups.length === 0 ? <EmptyAdminState text="אין הרכבים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawStandingsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="טבלת ליגה גולמית">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">מיקום</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">מש&apos;</th>
              <th className="px-3 py-3">נצ&apos;</th>
              <th className="px-3 py-3">ת&apos;</th>
              <th className="px-3 py-3">הפ&apos;</th>
              <th className="px-3 py-3">יחס</th>
              <th className="px-3 py-3">נק&apos;</th>
            </tr>
          </thead>
          <tbody>
            {rawData.standings.map((row) => (
              <tr key={row.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-bold">{row.position}</td>
                <td className="px-3 py-3 font-semibold text-stone-900">{row.team?.nameHe || row.team?.nameEn || '-'}</td>
                <td className="px-3 py-3">{getCompetitionDisplayName(row.competition)}</td>
                <td className="px-3 py-3">{row.played}</td>
                <td className="px-3 py-3">{row.wins}</td>
                <td className="px-3 py-3">{row.draws}</td>
                <td className="px-3 py-3">{row.losses}</td>
                <td className="px-3 py-3">{row.goalsFor}:{row.goalsAgainst}</td>
                <td className="px-3 py-3">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.standings.length === 0 ? <EmptyAdminState text="אין טבלה שמורה לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawPlayerStatsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="סטטיסטיקות שחקן גולמיות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">משחקים</th>
              <th className="px-3 py-3">דקות</th>
              <th className="px-3 py-3">שערים</th>
              <th className="px-3 py-3">בישולים</th>
              <th className="px-3 py-3">צהובים</th>
              <th className="px-3 py-3">אדומים</th>
            </tr>
          </thead>
          <tbody>
            {rawData.playerStats.map((stat) => (
              <tr key={stat.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">{formatPlayerName(stat.player)}</td>
                <td className="px-3 py-3">{stat.player.team.nameHe || stat.player.team.nameEn}</td>
                <td className="px-3 py-3">{getCompetitionDisplayName(stat.competition)}</td>
                <td className="px-3 py-3">{stat.gamesPlayed}</td>
                <td className="px-3 py-3">{stat.minutesPlayed}</td>
                <td className="px-3 py-3">{stat.goals}</td>
                <td className="px-3 py-3">{stat.assists}</td>
                <td className="px-3 py-3">{stat.yellowCards}</td>
                <td className="px-3 py-3">{stat.redCards}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.playerStats.length === 0 ? <EmptyAdminState text="אין סטטיסטיקות שחקן לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawTeamStatsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="סטטיסטיקות קבוצה גולמיות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">שערים</th>
              <th className="px-3 py-3">בישולים</th>
              <th className="px-3 py-3">ספיגות</th>
              <th className="px-3 py-3">קלין שיט</th>
              <th className="px-3 py-3">נ&apos;</th>
              <th className="px-3 py-3">ת&apos;</th>
              <th className="px-3 py-3">ה&apos;</th>
              <th className="px-3 py-3">נק&apos;</th>
            </tr>
          </thead>
          <tbody>
            {rawData.teamStats.map((stat) => (
              <tr key={stat.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">{stat.team.nameHe || stat.team.nameEn}</td>
                <td className="px-3 py-3">{getCompetitionDisplayName(stat.competition)}</td>
                <td className="px-3 py-3">{stat.totalGoals}</td>
                <td className="px-3 py-3">{stat.totalAssists}</td>
                <td className="px-3 py-3">{stat.goalsConceded}</td>
                <td className="px-3 py-3">{stat.cleanSheets}</td>
                <td className="px-3 py-3">{stat.wins}</td>
                <td className="px-3 py-3">{stat.draws}</td>
                <td className="px-3 py-3">{stat.losses}</td>
                <td className="px-3 py-3">{stat.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.teamStats.length === 0 ? <EmptyAdminState text="אין סטטיסטיקות קבוצה לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawLeaderboardsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="מלכי שערים ובישולים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">קטגוריה</th>
              <th className="px-3 py-3">מיקום</th>
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">ערך</th>
              <th className="px-3 py-3">משחקים</th>
            </tr>
          </thead>
          <tbody>
            {rawData.leaderboardEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3">{RAW_LEADERBOARD_LABELS[entry.category] || entry.category}</td>
                <td className="px-3 py-3 font-bold">{entry.rank}</td>
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {formatPlayerName(entry.player, entry.playerNameHe, entry.playerNameEn)}
                </td>
                <td className="px-3 py-3">
                  {entry.team?.nameHe || entry.teamNameHe || entry.team?.nameEn || entry.teamNameEn || '-'}
                </td>
                <td className="px-3 py-3">{getCompetitionDisplayName(entry.competition)}</td>
                <td className="px-3 py-3">{entry.value}</td>
                <td className="px-3 py-3">{entry.gamesPlayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.leaderboardEntries.length === 0 ? <EmptyAdminState text="אין טבלאות מלכי שערים/בישולים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawInjuriesView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="פציעות והיעדרויות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">קבוצה</th>
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">תאריך</th>
              <th className="px-3 py-3">סוג</th>
              <th className="px-3 py-3">סיבה</th>
            </tr>
          </thead>
          <tbody>
            {rawData.injuries.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {formatPlayerName(entry.player, entry.playerNameHe, entry.playerNameEn)}
                </td>
                <td className="px-3 py-3">
                  {entry.team?.nameHe || entry.teamNameHe || entry.team?.nameEn || entry.teamNameEn || '-'}
                </td>
                <td className="px-3 py-3">
                  {entry.game
                    ? `${entry.game.homeTeam.nameHe || entry.game.homeTeam.nameEn} - ${entry.game.awayTeam.nameHe || entry.game.awayTeam.nameEn}`
                    : '-'}
                </td>
                <td className="px-3 py-3">{getCompetitionDisplayName(entry.competition)}</td>
                <td className="px-3 py-3 text-stone-600">
                  {entry.fixtureDate
                    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(entry.fixtureDate))
                    : '-'}
                </td>
                <td className="px-3 py-3">{entry.typeHe || entry.typeEn || '-'}</td>
                <td className="px-3 py-3">{entry.reasonHe || entry.reasonEn || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.injuries.length === 0 ? <EmptyAdminState text="אין פציעות שמורות לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawTransfersView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="העברות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">תאריך</th>
              <th className="px-3 py-3">סוג</th>
              <th className="px-3 py-3">מקבוצה</th>
              <th className="px-3 py-3">לקבוצה</th>
            </tr>
          </thead>
          <tbody>
            {rawData.transfers.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {formatPlayerName(entry.player, entry.playerNameHe, entry.playerNameEn)}
                </td>
                <td className="px-3 py-3 text-stone-600">
                  {entry.transferDate
                    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(entry.transferDate))
                    : '-'}
                </td>
                <td className="px-3 py-3">{entry.transferTypeHe || entry.transferTypeEn || '-'}</td>
                <td className="px-3 py-3">{entry.sourceTeamNameHe || entry.sourceTeamNameEn || '-'}</td>
                <td className="px-3 py-3">{entry.destinationTeamNameHe || entry.destinationTeamNameEn || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.transfers.length === 0 ? <EmptyAdminState text="אין העברות שמורות לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawTrophiesView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="תארים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">שחקן</th>
              <th className="px-3 py-3">תחרות</th>
              <th className="px-3 py-3">מדינה</th>
              <th className="px-3 py-3">עונה</th>
              <th className="px-3 py-3">הישג</th>
            </tr>
          </thead>
          <tbody>
            {rawData.trophies.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {formatPlayerName(entry.player, entry.playerNameHe, entry.playerNameEn)}
                </td>
                <td className="px-3 py-3">{entry.leagueNameHe || entry.leagueNameEn}</td>
                <td className="px-3 py-3">{entry.countryHe || entry.countryEn || '-'}</td>
                <td className="px-3 py-3">{entry.seasonLabel || '-'}</td>
                <td className="px-3 py-3">{entry.placeHe || entry.placeEn || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.trophies.length === 0 ? <EmptyAdminState text="אין תארים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawPredictionsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="תחזיות">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">מנצחת חזויה</th>
              <th className="px-3 py-3">הערה</th>
              <th className="px-3 py-3">עצה</th>
              <th className="px-3 py-3">אחוזי בית</th>
              <th className="px-3 py-3">תיקו</th>
              <th className="px-3 py-3">אחוזי חוץ</th>
            </tr>
          </thead>
          <tbody>
            {rawData.predictions.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {entry.game.homeTeam.nameHe || entry.game.homeTeam.nameEn} - {entry.game.awayTeam.nameHe || entry.game.awayTeam.nameEn}
                </td>
                <td className="px-3 py-3">{entry.winnerTeamNameHe || entry.winnerTeamNameEn || '-'}</td>
                <td className="px-3 py-3">{entry.winnerCommentHe || entry.winnerCommentEn || '-'}</td>
                <td className="px-3 py-3">{entry.adviceHe || entry.adviceEn || '-'}</td>
                <td className="px-3 py-3">{entry.percentHome ?? '-'}{entry.percentHome !== null ? '%' : ''}</td>
                <td className="px-3 py-3">{entry.percentDraw ?? '-'}{entry.percentDraw !== null ? '%' : ''}</td>
                <td className="px-3 py-3">{entry.percentAway ?? '-'}{entry.percentAway !== null ? '%' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.predictions.length === 0 ? <EmptyAdminState text="אין תחזיות שמורות לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawHeadToHeadView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="ראש בראש">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">עבור משחק</th>
              <th className="px-3 py-3">מפגש קודם</th>
              <th className="px-3 py-3">תאריך</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">מחזור</th>
              <th className="px-3 py-3">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            {rawData.headToHeadEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {entry.game.homeTeam.nameHe || entry.game.homeTeam.nameEn} - {entry.game.awayTeam.nameHe || entry.game.awayTeam.nameEn}
                </td>
                <td className="px-3 py-3">
                  {entry.homeTeamNameHe || entry.homeTeamNameEn || '-'} - {entry.awayTeamNameHe || entry.awayTeamNameEn || '-'}
                </td>
                <td className="px-3 py-3 text-stone-600">
                  {entry.relatedDate ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(entry.relatedDate)) : '-'}
                </td>
                <td className="px-3 py-3">{entry.relatedCompetitionNameHe || entry.relatedCompetitionNameEn || '-'}</td>
                <td className="px-3 py-3">{getRoundDisplayName(entry.relatedRoundHe, entry.relatedRoundEn)}</td>
                <td className="px-3 py-3">{entry.homeScore ?? '-'}:{entry.awayScore ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.headToHeadEntries.length === 0 ? <EmptyAdminState text="אין נתוני ראש בראש שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawOddsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="יחסים">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">סוכן</th>
              <th className="px-3 py-3">שוק</th>
              <th className="px-3 py-3">בחירה</th>
              <th className="px-3 py-3">יחס</th>
              <th className="px-3 py-3">עודכן</th>
            </tr>
          </thead>
          <tbody>
            {rawData.oddsValues.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {entry.game.homeTeam.nameHe || entry.game.homeTeam.nameEn} - {entry.game.awayTeam.nameHe || entry.game.awayTeam.nameEn}
                </td>
                <td className="px-3 py-3">{entry.bookmakerName}</td>
                <td className="px-3 py-3">{entry.marketName}</td>
                <td className="px-3 py-3">{entry.selectionValue}</td>
                <td className="px-3 py-3">{entry.odd}</td>
                <td className="px-3 py-3 text-stone-600">
                  {entry.oddsUpdatedAt ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.oddsUpdatedAt)) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.oddsValues.length === 0 ? <EmptyAdminState text="אין יחסים שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawLivescoreView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="לייב">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="px-3 py-3">משחק</th>
              <th className="px-3 py-3">מסגרת</th>
              <th className="px-3 py-3">מחזור</th>
              <th className="px-3 py-3">סטטוס</th>
              <th className="px-3 py-3">דקה</th>
              <th className="px-3 py-3">תוצאה</th>
              <th className="px-3 py-3">אירועים</th>
              <th className="px-3 py-3">נסרק</th>
            </tr>
          </thead>
          <tbody>
            {rawData.liveSnapshots.map((entry) => (
              <tr key={entry.id} className="border-b border-stone-100">
                <td className="px-3 py-3 font-semibold text-stone-900">
                  {entry.homeTeamNameHe || entry.homeTeamNameEn || '-'} - {entry.awayTeamNameHe || entry.awayTeamNameEn || '-'}
                </td>
                <td className="px-3 py-3">{entry.leagueNameHe || entry.leagueNameEn || '-'}</td>
                <td className="px-3 py-3">{getRoundDisplayName(entry.roundHe, entry.roundEn)}</td>
                <td className="px-3 py-3">{entry.statusLong || entry.statusShort || '-'}</td>
                <td className="px-3 py-3">
                  {entry.elapsed ?? '-'}
                  {entry.extra ? `+${entry.extra}` : ''}
                </td>
                <td className="px-3 py-3">{entry.homeScore ?? '-'}:{entry.awayScore ?? '-'}</td>
                <td className="px-3 py-3">{entry.eventCount}</td>
                <td className="px-3 py-3 text-stone-600">
                  {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.snapshotAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rawData.liveSnapshots.length === 0 ? <EmptyAdminState text="אין משחקי לייב שמורים לעונה הזו." /> : null}
    </DataCard>
  );
}

function RawJobsView({ rawData }: { rawData: RawData }) {
  return (
    <DataCard title="עבודות משיכה של העונה">
      <div className="space-y-3">
        {rawData.fetchJobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-stone-900">{job.labelHe}</div>
                <div className="mt-1 text-xs text-stone-500">
                  {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(
                    new Date(job.createdAt)
                  )}
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-sm font-bold text-stone-700">
                {job.status} | {job.progressPercent}%
              </div>
            </div>
            <div className="mt-3 text-sm text-stone-600">
              {job.competition ? getCompetitionDisplayName(job.competition) : 'ללא מסגרת'} |{' '}
              {job.team ? job.team.nameHe || job.team.nameEn : 'כל הקבוצות'}
            </div>
          </article>
        ))}
        {rawData.fetchJobs.length === 0 ? <EmptyAdminState text="אין עבודות משיכה לעונה הזו." /> : null}
      </div>
    </DataCard>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
    </div>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-right"
      >
        <span className="text-lg font-black text-stone-900">{title}</span>
        <span className="text-xl font-bold text-stone-400">{open ? '▲' : '▼'}</span>
      </button>
      {open ? <div className="border-t border-stone-100 p-4">{children}</div> : null}
    </section>
  );
}

function EmptyAdminState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
