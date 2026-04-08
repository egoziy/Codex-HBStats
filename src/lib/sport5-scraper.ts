/**
 * Sport5.co.il Scraper
 *
 * Scrapes football data from sport5.co.il and saves to ScrapedTeam/Player/Match tables.
 * Data is stored raw — separate from main models — until manually merged.
 *
 * URL patterns:
 *   Team:   /team.aspx?FolderID={id}
 *   Player: /Player/{TeamFolderId}/{PlayerId}/{slug}
 *   Liga:   /liga.aspx?FolderID={id}
 */

import prisma from '@/lib/prisma';

const SPORT5_BASE = 'https://www.sport5.co.il';
const REQUEST_DELAY_MS = 600;
const SOURCE = 'sport5';

export const SPORT5_TEAMS: Record<number, { nameHe: string; nameEn: string }> = {
  1639: { nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva' },
  192:  { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
  191:  { nameHe: 'בית"ר ירושלים', nameEn: 'Beitar Jerusalem' },
  163:  { nameHe: 'מכבי חיפה', nameEn: 'Maccabi Haifa' },
  164:  { nameHe: 'הפועל תל אביב', nameEn: 'Hapoel Tel Aviv' },
  9749: { nameHe: 'הפועל ירושלים', nameEn: 'Hapoel Jerusalem' },
  1632: { nameHe: 'הפועל חיפה', nameEn: 'Hapoel Haifa' },
  198:  { nameHe: 'מ.ס. אשדוד', nameEn: 'Ashdod' },
  193:  { nameHe: 'מכבי נתניה', nameEn: 'Maccabi Netanya' },
  1641: { nameHe: 'מכבי בני ריינה', nameEn: 'Maccabi Bnei Raina' },
  197:  { nameHe: 'הפועל פתח תקווה', nameEn: 'Hapoel Petach Tikva' },
  195:  { nameHe: 'בני סכנין', nameEn: 'Bnei Sakhnin' },
  845:  { nameHe: 'עירוני קריית שמונה', nameEn: 'Hapoel Kiryat Shmona' },
  2973: { nameHe: 'עירוני טבריה', nameEn: 'Ironi Tiberias' },
};

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

// ──────────────────────────────────────────────
// Team page scraper → saves ScrapedTeam + ScrapedPlayer
// ──────────────────────────────────────────────

export async function scrapeAndSaveTeam(folderId: number): Promise<{ players: number; name: string }> {
  const url = `${SPORT5_BASE}/team.aspx?FolderID=${folderId}`;
  const html = await fetchPage(url);

  const teamInfo = SPORT5_TEAMS[folderId] || { nameHe: 'Unknown', nameEn: '' };

  // Detect current season from page
  const seasonMatch = html.match(/(\d{4}\/\d{4}|\d{4}\/\d{2})/);
  const season = seasonMatch?.[1] || null;

  // Upsert team
  const scrapedTeam = await prisma.scrapedTeam.upsert({
    where: { source_sourceId_season: { source: SOURCE, sourceId: String(folderId), season: season || 'current' } },
    update: { nameHe: teamInfo.nameHe, nameEn: teamInfo.nameEn, scrapedAt: new Date() },
    create: { source: SOURCE, sourceId: String(folderId), nameHe: teamInfo.nameHe, nameEn: teamInfo.nameEn, season: season || 'current' },
  });

  // Extract players: /Player/{TeamFolderId}/{PlayerId}/{slug}
  const playerPattern = /\/Player\/(\d+)\/(\d+)\/([^"]+)"/g;
  const namePattern = /\/Player\/\d+\/\d+\/[^"]+"\s*[^>]*>([^<]+)</g;
  const seen = new Set<string>();
  const players: Array<{ sourceId: string; name: string; slug: string }> = [];

  let match;
  while ((match = playerPattern.exec(html)) !== null) {
    const playerId = match[2];
    if (seen.has(playerId)) continue;
    seen.add(playerId);

    // Find name next to this link
    const nameRe = new RegExp(`/Player/\\d+/${playerId}/[^"]+\"[^>]*>([^<]+)`, 'g');
    const nameMatch = nameRe.exec(html);
    const name = nameMatch?.[1]?.trim() || decodeURIComponent(match[3]).replace(/-/g, ' ');

    players.push({ sourceId: playerId, name, slug: match[3] });
  }

  // Save players
  for (const p of players) {
    await prisma.scrapedPlayer.upsert({
      where: { source_sourceId_teamId: { source: SOURCE, sourceId: p.sourceId, teamId: scrapedTeam.id } },
      update: { nameHe: p.name, scrapedAt: new Date() },
      create: { source: SOURCE, sourceId: p.sourceId, nameHe: p.name, teamId: scrapedTeam.id },
    });
  }

  // Extract standings
  const rowPattern = /<tr[^>]*>\s*<td>(\d+)<\/td>\s*<td[^>]*>.*?FolderID=(\d+)[^>]*>([^<]+)<\/a><\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td[^>]*>(\d+):(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>(\d+)<\/td>/g;
  while ((match = rowPattern.exec(html)) !== null) {
    const pos = parseInt(match[1], 10);
    const teamName = match[3].trim();
    await prisma.scrapedStanding.upsert({
      where: { source_season_leagueNameHe_position: { source: SOURCE, season: season || 'current', leagueNameHe: 'ליגת העל', position: pos } },
      update: { teamNameHe: teamName, played: parseInt(match[4], 10), wins: parseInt(match[5], 10), draws: parseInt(match[6], 10), losses: parseInt(match[7], 10), goalsFor: parseInt(match[8], 10), goalsAgainst: parseInt(match[9], 10), points: parseInt(match[11], 10), scrapedAt: new Date() },
      create: { source: SOURCE, season: season || 'current', leagueNameHe: 'ליגת העל', position: pos, teamNameHe: teamName, played: parseInt(match[4], 10), wins: parseInt(match[5], 10), draws: parseInt(match[6], 10), losses: parseInt(match[7], 10), goalsFor: parseInt(match[8], 10), goalsAgainst: parseInt(match[9], 10), points: parseInt(match[11], 10) },
    });
  }

  return { players: players.length, name: teamInfo.nameHe };
}

// ──────────────────────────────────────────────
// Player page scraper → saves ScrapedPlayerSeason
// ──────────────────────────────────────────────

export async function scrapeAndSavePlayer(
  scrapedPlayerId: string,
  teamFolderId: number,
  sport5PlayerId: string,
  slug: string,
): Promise<{ seasons: number; name: string }> {
  const url = `${SPORT5_BASE}/Player/${teamFolderId}/${sport5PlayerId}/${slug}`;
  const html = await fetchPage(url);

  // Name
  const nameMatch = html.match(/סטטיסטיקות\s*:\s*([^<"]+)/);
  const name = nameMatch?.[1]?.trim() || 'Unknown';

  // Season stats: <tr><td>2024/25</td><td>32</td><td>21</td><td>1</td><td>16</td><td>11</td><td>2</td><td>0</td></tr>
  const seasonRowPattern = /<tr>\s*<td>(\d{4}\/\d{2,4})<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/g;
  let seasonCount = 0;
  let match;

  while ((match = seasonRowPattern.exec(html)) !== null) {
    const season = match[1].trim();
    await prisma.scrapedPlayerSeason.upsert({
      where: { source_season_playerId: { source: SOURCE, season, playerId: scrapedPlayerId } },
      update: {
        appearances: parseInt(match[2], 10) || 0,
        starts: parseInt(match[3], 10) || 0,
        goals: parseInt(match[4], 10) || 0,
        subsIn: parseInt(match[5], 10) || 0,
        subsOut: parseInt(match[6], 10) || 0,
        yellowCards: parseInt(match[7], 10) || 0,
        redCards: parseInt(match[8], 10) || 0,
        scrapedAt: new Date(),
      },
      create: {
        source: SOURCE,
        season,
        playerId: scrapedPlayerId,
        appearances: parseInt(match[2], 10) || 0,
        starts: parseInt(match[3], 10) || 0,
        goals: parseInt(match[4], 10) || 0,
        subsIn: parseInt(match[5], 10) || 0,
        subsOut: parseInt(match[6], 10) || 0,
        yellowCards: parseInt(match[7], 10) || 0,
        redCards: parseInt(match[8], 10) || 0,
      },
    });
    seasonCount++;
  }

  // Update player name
  await prisma.scrapedPlayer.update({ where: { id: scrapedPlayerId }, data: { nameHe: name } });

  return { seasons: seasonCount, name };
}

// ──────────────────────────────────────────────
// Full scrape: all teams → all players → all season stats
// ──────────────────────────────────────────────

export async function scrapeAllSport5(folderIds?: number[]): Promise<{
  jobId: string;
  teamsScraped: number;
  playersScraped: number;
  seasonsScraped: number;
  errors: string[];
}> {
  const ids = folderIds || Object.keys(SPORT5_TEAMS).map(Number);
  const errors: string[] = [];
  let teamsScraped = 0;
  let playersScraped = 0;
  let seasonsScraped = 0;

  // Create job
  const job = await prisma.scrapeJob.create({
    data: { source: SOURCE, targetType: 'all', status: 'running', startedAt: new Date() },
  });

  try {
    // Phase 1: Scrape all team pages
    for (const folderId of ids) {
      try {
        const result = await scrapeAndSaveTeam(folderId);
        teamsScraped++;
        playersScraped += result.players;
      } catch (error: any) {
        errors.push(`Team ${folderId}: ${error.message}`);
      }
      await delay(REQUEST_DELAY_MS);
    }

    // Phase 2: Scrape all player pages for historical stats
    const allPlayers = await prisma.scrapedPlayer.findMany({
      where: { source: SOURCE },
      select: { id: true, sourceId: true, team: { select: { sourceId: true } } },
    });

    for (const player of allPlayers) {
      try {
        // Build slug from player name (we'll use sourceId as slug might not be stored)
        const playerRecord = await prisma.scrapedPlayer.findUnique({
          where: { id: player.id },
          select: { nameHe: true },
        });
        const slug = encodeURIComponent(playerRecord?.nameHe?.replace(/\s+/g, '-') || player.sourceId);
        const result = await scrapeAndSavePlayer(player.id, parseInt(player.team.sourceId, 10), player.sourceId, slug);
        seasonsScraped += result.seasons;
      } catch (error: any) {
        errors.push(`Player ${player.sourceId}: ${error.message}`);
      }
      await delay(REQUEST_DELAY_MS);
    }

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        teamsScraped,
        playersScraped,
        matchesScraped: 0,
        errorsCount: errors.length,
        log: { errors: errors.slice(0, 50) },
        finishedAt: new Date(),
      },
    });
  } catch (error: any) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorsCount: errors.length + 1, log: { errors: [...errors.slice(0, 50), error.message] }, finishedAt: new Date() },
    });
  }

  return { jobId: job.id, teamsScraped, playersScraped, seasonsScraped, errors };
}
