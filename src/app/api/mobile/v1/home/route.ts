import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getMobileHomePayload } from '@/lib/mobile-api';
import type { HomePayload, CompactStandingRow, LiveMatchCompact, NewsCard } from '@shared/types/mobile-api';
import type { MatchCard } from '@shared/types/common';

export const dynamic = 'force-dynamic';

/** Map Prisma GameStatus → MatchCard status */
function toMatchStatus(status: string): MatchCard['status'] {
  switch (status) {
    case 'SCHEDULED': return 'scheduled';
    case 'ONGOING':   return 'live';
    case 'COMPLETED': return 'finished';
    case 'CANCELLED': return 'cancelled';
    default:          return 'scheduled';
  }
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  const raw = await getMobileHomePayload({
    team: request.nextUrl.searchParams.getAll('team'),
    league: request.nextUrl.searchParams.getAll('league'),
    userId: user?.id ?? null,
  });

  // Map nextMatch to MatchCard
  const nextMatch: MatchCard | null = raw.sections.nextMatch
    ? {
        id: raw.sections.nextMatch.id,
        apiId: raw.sections.nextMatch.apiId,
        date: raw.sections.nextMatch.dateTime,
        status: toMatchStatus(raw.sections.nextMatch.status),
        minute: null,
        home: {
          team: raw.sections.nextMatch.homeTeam,
          score: raw.sections.nextMatch.homeScore,
        },
        away: {
          team: raw.sections.nextMatch.awayTeam,
          score: raw.sections.nextMatch.awayScore,
        },
        leagueId: raw.sections.nextMatch.competitionId ?? '',
        leagueName: raw.sections.nextMatch.competitionName,
      }
    : null;

  // Map lastMatch to MatchCard
  const lastMatch: MatchCard | null = raw.sections.lastMatch
    ? {
        id: raw.sections.lastMatch.id,
        apiId: raw.sections.lastMatch.apiId,
        date: raw.sections.lastMatch.dateTime,
        status: toMatchStatus(raw.sections.lastMatch.status),
        minute: null,
        home: {
          team: raw.sections.lastMatch.homeTeam,
          score: raw.sections.lastMatch.homeScore,
        },
        away: {
          team: raw.sections.lastMatch.awayTeam,
          score: raw.sections.lastMatch.awayScore,
        },
        leagueId: raw.sections.lastMatch.competitionId ?? '',
        leagueName: raw.sections.lastMatch.competitionName,
      }
    : null;

  // Map standings to CompactStandingRow[]
  const compactStandings: CompactStandingRow[] = raw.sections.standings.map((row) => ({
    rank: row.position,
    teamName: row.teamName,
    played: row.played,
    points: row.points,
  }));

  // Map live items to LiveMatchCompact[]
  const liveStrip: LiveMatchCompact[] = raw.sections.live.map((item) => ({
    id: item.id,
    minute: typeof item.minuteLabel === 'string' ? (parseInt(item.minuteLabel, 10) || null) : null,
    home: { name: item.homeTeamName, score: item.homeScore },
    away: { name: item.awayTeamName, score: item.awayScore },
  }));

  // Map news to NewsCard[] — cap at 4
  const newsStrip: NewsCard[] = raw.sections.news.slice(0, 4).map((item) => ({
    id: item.id,
    source: item.source,
    team: item.teamLabel || null,
    imageUrl: item.imageUrl,
    preview: item.previewText,
    publishedAt: item.publishedAt ?? new Date(0).toISOString(),
    url: item.url,
  }));

  const payload: HomePayload = {
    user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null,
    favoriteTeam: null,
    nextMatch,
    lastMatch,
    compactStandings,
    liveStrip,
    newsStrip,
  };

  return NextResponse.json(payload);
}
