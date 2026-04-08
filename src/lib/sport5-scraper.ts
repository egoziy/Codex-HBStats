/**
 * Sport5.co.il Scraper
 *
 * Scrapes structured football data from sport5.co.il team and player pages.
 * These pages are server-rendered HTML (ASP.NET) and don't require a headless browser.
 *
 * Key URL patterns:
 *   Team page:   /team.aspx?FolderID={id}    → roster, stats, results
 *   Player page: /Player/{TeamID}/{PlayerID}/{slug} → multi-season stats
 *   League page: /liga.aspx?FolderID={id}     → top scorers, cards
 *
 * Known FolderIDs:
 *   44  = Liga Ha'al (Israeli Premier League)
 *   80  = Liga Leumit (National League)
 *   284 = Israel National Team
 *
 * Data principles:
 *   - Never overwrite existing API-Football data
 *   - Only fill empty fields or add missing records
 *   - Match by sport5 IDs or by team+player name fuzzy match
 */

const SPORT5_BASE = 'https://www.sport5.co.il';
const REQUEST_DELAY_MS = 500;

// Known team FolderID → team name mapping
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

export const SPORT5_LEAGUES: Record<number, { nameHe: string; nameEn: string }> = {
  44: { nameHe: 'ליגת העל', nameEn: "Ligat Ha'al" },
  80: { nameHe: 'ליגה לאומית', nameEn: 'Liga Leumit' },
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

// ──────────────────────────────────────────────
// Parsing utilities
// ──────────────────────────────────────────────

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.trim().replace(/<[^>]+>/g, '').trim() || null;
}

function extractAllMatches(html: string, pattern: RegExp): RegExpMatchArray[] {
  return [...html.matchAll(pattern)];
}

// ──────────────────────────────────────────────
// Team page scraper
// ──────────────────────────────────────────────

export type Sport5Player = {
  sport5Id: number;
  name: string;
  position: string | null;
  jerseyNumber: number | null;
  teamFolderId: number;
};

export type Sport5TeamResult = {
  opponent: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string | null;
  isHome: boolean;
};

export type Sport5TeamData = {
  folderId: number;
  nameHe: string;
  players: Sport5Player[];
  results: Sport5TeamResult[];
  standings: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  } | null;
};

