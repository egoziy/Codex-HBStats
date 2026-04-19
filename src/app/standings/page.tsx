import Link from 'next/link';

import { getCompetitionDisplayName, getRoundDisplayName } from '@/lib/competition-display';
import { getCompetitionById } from '@/lib/competitions';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';
import { sortStandings, type StandingWithDerived } from '@/lib/standings';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

type TeamName = {
  id: string;
  nameHe: string;
  nameEn: string;
  logoUrl?: string | null;
};

type DerivedStandingRow = {
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
  teamId: string;
  team: TeamName;
};

type LeagueGame = {
  id: string;
  roundNameEn: string | null;
  dateTime: Date;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: TeamName;
  awayTeam: TeamName;
  competition: {
    id: string;
    apiFootballId: number | null;
    nameHe: string | null;
    nameEn: string;
    type: 'LEAGUE' | 'CUP' | 'EUROPE';
  } | null;
};

function hasHebrew(value: string | null | undefined) {
  return Boolean(value && /[\u0590-\u05FF]/.test(value));
}

function getDisplayTeamName(team: { nameHe?: string | null; nameEn?: string | null }) {
  if (hasHebrew(team.nameHe)) return team.nameHe!;
  return team.nameEn || team.nameHe || 'ללא שם';
}

function normalizeRoundLabel(value: string | null | undefined) {
  return value?.trim() || 'מחזור לא ידוע';
}

function getRoundSortValue(label: string) {
  const normalized = normalizeRoundLabel(label);
  const match = normalized.match(/(\d+)/);
  const number = match ? Number(match[1]) : 999;

  if (/final/i.test(normalized)) return 9000;
  if (/semi-finals?/i.test(normalized)) return 8000;
  if (/quarter-finals?/i.test(normalized)) return 7000;
  if (/round of 16/i.test(normalized)) return 6000;
  if (/round of 32/i.test(normalized)) return 5000;
  if (/regular season/i.test(normalized)) return number;
  if (/championship round/i.test(normalized)) return 1000 + number;
  if (/relegation round/i.test(normalized)) return 2000 + number;
  if (/group stage/i.test(normalized)) return 3000 + number;
  return 5000 + number;
}

function getCompetitionKind(competition?: {
  apiFootballId?: number | null;
  type?: 'LEAGUE' | 'CUP' | 'EUROPE' | null;
}) {
  const mapped = competition?.apiFootballId ? getCompetitionById(String(competition.apiFootballId)) : null;
  return mapped?.kind || competition?.type || 'LEAGUE';
}

function buildStandingsFromGames(
  teams: TeamName[],
  games: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
  }>
) {
  const rows = new Map<string, DerivedStandingRow>();

  for (const team of teams) {
    rows.set(team.id, {
      id: `derived-${team.id}`,
      position: 999,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      pointsAdjustment: 0,
      pointsAdjustmentNoteHe: null,
      teamId: team.id,
      team,
    });
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;

    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      continue;
    }

    if (game.homeScore < game.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      continue;
    }

    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }

  let fallbackPosition = 1;
  return sortStandings(
    [...rows.values()].map((row) => ({
      ...row,
      position: fallbackPosition++,
    }))
  );
}

function getTeamForm(teamId: string, games: LeagueGame[]) {
  return games
    .filter(
      (game) =>
        game.status === 'COMPLETED' &&
        (game.homeTeamId === teamId || game.awayTeamId === teamId) &&
        game.homeScore !== null &&
        game.awayScore !== null
    )
    .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())
    .slice(0, 5)
    .map((game) => {
      const isHome = game.homeTeamId === teamId;
      const teamScore = isHome ? game.homeScore ?? 0 : game.awayScore ?? 0;
      const conceded = isHome ? game.awayScore ?? 0 : game.homeScore ?? 0;
      if (teamScore > conceded) return 'W';
      if (teamScore < conceded) return 'L';
      return 'D';
    });
}

