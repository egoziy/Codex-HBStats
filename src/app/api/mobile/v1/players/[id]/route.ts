import { NextRequest, NextResponse } from 'next/server';
import { getMobilePlayerPayload } from '@/lib/mobile-details-api';
import type { PlayerPayload, PlayerSeasonStats, PlayerRecentMatch } from '@shared/types/mobile-api';
import type { TeamSummary } from '@shared/types/common';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobilePlayerPayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Build player profile
  const playerProfile: PlayerPayload['player'] = {
    id: raw.player.id,
    nameHe: raw.player.name ?? '',
    nameEn: raw.player.nameEn ?? raw.player.name ?? '',
    photoUrl: raw.player.photoUrl ?? null,
    dateOfBirth: null, // not returned by service; deferred to v1.1
    nationality: raw.sections.profile.nationality ?? null,
    position: raw.player.position ?? null,
  };

  // Build currentTeam from the player's current team name + season
  const currentTeam: TeamSummary | null = raw.player.teamName
    ? {
        id: '', // service does not expose the team DB id in the player block
        apiId: null,
        nameEn: raw.player.teamName,
        nameHe: raw.player.teamName,
        logoUrl: null,
      }
    : null;

  // Build currentSeasonStats from the first aggregated stat row (latest season)
  const firstStat = raw.sections.aggregatedStats?.[0] ?? null;
  const currentSeasonStats: PlayerSeasonStats | null = firstStat
    ? {
        appearances: firstStat.gamesPlayed,
        starts: firstStat.starts,
        minutes: firstStat.minutesPlayed,
        goals: firstStat.goals,
        assists: firstStat.assists,
        yellowCards: firstStat.yellowCards,
        redCards: firstStat.redCards,
        subbedIn: firstStat.substituteAppearances,
        subbedOut: firstStat.timesSubbedOff,
      }
    : null;

  // Build recentMatches from the last 5 player game rows
  const recentMatches: PlayerRecentMatch[] = (raw.sections.games ?? [])
    .slice(0, 5)
    .map(
      (row: {
        gameId: string;
        matchLabel: string;
        displayDate: string;
        isStarter: boolean;
        wasSubbedIn: boolean;
        wasSubbedOff: boolean;
        goals: number;
        assists: number;
        minutesLabel: string;
      }): PlayerRecentMatch => {
        const role: PlayerRecentMatch['role'] = row.isStarter
          ? 'started'
          : row.wasSubbedIn
          ? 'subbed_in'
          : 'unused';
        const minutes = (() => {
          const parts = row.minutesLabel?.split('-');
          if (parts && parts.length === 2) {
            const start = parseInt(parts[0], 10);
            const end = parseInt(parts[1], 10);
            if (!isNaN(start) && !isNaN(end)) return end - start;
          }
          return 0;
        })();
        return {
          matchId: row.gameId,
          opponent: row.matchLabel,
          date: row.displayDate,
          role,
          contribution: {
            goals: row.goals,
            assists: row.assists,
            minutes,
          },
        };
      }
    );

  const payload: PlayerPayload = {
    player: playerProfile,
    currentTeam,
    currentSeasonStats,
    recentMatches,
  };

  return NextResponse.json(payload);
}