export async function scrapeTeamPage(folderId: number): Promise<Sport5TeamData> {
  const url = `${SPORT5_BASE}/team.aspx?FolderID=${folderId}`;
  const html = await fetchPage(url);

  const teamInfo = SPORT5_TEAMS[folderId] || { nameHe: extractText(html, /<h1[^>]*>([^<]+)</) || 'Unknown', nameEn: '' };

  // Extract players from roster
  // Pattern: /Player/{TeamFolderId}/{PlayerId}/{slug}
  const playerPattern = /\/Player\/(\d+)\/(\d+)\/[^"]*"[^>]*>([^<]+)</g;
  const playerMatches = extractAllMatches(html, playerPattern);
  const seenPlayerIds = new Set<number>();
  const players: Sport5Player[] = [];

  for (const match of playerMatches) {
    const teamId = parseInt(match[1], 10);
    const playerId = parseInt(match[2], 10);
    const name = match[3].trim();
    if (seenPlayerIds.has(playerId)) continue;
    seenPlayerIds.add(playerId);
    players.push({
      sport5Id: playerId,
      name,
      position: null, // extracted separately if available
      jerseyNumber: null,
      teamFolderId: teamId,
    });
  }

  // Extract jersey numbers and positions if present
  // Look for patterns like: <span class="shirtNum">7</span> or similar
  const jerseyPattern = /shirtNum[^>]*>(\d+)<[\s\S]*?\/Player\/\d+\/(\d+)\//g;
  for (const match of extractAllMatches(html, jerseyPattern)) {
    const num = parseInt(match[1], 10);
    const playerId = parseInt(match[2], 10);
    const player = players.find((p) => p.sport5Id === playerId);
    if (player) player.jerseyNumber = num;
  }

  // Extract standings from team page
  const standingsPattern = /(\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)[:\-](\d+)\s*<\/td>\s*<td[^>]*>\s*(\d+)/;
  const standingsMatch = html.match(standingsPattern);
  const standings = standingsMatch
    ? {
        played: parseInt(standingsMatch[1], 10),
        wins: parseInt(standingsMatch[2], 10),
        draws: parseInt(standingsMatch[3], 10),
        losses: parseInt(standingsMatch[4], 10),
        goalsFor: parseInt(standingsMatch[6], 10),
        goalsAgainst: parseInt(standingsMatch[7], 10),
        points: parseInt(standingsMatch[8], 10),
      }
    : null;

  return {
    folderId,
    nameHe: teamInfo.nameHe,
    players,
    results: [],
    standings,
  };
}

// ──────────────────────────────────────────────
// Player page scraper
// ──────────────────────────────────────────────

export type Sport5PlayerSeason = {
  season: string;
  team: string;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  subsIn: number;
  subsOut: number;
};

export type Sport5PlayerData = {
  sport5Id: number;
  name: string;
  position: string | null;
  teamFolderId: number;
  seasons: Sport5PlayerSeason[];
};

export async function scrapePlayerPage(teamFolderId: number, playerId: number, slug: string): Promise<Sport5PlayerData> {
  const url = `${SPORT5_BASE}/Player/${teamFolderId}/${playerId}/${slug}`;
  const html = await fetchPage(url);

  const name = extractText(html, /<h1[^>]*class="[^"]*playerName[^"]*"[^>]*>([^<]+)/) || 'Unknown';
  const position = extractText(html, /תפקיד[:\s]*<[^>]*>([^<]+)/) || null;

  // Extract season stats from table rows
  // Pattern varies but typically: season | team | appearances | goals | assists | yellow | red | sub-in | sub-out
  const seasonRowPattern = /<tr[^>]*>\s*<td[^>]*>([^<]*\d{4}[^<]*)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/g;
  const seasons: Sport5PlayerSeason[] = [];

  for (const match of extractAllMatches(html, seasonRowPattern)) {
    seasons.push({
      season: match[1].trim(),
      team: match[2].trim(),
      appearances: parseInt(match[3], 10) || 0,
      goals: parseInt(match[4], 10) || 0,
      assists: parseInt(match[5], 10) || 0,
      yellowCards: parseInt(match[6], 10) || 0,
      redCards: parseInt(match[7], 10) || 0,
      subsIn: 0,
      subsOut: 0,
    });
  }

  return {
    sport5Id: playerId,
    name,
    position,
    teamFolderId,
    seasons,
  };
}

// ──────────────────────────────────────────────
// League top scorers scraper
// ──────────────────────────────────────────────

export type Sport5TopScorer = {
  playerName: string;
  teamName: string;
  goals: number;
  sport5PlayerId: number | null;
};

export async function scrapeLeagueTopScorers(folderId: number): Promise<Sport5TopScorer[]> {
  const url = `${SPORT5_BASE}/liga.aspx?FolderID=${folderId}`;
  const html = await fetchPage(url);

  // Extract top scorers table
  const scorerPattern = /\/Player\/\d+\/(\d+)\/[^"]*"[^>]*>([^<]+)<[\s\S]*?<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>(\d+)<\/td>/g;
  const scorers: Sport5TopScorer[] = [];

  for (const match of extractAllMatches(html, scorerPattern)) {
    scorers.push({
      sport5PlayerId: parseInt(match[1], 10),
      playerName: match[2].trim(),
      teamName: match[3].trim(),
      goals: parseInt(match[4], 10) || 0,
    });
  }

  return scorers;
}

// ──────────────────────────────────────────────
// Batch scraper with rate limiting
// ──────────────────────────────────────────────

export type ScrapeResult = {
  teams: Sport5TeamData[];
  errors: Array<{ folderId: number; error: string }>;
  scrapedAt: string;
};

export async function scrapeAllTeams(folderIds: number[]): Promise<ScrapeResult> {
  const teams: Sport5TeamData[] = [];
  const errors: Array<{ folderId: number; error: string }> = [];

  for (const folderId of folderIds) {
    try {
      const team = await scrapeTeamPage(folderId);
      teams.push(team);
    } catch (error: any) {
      errors.push({ folderId, error: error.message || 'Unknown error' });
    }
    await delay(REQUEST_DELAY_MS);
  }

  return {
    teams,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
