import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import { buildStandingsFromGames, shouldDeriveStandings } from '@/lib/standings-from-games';

export const dynamic = 'force-dynamic';

const LIGAT_HAAL_ID = 'comp_liga_haal';

export async function GET(_request: NextRequest) {
  const season = await prisma.season.findFirst({
    orderBy: { year: 'desc' },
  });
  if (!season) {
    return NextResponse.json({ season: null, groups: [] });
  }

  const [rawStandings, games, teams] = await Promise.all([
    prisma.standing.findMany({
      where: { seasonId: season.id, competitionId: LIGAT_HAAL_ID },
      include: { team: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } } },
    }),
    prisma.game.findMany({
      where: {
        seasonId: season.id,
        competitionId: LIGAT_HAAL_ID,
        status: { in: ['COMPLETED', 'ONGOING'] },
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        roundNameEn: true,
        dateTime: true,
      },
      orderBy: { dateTime: 'asc' },
    }),
    prisma.team.findMany({
      where: { seasonId: season.id },
      select: { id: true, nameEn: true, nameHe: true, logoUrl: true },
    }),
  ]);

  // Derive playoff-aware standings when the league is in the playoff phase;
  // otherwise sort the snapshot rows stored from API-Football.
  const sorted = shouldDeriveStandings(
    rawStandings.map((r) => ({ played: r.played, groupNameEn: r.groupNameEn ?? null })),
    games,
  )
    ? buildStandingsFromGames(teams.map((t) => ({ ...t })), games)
    : sortStandings(rawStandings);

  // Per-team last-5 results (newest first) — used by the mobile FormPill row.
  function lastFiveFor(teamId: string): string {
    return games
      .filter((g) => (g.homeTeamId === teamId || g.awayTeamId === teamId) && g.homeScore != null && g.awayScore != null)
      .sort((a, b) => (b.dateTime?.getTime() ?? 0) - (a.dateTime?.getTime() ?? 0))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.homeTeamId === teamId;
        const teamGoals = isHome ? g.homeScore! : g.awayScore!;
        const oppGoals = isHome ? g.awayScore! : g.homeScore!;
        if (teamGoals > oppGoals) return 'נ';
        if (teamGoals < oppGoals) return 'ה';
        return 'ת';
      })
      .join('');
  }

  const rows = sorted.map((row) => {
    const teamId = (row as { teamId?: string; team?: { id?: string } }).teamId ?? (row as { team?: { id?: string } }).team?.id ?? '';
    const t = teams.find((x) => x.id === teamId);
    return {
      position: row.position,
      teamId,
      teamNameHe: t?.nameHe ?? '',
      teamNameEn: t?.nameEn ?? '',
      logoUrl: t?.logoUrl ?? null,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalsDiff: row.goalsFor - row.goalsAgainst,
      points: row.points,
      form: lastFiveFor(teamId),
      groupNameEn: 'groupNameEn' in row ? (row as { groupNameEn?: string }).groupNameEn ?? null : null,
    };
  });

  // Split by playoff group when present so the UI can render two sections.
  const championship = rows.filter((r) => /championship/i.test(r.groupNameEn ?? ''));
  const relegation = rows.filter((r) => /relegation/i.test(r.groupNameEn ?? ''));

  const groups =
    championship.length > 0 && relegation.length > 0
      ? [
          { label: 'קבוצת אליפות', rows: championship },
          { label: 'קבוצת ירידה', rows: relegation },
        ]
      : [{ label: 'ליגת העל', rows }];

  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    groups,
  });
}
