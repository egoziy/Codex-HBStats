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

/** Map raw DB event type to the public mobile taxonomy. Returns null for
 *  event types that should NOT surface on the mobile timeline (e.g. ASSIST
 *  — the assister is already exposed on the GOAL event via relatedPlayer).
 */
function toMatchEventType(raw: string): MatchEvent['type'] | null {
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
    case 'ASSIST':
      return null;  // redundant — assister already on the GOAL row
    default:
      return null;  // skip unknown to avoid mis-rendering as ⚽
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

  // Build events array. Drop events whose type doesn't render on mobile
  // (ASSIST, anything unrecognised) instead of letting them appear as ⚽.
  const events: MatchEvent[] = raw.sections.events
    .map((event) => {
      const mappedType = toMatchEventType(event.type);
      if (!mappedType) return null;
      const teamSide: 'home' | 'away' =
        event.teamId === game.homeTeam.id ? 'home' : 'away';
      return {
        id: event.id,
        minute: event.minute,
        type: mappedType,
        player: event.playerName ?? null,
        team: teamSide,
        assistPlayer: event.relatedPlayerName ?? null,
      };
    })
    .filter((e): e is MatchEvent => e !== null);

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
  const yellowsRow = findStat('צהובים');
  const redsRow = findStat('אדומים');
  const offsidesRow = findStat('נבדלים');
  const xgRow = findStat('xG (שערים צפויים)');

  const allRows = [possessionRow, shotsOnTargetRow, shotsRow, cornersRow, foulsRow, yellowsRow, redsRow, offsidesRow, xgRow];
  const hasAnyStats = allRows.some((row) => row && (row.homeValue !== null || row.awayValue !== null));

  const pair = (row: typeof possessionRow) =>
    row && (row.homeValue !== null || row.awayValue !== null)
      ? { home: row.homeValue ?? 0, away: row.awayValue ?? 0 }
      : null;

  const matchStats: MatchStats | null = hasAnyStats
    ? {
        possession: pair(possessionRow),
        shots: pair(shotsRow),
        shotsOnTarget: pair(shotsOnTargetRow),
        corners: pair(cornersRow),
        fouls: pair(foulsRow),
        yellowCards: pair(yellowsRow),
        redCards: pair(redsRow),
        offsides: pair(offsidesRow),
        xg: pair(xgRow),
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
