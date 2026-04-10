/**
 * Sport5 Data Merge Logic
 *
 * Merges scraped data from sport5.co.il into the existing database
 * without overwriting data that came from API-Football.
 *
 * Principles:
 * 1. NEVER delete existing records
 * 2. NEVER overwrite non-null fields with scraped data
 * 3. Only fill empty/null fields
 * 4. Match by name similarity when IDs don't match
 * 5. Log all changes for audit trail
 */

import prisma from '@/lib/prisma';
import type { Sport5TeamData, Sport5PlayerData, Sport5PlayerSeason } from '@/lib/sport5-scraper';

type MergeLog = {
  action: 'created' | 'updated' | 'skipped' | 'matched';
  entity: 'player' | 'playerStats';
  name: string;
  details: string;
};

type MergeResult = {
  playersMatched: number;
  playersCreated: number;
  statsUpdated: number;
  skipped: number;
  logs: MergeLog[];
};

/**
 * Normalize a Hebrew name for fuzzy matching
 */
function normalizeName(name: string): string {
  return name
    .replace(/['"״׳\-\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Check if two names are similar enough to be the same person
 */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return true;

  // Check if last word (family name) matches
  const partsA = na.split(' ');
  const partsB = nb.split(' ');
  if (partsA.length > 1 && partsB.length > 1) {
    return partsA[partsA.length - 1] === partsB[partsB.length - 1];
  }

  return false;
}

/**
 * Find the best matching season in the DB for a sport5 season string
 * Sport5 uses formats like: "2023/2024", "2023-2024", "2024"
 */
async function findMatchingSeason(seasonStr: string): Promise<{ id: string; year: number } | null> {
  const yearMatch = seasonStr.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  const season = await prisma.season.findFirst({
    where: { year },
    select: { id: true, year: true },
  });

  return season;
}

/**
 * Find the best matching team in the DB for a sport5 team
 */
async function findMatchingTeam(nameHe: string, seasonId: string): Promise<{ id: string } | null> {
  // Try exact Hebrew name match
  const exact = await prisma.team.findFirst({
    where: { nameHe, team: { seasonId } } as any,
    select: { id: true },
  });
  if (exact) return exact;

  // Try fuzzy match
  const allTeams = await prisma.team.findMany({
    where: { seasonId },
    select: { id: true, nameHe: true, nameEn: true },
  });

  return allTeams.find((t) => namesMatch(t.nameHe, nameHe) || namesMatch(t.nameEn, nameHe)) || null;
}

/**
 * Find matching player in the DB
 */
async function findMatchingPlayer(
  nameHe: string,
  teamId: string,
): Promise<{ id: string; nameHe: string; nameEn: string; canonicalPlayerId: string | null } | null> {
  const teamPlayers = await prisma.player.findMany({
    where: { teamId },
    select: { id: true, nameHe: true, nameEn: true, canonicalPlayerId: true },
  });

  return teamPlayers.find((p) => namesMatch(p.nameHe, nameHe)) || null;
}

/**
 * Merge a team's scraped player data into the DB
 * Only fills missing data — never overwrites API-Football data
 */
export async function mergeTeamPlayers(
  teamData: Sport5TeamData,
  seasonId: string,
): Promise<MergeResult> {
  const result: MergeResult = {
    playersMatched: 0,
    playersCreated: 0,
    statsUpdated: 0,
    skipped: 0,
    logs: [],
  };

  const team = await findMatchingTeam(teamData.nameHe, seasonId);
  if (!team) {
    result.logs.push({
      action: 'skipped',
      entity: 'player',
      name: teamData.nameHe,
      details: `Team not found in DB for season ${seasonId}`,
    });
    return result;
  }

  for (const sport5Player of teamData.players) {
    const dbPlayer = await findMatchingPlayer(sport5Player.name, team.id);

    if (dbPlayer) {
      result.playersMatched++;
      result.logs.push({
        action: 'matched',
        entity: 'player',
        name: sport5Player.name,
        details: `Matched to ${dbPlayer.nameHe} (${dbPlayer.id})`,
      });

      // Update empty fields only
      const updates: Record<string, any> = {};
      if (sport5Player.jerseyNumber != null) {
        const current = await prisma.player.findUnique({
          where: { id: dbPlayer.id },
          select: { jerseyNumber: true },
        });
        if (current && current.jerseyNumber == null) {
          updates.jerseyNumber = sport5Player.jerseyNumber;
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.player.update({ where: { id: dbPlayer.id }, data: updates });
        result.logs.push({
          action: 'updated',
          entity: 'player',
          name: sport5Player.name,
          details: `Updated fields: ${Object.keys(updates).join(', ')}`,
        });
      }
    } else {
      result.skipped++;
      result.logs.push({
        action: 'skipped',
        entity: 'player',
        name: sport5Player.name,
        details: 'No matching player found in DB — skipped (not creating new players from scrape)',
      });
    }
  }

  return result;
}

/**
 * Merge player season stats from sport5 into PlayerStatistics
 * Only fills missing stats — never overwrites existing values
 */
export async function mergePlayerSeasonStats(
  playerData: Sport5PlayerData,
  seasonId: string,
): Promise<MergeResult> {
  const result: MergeResult = {
    playersMatched: 0,
    playersCreated: 0,
    statsUpdated: 0,
    skipped: 0,
    logs: [],
  };

  for (const seasonData of playerData.seasons) {
    const season = await findMatchingSeason(seasonData.season);
    if (!season) {
      result.logs.push({
        action: 'skipped',
        entity: 'playerStats',
        name: `${playerData.name} - ${seasonData.season}`,
        details: `Season ${seasonData.season} not found in DB`,
      });
      result.skipped++;
      continue;
    }

    const team = await findMatchingTeam(seasonData.team, season.id);
    if (!team) {
      result.skipped++;
      continue;
    }

    const player = await findMatchingPlayer(playerData.name, team.id);
    if (!player) {
      result.skipped++;
      continue;
    }

    result.playersMatched++;

    // Find existing stats for this player/season
    const existingStats = await prisma.playerStatistics.findFirst({
      where: {
        playerId: player.id,
        seasonId: season.id,
      },
    });

    if (existingStats) {
      // Only update fields that are 0 in DB but have values from scrape
      const updates: Record<string, number> = {};
      if (existingStats.goals === 0 && seasonData.goals > 0) updates.goals = seasonData.goals;
      if (existingStats.assists === 0 && seasonData.assists > 0) updates.assists = seasonData.assists;
      if (existingStats.yellowCards === 0 && seasonData.yellowCards > 0) updates.yellowCards = seasonData.yellowCards;
      if (existingStats.redCards === 0 && seasonData.redCards > 0) updates.redCards = seasonData.redCards;
      if (existingStats.gamesPlayed === 0 && seasonData.appearances > 0) updates.gamesPlayed = seasonData.appearances;

      if (Object.keys(updates).length > 0) {
        await prisma.playerStatistics.update({
          where: { id: existingStats.id },
          data: updates,
        });
        result.statsUpdated++;
        result.logs.push({
          action: 'updated',
          entity: 'playerStats',
          name: `${playerData.name} - ${seasonData.season}`,
          details: `Updated: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        });
      }
    } else {
      result.logs.push({
        action: 'skipped',
        entity: 'playerStats',
        name: `${playerData.name} - ${seasonData.season}`,
        details: 'No existing stats record — skipped (only updating existing records)',
      });
      result.skipped++;
    }
  }

  return result;
}
