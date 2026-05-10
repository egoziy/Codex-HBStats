import { NextResponse } from 'next/server';
import { getMobileTeamPayload } from '@/lib/mobile-details-api';
import type { TeamPayload, TeamSeasonStats } from '@shared/types/mobile-api';
import type { TeamHeader, TeamSummary, MatchCard, MatchStatus, StandingRow } from '@shared/types/common';

export const dynamic = 'force-dynamic';

function toMatchStatus(raw: string | null | undefined): MatchStatus {
  switch (raw) {
    case 'ONGOING':
      return 'live';
    case 'COMPLETED':
      return 'finished';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function buildMatchCard(
  game: {
    id: string;
    href: string;
    competition: string;
    homeTeamName: string;
    awayTeamName: string;
    dateTime: string;
    score?: string;
  } | null,
  homeTeamId: string,
  awayTeamId: string,
  homeLogoUrl: string | null,
  awayLogoUrl: string | null,
  status: MatchStatus,
  score?: string,
): MatchCard | null {
  if (!game) return null;

  // Parse score "N-M" or fallback
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (score) {
    const parts = score.split('-');
    if (parts.length === 2) {
      homeScore = parseInt(parts[0], 10);
      awayScore = parseInt(parts[1], 10);
      if (isNaN(homeScore)) homeScore = null;
      if (isNaN(awayScore)) awayScore = null;
    }
  }

  const homeTeam: TeamSummary = {
    id: homeTeamId,
    apiId: null,
    nameEn: game.homeTeamName,
    nameHe: game.homeTeamName,
    logoUrl: homeLogoUrl,
  };

  const awayTeam: TeamSummary = {
    id: awayTeamId,
    apiId: null,
    nameEn: game.awayTeamName,
    nameHe: game.awayTeamName,
    logoUrl: awayLogoUrl,
  };

  return {
    id: game.id,
    apiId: null,
    date: game.dateTime,
    status,
    minute: null,
    home: { team: homeTeam, score: homeScore },
    away: { team: awayTeam, score: awayScore },
    leagueId: '',
    leagueName: game.competition,
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobileTeamPayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const rawTeam = raw.team;

  // Build TeamHeader
  const teamHeader: TeamHeader = {
    id: rawTeam.id,
    apiId: rawTeam.apiFootballId ?? null,
    nameEn: rawTeam.nameEn,
    nameHe: rawTeam.name,
    logoUrl: rawTeam.logoUrl ?? null,
    founded: null,
    venueName: null,
    city: null,
  };

  // Build coach
  const coach: TeamPayload['coach'] = rawTeam.coach
    ? { name: rawTeam.coach, since: null }
    : null;

  // Build standingsContext from sections.standings
  const standingsRows = raw.sections.standings;
  let standingsContext: TeamPayload['standingsContext'] = null;
  if (standingsRows && standingsRows.length > 0) {
    const currentRow = standingsRows.find((r: { isCurrentTeam: boolean }) => r.isCurrentTeam);
    const around: StandingRow[] = standingsRows.map((row: {
      id: string;
      teamId: string;
      teamName: string;
      position: number | null;
      points: number;
      isCurrentTeam: boolean;
    }) => ({
      rank: row.position ?? 0,
      team: {
        id: row.teamId,
        apiId: null,
        nameEn: row.teamName,
        nameHe: row.teamName,
        logoUrl: null,
      },
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: row.points,
    }));
    standingsContext = {
      rank: currentRow?.position ?? 0,
      points: currentRow?.points ?? 0,
      around,
    };
  }

  // Build nextMatch and lastMatch
  const rawNext = raw.sections.nextMatch;
  const rawLast = raw.sections.lastMatch;

  const nextMatch: MatchCard | null = rawNext
    ? buildMatchCard(
        rawNext,
        id,
        id,
        rawTeam.logoUrl ?? null,
        null,
        'scheduled',
      )
    : null;

  // For nextMatch, we need to fix team assignments based on homeTeamName/awayTeamName
  const nextMatchCard: MatchCard | null = rawNext
    ? {
        id: rawNext.id,
        apiId: null,
        date: rawNext.dateTime,
        status: 'scheduled',
        minute: null,
        home: {
          team: {
            id: rawNext.homeTeamName === rawTeam.name ? id : '',
            apiId: null,
            nameEn: rawNext.homeTeamName,
            nameHe: rawNext.homeTeamName,
            logoUrl: null,
          },
          score: null,
        },
        away: {
          team: {
            id: rawNext.awayTeamName === rawTeam.name ? id : '',
            apiId: null,
            nameEn: rawNext.awayTeamName,
            nameHe: rawNext.awayTeamName,
            logoUrl: null,
          },
          score: null,
        },
        leagueId: '',
        leagueName: rawNext.competition,
      }
    : null;

  const lastMatchCard: MatchCard | null = rawLast
    ? {
        id: rawLast.id,
        apiId: null,
        date: rawLast.dateTime,
        status: 'finished',
        minute: null,
        home: {
          team: {
            id: rawLast.homeTeamName === rawTeam.name ? id : '',
            apiId: null,
            nameEn: rawLast.homeTeamName,
            nameHe: rawLast.homeTeamName,
            logoUrl: null,
          },
          score: null,
        },
        away: {
          team: {
            id: rawLast.awayTeamName === rawTeam.name ? id : '',
            apiId: null,
            nameEn: rawLast.awayTeamName,
            nameHe: rawLast.awayTeamName,
            logoUrl: null,
          },
          score: null,
        },
        leagueId: '',
        leagueName: rawLast.competition,
      }
    : null;

  // Build recentForm from sections.recentForm
  const recentForm: ('W' | 'D' | 'L')[] = (raw.sections.recentForm || []).map(
    (entry: { result: 'W' | 'D' | 'L' }) => entry.result,
  );

  // Build squad grouped by position
  const rawSquad = raw.sections.squad || [];
  const positionGroupMap = new Map<string, typeof rawSquad>();
  for (const player of rawSquad) {
    const pos = player.position || 'Unknown';
    const existing = positionGroupMap.get(pos) || [];
    existing.push(player);
    positionGroupMap.set(pos, existing);
  }

  const squad: TeamPayload['squad'] = Array.from(positionGroupMap.entries()).map(
    ([position, players]) => ({
      position,
      players: players.map((p: {
        id: string;
        name: string;
        jerseyNumber: number | null;
        position: string | null;
        photo: string | null;
      }) => ({
        id: p.id,
        apiId: null,
        nameEn: p.name,
        nameHe: p.name,
        photoUrl: p.photo ?? null,
        position: p.position ?? null,
        jerseyNumber: p.jerseyNumber ?? null,
      })),
    }),
  );

  // Build seasonStats
  const summary = raw.summary;
  const seasonSummary = raw.sections.seasonSummary;
  const topScorerEntry = raw.sections.topScorers?.[0] ?? null;

  const seasonStats: TeamSeasonStats = {
    goalsScored: seasonSummary?.goalsFor ?? summary?.goals?.for ?? 0,
    goalsAgainst: seasonSummary?.goalsAgainst ?? summary?.goals?.against ?? 0,
    cleanSheets: seasonSummary?.cleanSheets ?? 0,
    averageGoalsScored:
      summary?.matchesPlayed && summary.matchesPlayed > 0
        ? Number(((seasonSummary?.goalsFor ?? summary?.goals?.for ?? 0) / summary.matchesPlayed).toFixed(2))
        : 0,
    averageGoalsAgainst:
      summary?.matchesPlayed && summary.matchesPlayed > 0
        ? Number(((seasonSummary?.goalsAgainst ?? summary?.goals?.against ?? 0) / summary.matchesPlayed).toFixed(2))
        : 0,
    topScorer: topScorerEntry
      ? {
          player: {
            id: topScorerEntry.id,
            apiId: null,
            nameEn: topScorerEntry.name,
            nameHe: topScorerEntry.name,
            photoUrl: topScorerEntry.photo ?? null,
            position: null,
            jerseyNumber: null,
          },
          goals: topScorerEntry.goals,
        }
      : null,
  };

  const payload: TeamPayload = {
    team: teamHeader,
    coach,
    standingsContext,
    nextMatch: nextMatchCard,
    lastMatch: lastMatchCard,
    recentForm,
    squad,
    seasonStats,
  };

  return NextResponse.json(payload);
}
