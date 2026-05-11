import { NextResponse } from 'next/server';
import { getMobileGamePayload } from '@/lib/mobile-details-api';
import type { MatchPayload, MatchStatus, MatchEvent, Lineup, LineupPlayer, MatchStats } from '@shared/types/mobile-api';
import type { TeamHeader } from '@shared/types/common';

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

function toMatchEventType(raw: string): MatchEvent['type'] {
  switch (raw) {
    case 'GOAL':
    case 'PENALTY_GOAL':
    case 'OWN_GOAL':
      return 'goal';
    case 'YELLOW_CARD':
    case 'YELLOW_RED_CARD':
      return 'yellow';
    case 'RED_CARD':
      return 'red';
    case 'SUBSTITUTION_IN':
    case 'SUBSTITUTION_OUT':
      return 'sub';
    case 'PENALTY_MISSED':
      return 'penalty';
    default:
      return 'goal';
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobileGamePayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const game = raw.game;

  // Build TeamHeader for home and away teams
  const homeTeam: TeamHeader = {
    id: game.homeTeam.id,
    apiId: null,
    nameEn: game.homeTeam.name,
    nameHe: game.homeTeam.name,
    logoUrl: game.homeTeam.logoUrl ?? null,
    founded: null,
    venueName: null,
    city: null,
  };

  const awayTeam: TeamHeader = {
    id: game.awayTeam.id,
    apiId: null,
    nameEn: game.awayTeam.name,
    nameHe: game.awayTeam.name,
    logoUrl: game.awayTeam.logoUrl ?? null,
    founded: null,
    venueName: null,
    city: null,
  };

  // Build events array
  const events: MatchEvent[] = raw.sections.events.map((event) => {
    const teamSide: 'home' | 'away' =
      event.teamId === game.homeTeam.id ? 'home' : 'away';
    return {
      id: event.id,
      minute: event.minute,
      type: toMatchEventType(event.type),
      player: event.playerName ?? null,
      team: teamSide,
      assistPlayer: event.relatedPlayerName ?? null,
    };
  });

  // Build lineups
  function buildLineup(side: 'home' | 'away'): Lineup {
    const rawLineup = raw!.sections.lineups[side];
    const players: LineupPlayer[] = [
      ...rawLineup.starters.map((p) => ({
        player: {
          id: p.id,
          apiId: null,
          nameEn: p.displayName,
          nameHe: p.displayName,
          photoUrl: null,
          position: p.positionName ?? null,
          jerseyNumber: p.jerseyNumber ?? null,
        },
        isStarting: true,
        position: p.positionName ?? null,
      })),
      ...rawLineup.substitutes.map((p) => ({
        player: {
          id: p.id,
          apiId: null,
          nameEn: p.displayName,
          nameHe: p.displayName,
          photoUrl: null,
          position: p.positionName ?? null,
          jerseyNumber: p.jerseyNumber ?? null,
        },
        isStarting: false,
        position: p.positionName ?? null,
      })),
    ];
    return {
      formation: rawLineup.formation ?? null,
      players,
    };
  }

  // Build matchStats from game statistics rows
  const statsRows = raw.sections.stats as Array<{
    label: string;
    homeValue: number | null;
    awayValue: number | null;
  }>;

  function findStat(label: string) {
    return statsRows.find((row) => row.label === label) ?? null;
  }

  const possessionRow = findStat('אחזקת כדור');
  const shotsOnTargetRow = findStat('בעיטות למסגרת');
  const shotsRow = findStat('בעיטות');
  const cornersRow = findStat('קרנות');
  const foulsRow = findStat('עבירות');

  const hasAnyStats = [possessionRow, shotsOnTargetRow, shotsRow, cornersRow, foulsRow].some(
    (row) => row && (row.homeValue !== null || row.awayValue !== null)
  );

  const matchStats: MatchStats | null = hasAnyStats
    ? {
        possession:
          possessionRow && (possessionRow.homeValue !== null || possessionRow.awayValue !== null)
            ? { home: possessionRow.homeValue ?? 0, away: possessionRow.awayValue ?? 0 }
            : null,
        shots:
          shotsRow && (shotsRow.homeValue !== null || shotsRow.awayValue !== null)
            ? { home: shotsRow.homeValue ?? 0, away: shotsRow.awayValue ?? 0 }
            : null,
        shotsOnTarget:
          shotsOnTargetRow && (shotsOnTargetRow.homeValue !== null || shotsOnTargetRow.awayValue !== null)
            ? { home: shotsOnTargetRow.homeValue ?? 0, away: shotsOnTargetRow.awayValue ?? 0 }
            : null,
        corners:
          cornersRow && (cornersRow.homeValue !== null || cornersRow.awayValue !== null)
            ? { home: cornersRow.homeValue ?? 0, away: cornersRow.awayValue ?? 0 }
            : null,
        fouls:
          foulsRow && (foulsRow.homeValue !== null || foulsRow.awayValue !== null)
            ? { home: foulsRow.homeValue ?? 0, away: foulsRow.awayValue ?? 0 }
            : null,
      }
    : null;

  const payload: MatchPayload = {
    match: {
      id: game.id,
      status: toMatchStatus(game.status),
      minute: null,
      score: {
        home: raw.sections.eventSummary.homeGoals ?? null,
        away: raw.sections.eventSummary.awayGoals ?? null,
      },
      halfTime: null,
      dates: {
        kickoff: game.dateTime,
        finished: null,
      },
      venue: null,
      referee: null,
    },
    homeTeam,
    awayTeam,
    events,
    lineups: {
      home: buildLineup('home'),
      away: buildLineup('away'),
    },
    matchStats,
    h2h: null,
  };

  return NextResponse.json(payload);
}
