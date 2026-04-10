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

  return (
    <div dir="rtl" className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-sm font-semibold tracking-[0.25em] text-amber-700">טבלה</p>
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
                className="min-w-[180px] rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
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
                className="min-w-[200px] rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
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
                className="min-w-[220px] rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-900"
              >
                <option value="current">טבלה נוכחית</option>
                {roundOptions.map((round) => (
                  <option key={round} value={round}>
                    {getRoundDisplayName(round, round)}
                  </option>
                ))}
              </select>
              <button className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800">
                הצג עונה
              </button>
            </form>
          </div>

          {selectedSeason ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
                עונה נבחרת: {selectedSeason.name}
              </div>
              <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700">
                קבוצות בעונה: {teams.length}
              </div>
              <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700">
                משחקי ליגה שהושלמו: {snapshotGames.length}
              </div>
            </div>
          ) : null}
        </section>

        {isFallbackTable ? (
          <section className="rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold leading-6 text-sky-900">
            מוצגת טבלה מחושבת מתוך {snapshotGames.length} משחקי ליגה שהסתיימו ונשמרו במערכת.
          </section>
        ) : null}

        <section className="rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-5">
            <h2 className="text-xl font-black text-stone-900">דירוג הקבוצות</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-right">
              <thead>
                <tr className="bg-stone-50 text-sm font-bold text-stone-600">
                  <th className="px-4 py-4">מיקום</th>
                  <th className="min-w-[240px] px-4 py-4">קבוצה</th>
                  <th className="px-4 py-4 text-center">משחקים</th>
                  <th className="px-4 py-4 text-center">ניצחונות</th>
                  <th className="px-4 py-4 text-center">תיקו</th>
                  <th className="px-4 py-4 text-center">הפסדים</th>
                  <th className="px-4 py-4 text-center">שערים</th>
                  <th className="px-4 py-4 text-center">הפרש</th>
                  <th className="px-4 py-4 text-center">תיקון</th>
                  <th className="px-4 py-4 text-center">נקודות</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? 'bg-white text-sm' : 'bg-stone-50/60 text-sm'}>
                    <td className="px-4 py-4 font-black text-stone-900">{row.displayPosition}</td>
                    <td className="px-4 py-4">
                      <Link href={`/teams/${row.teamId}`} className="block font-bold text-stone-900 transition hover:text-red-800">
                        {getDisplayTeamName(row.team)}
                      </Link>
                      {row.pointsAdjustment < 0 ? (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          <span>▼</span>
                          <span>{Math.abs(row.pointsAdjustment)} נק׳</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-center font-medium">{row.played}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.wins}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.draws}</td>
                    <td className="px-4 py-4 text-center font-medium">{row.losses}</td>
                    <td className="px-4 py-4 text-center font-medium">
                      {row.goalsFor}-{row.goalsAgainst}
                    </td>
                    <td className="px-4 py-4 text-center font-bold">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                    <td className="px-4 py-4 text-center font-bold">{row.pointsAdjustment === 0 ? '-' : row.pointsAdjustment}</td>
                    <td className="px-4 py-4 text-center text-lg font-black text-stone-900">{row.adjustedPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasStoredStandings && !canDeriveTable ? (
            <div className="p-8 text-center text-sm text-stone-500">אין כרגע מספיק נתונים כדי להציג טבלה לעונה או למחזור שנבחרו.</div>
          ) : null}

          {standings.some((r) => r.pointsAdjustment < 0) ? (
            <div className="border-t border-stone-100 px-6 py-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-400">הורדות נקודות</div>
              <div className="flex flex-wrap gap-3">
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#eef3ff_42%,#e7ecfb_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#2d006b,#7a00b8_55%,#00c2ff)] p-[1px] shadow-[0_24px_70px_rgba(45,0,107,0.28)]">
          <div className="rounded-[31px] bg-[linear-gradient(135deg,#23003f,#4d007b_56%,#008fbd)] p-6 text-white md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.34em] text-cyan-100">
                  טבלת ליגה
                </div>
                <h1 className="text-4xl font-black tracking-tight md:text-5xl">טבלת הליגה</h1>
                <p className="max-w-2xl text-sm leading-6 text-white/78 md:text-base">
                  כולל טופס חמשת המשחקים האחרונים, הקבוצה הבאה, ואפשרות לצפות בטבלה העדכנית או בטבלה לאחר כל מחזור.
                </p>
              </div>

              <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" action="/standings">
                <input type="hidden" name="view" value="premier" />
                <select
                  name="season"
                  defaultValue={selectedSeason?.id || ''}
                  className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none backdrop-blur"
                >
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id} className="text-slate-950">
                      {season.name}
                    </option>
                  ))}
                </select>
                <select
                  name="competition"
                  defaultValue={selectedCompetition?.id || ''}
                  className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none backdrop-blur"
                >
                  {competitionOptions.map((competition) => (
                    <option key={competition.id} value={competition.id} className="text-slate-950">
                      {getCompetitionDisplayName(competition)}
                    </option>
                  ))}
                </select>
                <select
                  name="round"
                  defaultValue={selectedRound}
                  className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none backdrop-blur"
                >
                  <option value="current" className="text-slate-950">טבלה נוכחית</option>
                  {roundOptions.map((round) => (
                    <option key={round} value={round} className="text-slate-950">
                      {getRoundDisplayName(round, round)}
                    </option>
                  ))}
                </select>
                <button className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#3a006d] transition hover:bg-cyan-100">
                  הצג
                </button>
              </form>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-5">
              <PremierBadge label="עונה" value={selectedSeason?.name || '-'} />
              <PremierBadge label="מסגרת" value={getCompetitionDisplayName(selectedCompetition || undefined)} />
              <PremierBadge label="חתך" value={selectedRound === 'current' ? 'נוכחי' : selectedRound} />
              <PremierBadge label="קבוצות" value={String(teamsCount)} />
              <PremierBadge label="משחקים שהושלמו" value={String(completedLeagueGames)} />
            </div>
          </div>
        </section>

        {isFallbackTable ? (
          <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold leading-6 text-sky-950">
            מוצגת כרגע טבלה מחושבת מתוך {completedLeagueGames} משחקי ליגה שהסתיימו.
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_25px_60px_rgba(30,41,59,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff,#f5f7ff)] px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-950">טבלת דירוג</h2>
              <p className="mt-1 text-sm text-slate-500">מיון לפי נקודות, הפרש שערים וכמות שערי זכות.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <LegendPill color="bg-emerald-500" label="צמרת" />
              <LegendPill color="bg-cyan-500" label="פלייאוף/עליון" />
              <LegendPill color="bg-rose-500" label="תחתית" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1240px] w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-[#f8f9ff] text-right text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-4">מיקום</th>
                  <th className="px-4 py-4">קבוצה</th>
                  <th className="px-4 py-4 text-center">מש&apos;</th>
                  <th className="px-4 py-4 text-center">נ&apos;</th>
                  <th className="px-4 py-4 text-center">ת&apos;</th>
                  <th className="px-4 py-4 text-center">ה&apos;</th>
                  <th className="px-4 py-4 text-center">זכות</th>
                  <th className="px-4 py-4 text-center">חובה</th>
                  <th className="px-4 py-4 text-center">הפרש</th>
                  <th className="px-4 py-4 text-center">כושר</th>
                  <th className="px-4 py-4 text-center">הבא</th>
                  <th className="px-4 py-4 text-center">נק&apos;</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const form = getTeamForm(row.teamId, snapshotGames);
                  const nextGame = getNextGame(row.teamId, futureGames);
                  const band =
                    row.displayPosition <= 1
                      ? 'bg-emerald-500'
                      : row.displayPosition <= 6
                        ? 'bg-cyan-500'
                        : row.displayPosition > Math.max(teamsCount - 2, 0)
                          ? 'bg-rose-500'
                          : 'bg-slate-200';

                  const opponent =
                    nextGame
                      ? nextGame.homeTeamId === row.teamId
                        ? nextGame.awayTeam
                        : nextGame.homeTeam
                      : null;

                  return (
                    <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 transition hover:bg-[#f6f8ff]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`h-10 w-1 rounded-full ${band}`} />
                          <span className="text-base font-black text-slate-950">{row.displayPosition}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/teams/${row.teamId}?view=premier`} className="flex items-center gap-3 transition hover:text-[#5f00b8]">
                          <TeamLogo
                            src={row.team.logoUrl}
                            alt={getDisplayTeamName(row.team)}
                            className="h-8 w-8 rounded-full bg-white object-contain"
                            fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7ff] text-[10px] font-black text-[#5f00b8]"
                          />
                          <div>
                            <div className="font-black text-slate-950">{getDisplayTeamName(row.team)}</div>
                            {row.pointsAdjustment < 0 ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                <span>▼</span>
                                <span>{Math.abs(row.pointsAdjustment)} נק׳</span>
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-center font-bold">{row.played}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.wins}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.draws}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.losses}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.goalsFor}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.goalsAgainst}</td>
                      <td className={`px-4 py-4 text-center font-black ${row.goalDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {form.length ? form.map((entry, index) => <FormDot key={`${row.id}-${index}`} value={entry} />) : <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {opponent ? (
                          <div className="flex items-center justify-center">
                            <TeamLogo
                              src={opponent.logoUrl}
                              alt={getDisplayTeamName(opponent)}
                              className="h-8 w-8 rounded-full bg-white object-contain"
                              fallbackClassName="text-xs font-bold text-slate-500"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-lg font-black text-slate-950">{row.adjustedPoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!hasStoredStandings && !canDeriveTable ? (
            <div className="px-6 py-8 text-center text-sm font-semibold text-slate-500">
              עדיין אין מספיק נתונים כדי להציג טבלה לעונה או למחזור הזה.
            </div>
          ) : null}

          {standings.some((r) => r.pointsAdjustment < 0) ? (
            <div className="border-t border-slate-100 px-6 py-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">הורדות נקודות</div>
              <div className="flex flex-wrap gap-3">
                {standings
                  .filter((r) => r.pointsAdjustment < 0)
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
                      <span className="font-black text-red-700">▼ {Math.abs(r.pointsAdjustment)}</span>
                      <span className="font-semibold text-slate-700">{getDisplayTeamName(r.team)}</span>
                      {r.pointsAdjustmentNoteHe ? (
                        <span className="text-slate-500">— {r.pointsAdjustmentNoteHe}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </section>

        {selectedCompetitionKind !== 'LEAGUE' && gamesByRound.length > 0 ? (
          <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_25px_60px_rgba(30,41,59,0.08)]">
            <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff,#f5f7ff)] px-6 py-5">
              <h2 className="text-2xl font-black text-slate-950">שלבי המסגרת</h2>
              <p className="mt-1 text-sm text-slate-500">תצוגה היררכית של המשחקים לפי שלב או מחזור במסגרת שנבחרה.</p>
            </div>
            <div className="grid gap-4 p-6 lg:grid-cols-2">
              {gamesByRound.map(([round, games]) => (
                <div key={round} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="mb-4 text-lg font-black text-[#23003d]">{getRoundDisplayName(round, round)}</div>
                  <div className="space-y-3">
                    {games
                      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
                      .map((game) => (
                        <Link
                          key={game.id}
                          href={`/games/${game.id}?view=premier`}
                          className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#5f00b8] hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
                            <span>{game.dateTime.toLocaleDateString('he-IL')}</span>
                            <span>{game.status === 'COMPLETED' ? 'הסתיים' : game.status === 'ONGOING' ? 'חי' : 'טרם שוחק'}</span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="text-right font-bold text-slate-900">{getDisplayTeamName(game.homeTeam)}</div>
                            <div className="min-w-[84px] rounded-full bg-[#f3ecff] px-3 py-2 text-center text-sm font-black text-[#4d007b]">
                              {game.homeScore !== null && game.awayScore !== null ? `${game.homeScore} - ${game.awayScore}` : '-'}
                            </div>
                            <div className="text-left font-bold text-slate-900">{getDisplayTeamName(game.awayTeam)}</div>
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
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
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