function getNextGame(teamId: string, games: LeagueGame[]) {
  return (
    games
      .filter(
        (game) =>
          (game.homeTeamId === teamId || game.awayTeamId === teamId) &&
          (game.status === 'SCHEDULED' || game.status === 'ONGOING')
      )
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0] || null
  );
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams?: { season?: string; view?: string; round?: string; competition?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });

  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;

  const [seasonTeams, rawStandings, seasonGames, seasonCompetitions] = selectedSeason
    ? await Promise.all([
        prisma.team.findMany({
          where: { seasonId: selectedSeason.id },
          select: { id: true, nameHe: true, nameEn: true, logoUrl: true },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        }),
        prisma.standing.findMany({
          where: { seasonId: selectedSeason.id },
          include: { team: true },
          orderBy: [{ position: 'asc' }, { points: 'desc' }],
        }),
        prisma.game.findMany({
          where: {
            seasonId: selectedSeason.id,
          },
          include: {
            competition: { select: { id: true, apiFootballId: true, nameHe: true, nameEn: true, type: true } },
            homeTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
            awayTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
          },
          orderBy: [{ dateTime: 'asc' }],
        }),
        prisma.competitionSeason.findMany({
          where: { seasonId: selectedSeason.id },
          include: {
            competition: { select: { id: true, apiFootballId: true, nameHe: true, nameEn: true, type: true } },
          },
          orderBy: [{ competition: { nameHe: 'asc' } }, { competition: { nameEn: 'asc' } }],
        }),
      ])
    : [[], [], [], []];

  const competitionOptions = Array.from(
    new Map(
      seasonCompetitions
        .map((entry) => entry.competition)
        .filter(Boolean)
        .map((competition) => [competition.id, competition])
    ).values()
  );
  const defaultCompetition =
    competitionOptions.find((competition) => competition.apiFootballId === 383) || competitionOptions[0] || null;
  const selectedCompetitionId =
    searchParams?.competition && competitionOptions.some((competition) => competition.id === searchParams.competition)
      ? searchParams.competition
      : defaultCompetition?.id || null;
  const selectedCompetition =
    competitionOptions.find((competition) => competition.id === selectedCompetitionId) || defaultCompetition;

  const typedGames = (seasonGames as LeagueGame[]).filter((game) => game.competition?.id === selectedCompetition?.id);
  const competitionStandings = rawStandings.filter((standing) => standing.competitionId === selectedCompetition?.id);
  const competitionTeamIds = new Set<string>([
    ...competitionStandings.map((standing) => standing.teamId),
    ...typedGames.flatMap((game) => [game.homeTeamId, game.awayTeamId]),
  ]);
  const teams = seasonTeams.filter((team) => competitionTeamIds.has(team.id));
  const selectedCompetitionKind = getCompetitionKind(selectedCompetition);
  const completedLeagueGames = typedGames.filter(
    (game) => game.status === 'COMPLETED' && game.homeScore !== null && game.awayScore !== null
  );
  const roundOptions = Array.from(new Set(typedGames.map((game) => normalizeRoundLabel(game.roundNameEn)))).sort(
    (a, b) => getRoundSortValue(a) - getRoundSortValue(b)
  );
  const selectedRound =
    searchParams?.round && (searchParams.round === 'current' || roundOptions.includes(searchParams.round))
      ? searchParams.round
      : 'current';
  const isCurrentRoundView = selectedRound === 'current';
  const snapshotGames = isCurrentRoundView
    ? completedLeagueGames
    : completedLeagueGames.filter(
        (game) => getRoundSortValue(normalizeRoundLabel(game.roundNameEn)) <= getRoundSortValue(selectedRound)
      );
  const futureGames = isCurrentRoundView
    ? typedGames
    : typedGames.filter(
        (game) => getRoundSortValue(normalizeRoundLabel(game.roundNameEn)) > getRoundSortValue(selectedRound)
      );

  const hasStoredStandings = competitionStandings.length > 0;
  const standings =
    hasStoredStandings && isCurrentRoundView
      ? sortStandings(competitionStandings)
      : selectedCompetitionKind === 'LEAGUE'
        ? buildStandingsFromGames(teams, snapshotGames)
        : [];
  const isFallbackTable = (!hasStoredStandings || !isCurrentRoundView) && standings.length > 0 && selectedCompetitionKind === 'LEAGUE';
  const canDeriveTable = Boolean(selectedSeason && teams.length > 0 && snapshotGames.length > 0 && selectedCompetitionKind === 'LEAGUE');

  if (displayMode === 'premier') {
    return (
      <PremierStandingsView
        seasons={seasons}
        selectedSeason={selectedSeason}
        competitionOptions={competitionOptions}
        selectedCompetition={selectedCompetition}
        selectedCompetitionKind={selectedCompetitionKind}
        standings={standings}
        teamsCount={teams.length}
        completedLeagueGames={snapshotGames.length}
        hasStoredStandings={hasStoredStandings}
        canDeriveTable={canDeriveTable}
        isFallbackTable={isFallbackTable}
        selectedRound={selectedRound}
        roundOptions={roundOptions}
        competitionGames={typedGames}
        snapshotGames={snapshotGames}
        futureGames={futureGames}
      />
    );
  }

  const totalTeams = standings.length;

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">טבלה</p>
              <h1 className="text-3xl font-black text-stone-900 md:text-4xl">טבלת הליגה</h1>
              <p className="text-sm leading-6 text-stone-600 md:text-base">
                בחרו עונה או מחזור כדי לראות את טבלת הליגה על פי הנתונים שנשמרו במערכת.
              </p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row sm:items-center" action="/standings">
              <input type="hidden" name="view" value={displayMode} />
              <select
                name="season"
                defaultValue={selectedSeason?.id || ''}
                className="min-w-[180px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              <select
                name="competition"
                defaultValue={selectedCompetition?.id || ''}
                className="min-w-[200px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                {competitionOptions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {getCompetitionDisplayName(competition)}
                  </option>
                ))}
              </select>
              <select
                name="round"
                defaultValue={selectedRound}
                className="min-w-[200px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                <option value="current">טבלה נוכחית</option>
                {roundOptions.map((round) => (
                  <option key={round} value={round}>
                    {getRoundDisplayName(round, round)}
                  </option>
                ))}
              </select>
              <button className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
                הצג
              </button>
            </form>
          </div>

          {selectedSeason ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent-glow)] px-3 py-1.5 text-xs font-bold text-[var(--accent-text)]">
                {selectedSeason.name}
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
                {teams.length} קבוצות
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
                {snapshotGames.length} משחקים
              </span>
            </div>
          ) : null}
        </section>

        {isFallbackTable ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-900">
            מוצגת טבלה מחושבת מתוך {snapshotGames.length} משחקי ליגה שהסתיימו.
          </div>
        ) : null}

        <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
            <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">דירוג הקבוצות</h2>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />אירופה</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-glow)] border border-[var(--accent)]/30" />פלייאוף</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />הורדה</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-right">
              <thead>
                <tr className="bg-stone-50/80 text-[11px] font-black uppercase tracking-[0.15em] text-stone-400">
                  <th className="w-14 px-4 py-3 text-center">#</th>
                  <th className="min-w-[220px] px-4 py-3">קבוצה</th>
                  <th className="px-3 py-3 text-center">מש׳</th>
                  <th className="px-3 py-3 text-center">נ׳</th>
                  <th className="px-3 py-3 text-center">ת׳</th>
                  <th className="px-3 py-3 text-center">ה׳</th>
                  <th className="px-3 py-3 text-center">שערים</th>
                  <th className="px-3 py-3 text-center">הפרש</th>
                  <th className="px-3 py-3 text-center">כושר</th>
                  <th className="px-3 py-3 text-center">נק׳</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const pos = row.displayPosition;
                  const form = getTeamForm(row.teamId, typedGames);
                  const isTop = pos === 1;
                  const isEurope = pos <= 4;
                  const isRelegation = pos >= totalTeams - 1 && totalTeams > 4;
                  const bandColor = isTop ? 'bg-[var(--accent)]'
                    : isEurope ? 'bg-[var(--accent-soft)]'
                    : isRelegation ? 'bg-red-400'
                    : 'bg-transparent';
                  const posColor = isTop
                    ? 'bg-[var(--accent)] text-white'
                    : isEurope
                    ? 'bg-[var(--accent-glow)] text-[var(--accent-text)]'
                    : isRelegation
                    ? 'bg-red-100 text-red-700'
                    : 'bg-stone-100 text-stone-500';

                  return (
                    <tr key={row.id} className="border-b border-stone-100 text-sm transition hover:bg-stone-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`h-8 w-0.5 rounded-full ${bandColor}`} />
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${posColor}`}>
                            {pos}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/teams/${row.teamId}`} className="flex items-center gap-3 transition hover:text-[var(--accent)]">
                          <TeamLogo
                            src={row.team.logoUrl}
                            alt={getDisplayTeamName(row.team)}
                            className="h-8 w-8 object-contain"
                            fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-500"
                          />
                          <div>
                            <div className="font-bold text-stone-900">{getDisplayTeamName(row.team)}</div>
                            {row.pointsAdjustment < 0 ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                ▼ {Math.abs(row.pointsAdjustment)} נק׳
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.played}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.wins}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.draws}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.losses}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-500">
                        {row.goalsFor}:{row.goalsAgainst}
                      </td>
                      <td className={`px-3 py-3 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-600' : row.goalDifference < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {form.length
                            ? form.map((f, i) => (
                                <span
                                  key={i}
                                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${
                                    f === 'W' ? 'bg-emerald-500 text-white' : f === 'L' ? 'bg-red-400 text-white' : 'bg-stone-200 text-stone-600'
                                  }`}
                                >
                                  {f === 'W' ? 'נ' : f === 'D' ? 'ת' : 'ה'}
                                </span>
                              ))
                            : <span className="text-xs text-stone-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-base font-black text-stone-900">{row.adjustedPoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!hasStoredStandings && !canDeriveTable ? (
            <div className="p-8 text-center text-sm text-stone-400">אין כרגע מספיק נתונים להצגת הטבלה.</div>
          ) : null}

          {standings.some((r) => r.pointsAdjustment < 0) ? (
            <div className="border-t border-stone-100 px-6 py-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">הורדות נקודות</div>
              <div className="flex flex-wrap gap-2">
                {standings
                  .filter((r) => r.pointsAdjustment < 0)
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
                      <span className="font-black text-red-700">▼ {Math.abs(r.pointsAdjustment)}</span>
                      <span className="font-semibold text-stone-700">{getDisplayTeamName(r.team)}</span>
                      {r.pointsAdjustmentNoteHe ? (
                        <span className="text-stone-500">— {r.pointsAdjustmentNoteHe}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function PremierStandingsView({
  seasons,
  selectedSeason,
  competitionOptions,
  selectedCompetition,
  selectedCompetitionKind,
  standings,
  teamsCount,
  completedLeagueGames,
  hasStoredStandings,
  canDeriveTable,
  isFallbackTable,
  selectedRound,
  roundOptions,
  competitionGames,
  snapshotGames,
  futureGames,
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeason: { id: string; name: string } | null;
  competitionOptions: Array<{ id: string; apiFootballId: number | null; nameHe: string | null; nameEn: string; type: 'LEAGUE' | 'CUP' | 'EUROPE' }>;
  selectedCompetition: { id: string; apiFootballId: number | null; nameHe: string | null; nameEn: string; type: 'LEAGUE' | 'CUP' | 'EUROPE' } | null;
  selectedCompetitionKind: 'LEAGUE' | 'CUP' | 'EUROPE';
  standings: Array<StandingWithDerived<DerivedStandingRow>>;
  teamsCount: number;
  completedLeagueGames: number;
  hasStoredStandings: boolean;
  canDeriveTable: boolean;
  isFallbackTable: boolean;
  selectedRound: string;
  roundOptions: string[];
  competitionGames: LeagueGame[];
  snapshotGames: LeagueGame[];
  futureGames: LeagueGame[];
}) {
  const gamesByRound = Array.from(
    competitionGames.reduce((map, game) => {
      const round = normalizeRoundLabel(game.roundNameEn);
      const bucket = map.get(round) || [];
      bucket.push(game);
      map.set(round, bucket);
      return map;
    }, new Map<string, LeagueGame[]>())
  ).sort((left, right) => getRoundSortValue(left[0]) - getRoundSortValue(right[0]));

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">טבלה</p>
              <h1 className="text-3xl font-black text-stone-900 md:text-4xl">טבלת הליגה</h1>
              <p className="text-sm leading-6 text-stone-600">
                כולל טופס חמשת המשחקים האחרונים, הקבוצה הבאה, ואפשרות לצפות בטבלה לאחר כל מחזור.
              </p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row sm:items-center" action="/standings">
              <input type="hidden" name="view" value="premier" />
              <select
                name="season"
                defaultValue={selectedSeason?.id || ''}
                className="min-w-[160px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
              <select
                name="competition"
                defaultValue={selectedCompetition?.id || ''}
                className="min-w-[180px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                {competitionOptions.map((competition) => (
                  <option key={competition.id} value={competition.id}>{getCompetitionDisplayName(competition)}</option>
                ))}
              </select>
              <select
                name="round"
                defaultValue={selectedRound}
                className="min-w-[180px] rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none"
              >
                <option value="current">טבלה נוכחית</option>
                {roundOptions.map((round) => (
                  <option key={round} value={round}>{getRoundDisplayName(round, round)}</option>
                ))}
              </select>
              <button className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">הצג</button>
            </form>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent-glow)] px-3 py-1.5 text-xs font-bold text-[var(--accent-text)]">
              {selectedSeason?.name || '-'}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
              {getCompetitionDisplayName(selectedCompetition || undefined)}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
              {teamsCount} קבוצות
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600">
              {completedLeagueGames} משחקים
            </span>
          </div>
        </section>

        {isFallbackTable ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-900">
            מוצגת טבלה מחושבת מתוך {completedLeagueGames} משחקי ליגה שהסתיימו.
          </div>
        ) : null}

        <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
            <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">טבלת דירוג</h2>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <LegendPill color="bg-[var(--accent)]" label="צמרת" />
              <LegendPill color="bg-[var(--accent-soft)]" label="פלייאוף/עליון" />
              <LegendPill color="bg-red-400" label="תחתית" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-right">
              <thead>
                <tr className="bg-stone-50/80 text-[11px] font-black uppercase tracking-[0.15em] text-stone-400">
                  <th className="w-14 px-3 py-3 text-center">#</th>
                  <th className="min-w-[200px] px-3 py-3">קבוצה</th>
                  <th className="px-3 py-3 text-center">מש׳</th>
                  <th className="px-3 py-3 text-center">נ׳</th>
                  <th className="px-3 py-3 text-center">ת׳</th>
                  <th className="px-3 py-3 text-center">ה׳</th>
                  <th className="px-3 py-3 text-center">זכות</th>
                  <th className="px-3 py-3 text-center">חובה</th>
                  <th className="px-3 py-3 text-center">הפרש</th>
                  <th className="px-3 py-3 text-center">כושר</th>
                  <th className="px-3 py-3 text-center">הבא</th>
                  <th className="px-3 py-3 text-center">נק׳</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const pos = row.displayPosition;
                  const form = getTeamForm(row.teamId, snapshotGames);
                  const nextGame = getNextGame(row.teamId, futureGames);
                  const isTop = pos === 1;
                  const isEurope = pos <= 4;
                  const isRelegation = pos >= teamsCount - 1 && teamsCount > 4;
                  const bandColor = isTop ? 'bg-[var(--accent)]' : isEurope ? 'bg-[var(--accent-soft)]' : isRelegation ? 'bg-red-400' : 'bg-transparent';
                  const posColor = isTop ? 'bg-[var(--accent)] text-white' : isEurope ? 'bg-[var(--accent-glow)] text-[var(--accent-text)]' : isRelegation ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-500';

                  const opponent =
                    nextGame
                      ? nextGame.homeTeamId === row.teamId
                        ? nextGame.awayTeam
                        : nextGame.homeTeam
                      : null;

                  return (
                    <tr key={row.id} className="border-b border-stone-100 text-sm transition hover:bg-stone-50/70">
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`h-8 w-0.5 rounded-full ${bandColor}`} />
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${posColor}`}>{pos}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/teams/${row.teamId}`} className="flex items-center gap-3 transition hover:text-[var(--accent)]">
                          <TeamLogo
                            src={row.team.logoUrl}
                            alt={getDisplayTeamName(row.team)}
                            className="h-8 w-8 object-contain"
                            fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-glow)] text-[10px] font-black text-[var(--accent-text)]"
                          />
                          <div>
                            <div className="font-bold text-stone-900">{getDisplayTeamName(row.team)}</div>
                            {row.pointsAdjustment < 0 ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                ▼ {Math.abs(row.pointsAdjustment)} נק׳
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.played}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.wins}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.draws}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-700">{row.losses}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-500">{row.goalsFor}</td>
                      <td className="px-3 py-3 text-center font-semibold text-stone-500">{row.goalsAgainst}</td>
                      <td className={`px-3 py-3 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-600' : row.goalDifference < 0 ? 'text-red-500' : 'text-stone-400'}`}>
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {form.length
                            ? form.map((entry, index) => <FormDot key={`${row.id}-${index}`} value={entry} />)
                            : <span className="text-xs text-stone-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {opponent ? (
                          <div className="flex items-center justify-center">
                            <TeamLogo
                              src={opponent.logoUrl}
                              alt={getDisplayTeamName(opponent)}
                              className="h-7 w-7 object-contain"
                              fallbackClassName="text-[10px] font-bold text-stone-400"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-base font-black text-stone-900">{row.adjustedPoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!hasStoredStandings && !canDeriveTable ? (
            <div className="p-8 text-center text-sm text-stone-400">
              עדיין אין מספיק נתונים להצגת הטבלה.
            </div>
          ) : null}

          {standings.some((r) => r.pointsAdjustment < 0) ? (
            <div className="border-t border-stone-100 px-6 py-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">הורדות נקודות</div>
              <div className="flex flex-wrap gap-2">
                {standings
                  .filter((r) => r.pointsAdjustment < 0)
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
                      <span className="font-black text-red-700">▼ {Math.abs(r.pointsAdjustment)}</span>
                      <span className="font-semibold text-stone-700">{getDisplayTeamName(r.team)}</span>
                      {r.pointsAdjustmentNoteHe ? (
                        <span className="text-stone-500">— {r.pointsAdjustmentNoteHe}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </section>

        {selectedCompetitionKind !== 'LEAGUE' && gamesByRound.length > 0 ? (
          <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <div className="border-b border-stone-100 px-6 py-5">
              <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">שלבי המסגרת</h2>
            </div>
            <div className="grid gap-4 p-6 lg:grid-cols-2">
              {gamesByRound.map(([round, games]) => (
                <div key={round} className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
                  <div className="mb-3 text-base font-black text-stone-900">{getRoundDisplayName(round, round)}</div>
                  <div className="space-y-2">
                    {games
                      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
                      .map((game) => (
                        <Link
                          key={game.id}
                          href={`/games/${game.id}`}
                          className="block rounded-xl border border-stone-200 bg-white p-3 transition hover:border-[var(--accent)]/30 hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-stone-400">
                            <span>{game.dateTime.toLocaleDateString('he-IL')}</span>
                            <span>{game.status === 'COMPLETED' ? 'הסתיים' : game.status === 'ONGOING' ? '● חי' : 'מתוכנן'}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="font-bold text-stone-900">{getDisplayTeamName(game.homeTeam)}</div>
                            <div className="min-w-[72px] rounded-lg bg-[var(--accent-glow)] px-3 py-1.5 text-center text-sm font-black text-[var(--accent-text)]">
                              {game.homeScore !== null && game.awayScore !== null ? `${game.homeScore} - ${game.awayScore}` : '-'}
                            </div>
                            <div className="font-bold text-stone-900">{getDisplayTeamName(game.awayTeam)}</div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PremierBadge({ label, value }: { label: string; value: string }) {
  const displayValue =
    value === 'נוכחי' || /^\d+$/.test(value) || value.startsWith('מחזור') || value.startsWith('פלייאוף')
      ? value
      : getRoundDisplayName(value, value);

  return (
    <div className="rounded-[24px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
      <div className="text-xs font-bold uppercase tracking-[0.28em] text-white/55">{label}</div>
      <div className="mt-3 text-2xl font-black">{displayValue}</div>
    </div>
  );
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-stone-600">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function FormDot({ value }: { value: 'W' | 'D' | 'L' }) {
  const classes =
    value === 'W'
      ? 'bg-emerald-500 text-white'
      : value === 'L'
        ? 'bg-rose-500 text-white'
        : 'bg-slate-300 text-slate-700';

  const label = value === 'W' ? 'נ' : value === 'D' ? 'ת' : 'ה';
  return <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${classes}`}>{label}</span>;
}
