import { NextRequest, NextResponse } from 'next/server';
import { getMobilePlayerPayload } from '@/lib/mobile-details-api';
import prisma from '@/lib/prisma';
import type { PlayerPayload, PlayerSeasonStats, PlayerRecentMatch, PlayerCareerEntry } from '@shared/types/mobile-api';
import type { TeamSummary } from '@shared/types/common';

export const dynamic = 'force-dynamic';

// Pulls the Flashscore extras out of Player.additionalInfo. additionalInfo is
// a Json column so we narrow types defensively.
function extractFlashscoreExtras(additionalInfo: unknown): {
  marketValue: string | null;
  contractUntil: string | null;
  career: PlayerCareerEntry[];
} {
  const empty = { marketValue: null, contractUntil: null, career: [] as PlayerCareerEntry[] };
  if (!additionalInfo || typeof additionalInfo !== 'object') return empty;
  const flashscore = (additionalInfo as { flashscore?: unknown }).flashscore;
  if (!flashscore || typeof flashscore !== 'object') return empty;
  const f = flashscore as {
    marketValue?: unknown;
    contractUntil?: unknown;
    career?: unknown;
  };
  const career: PlayerCareerEntry[] = Array.isArray(f.career)
    ? (f.career as Array<Record<string, unknown>>)
        .map((row) => ({
          season: typeof row.season === 'string' ? row.season : '',
          team: typeof row.team === 'string' ? row.team : null,
          competition: typeof row.competition === 'string' ? row.competition : null,
          rating: typeof row.rating === 'number' ? row.rating : null,
          apps: typeof row.apps === 'number' ? row.apps : null,
          goals: typeof row.goals === 'number' ? row.goals : null,
          assists: typeof row.assists === 'number' ? row.assists : null,
          yellow: typeof row.yellow === 'number' ? row.yellow : null,
          red: typeof row.red === 'number' ? row.red : null,
        }))
        .filter((row) => row.season)
    : [];
  return {
    marketValue: typeof f.marketValue === 'string' ? f.marketValue : null,
    contractUntil: typeof f.contractUntil === 'string' ? f.contractUntil : null,
    career,
  };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobilePlayerPayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Small follow-up query: pull birthDate + Flashscore extras that the
  // shared service does not expose. We try the matched player row first,
  // then fall back to its canonical row so loan-season records still get
  // the market value / contract / career stored on the master record.
  const playerRow = await prisma.player.findFirst({
    where: { id: raw.player.id },
    select: { birthDate: true, additionalInfo: true, canonicalPlayerId: true },
  });
  let extras = playerRow ? extractFlashscoreExtras(playerRow.additionalInfo) : { marketValue: null, contractUntil: null, career: [] };
  let birthDate = playerRow?.birthDate ?? null;
  if (playerRow?.canonicalPlayerId && (!extras.marketValue && !extras.career.length)) {
    const canonical = await prisma.player.findUnique({
      where: { id: playerRow.canonicalPlayerId },
      select: { birthDate: true, additionalInfo: true },
    });
    if (canonical) {
      extras = extractFlashscoreExtras(canonical.additionalInfo);
      if (!birthDate) birthDate = canonical.birthDate;
    }
  }

  // Build player profile
  const playerProfile: PlayerPayload['player'] = {
    id: raw.player.id,
    nameHe: raw.player.name ?? '',
    nameEn: raw.player.nameEn ?? raw.player.name ?? '',
    photoUrl: raw.player.photoUrl ?? null,
    dateOfBirth: birthDate ? birthDate.toISOString().slice(0, 10) : null,
    nationality: raw.sections.profile.nationality ?? null,
    position: raw.player.position ?? null,
    marketValue: extras.marketValue,
    contractUntil: extras.contractUntil,
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
    career: extras.career,
  };

  return NextResponse.json(payload);
}
