/**
 * Merge Engine — previews, executes, and rolls back data merges
 * from scraped tables (scraped_*) into main tables (players, standings, etc.)
 *
 * Flow: preview → approve → execute → (optional) rollback
 *
 * Principles:
 * - NEVER overwrite non-null/non-zero fields from API-Football
 * - Only fill empty fields or records
 * - Every change is recorded in snapshotJson for rollback
 * - Match by Hebrew name (fuzzy) when IDs don't match
 */

import prisma from '@/lib/prisma';

// ──────────────────────────────────────────────
// Name matching utilities
// ──────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .replace(/&#\d+;/g, '')       // HTML entities like &#39;
    .replace(/&\w+;/g, '')        // Named HTML entities like &amp;
    .replace(/['"״׳\-\.`']/g, '') // Quotes, dashes, dots
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Last word match (family name)
  const partsA = na.split(' ');
  const partsB = nb.split(' ');
  if (partsA.length > 1 && partsB.length > 1) {
    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    if (lastA === lastB) return true;
    // Fuzzy last name: allow 1-2 char difference for transliteration variants
    if (lastA.length >= 3 && lastB.length >= 3 && levenshtein(lastA, lastB) <= 2) return true;
  }

  // Full name fuzzy: allow distance proportional to name length
  const maxDist = Math.max(1, Math.floor(Math.max(na.length, nb.length) * 0.2));
  if (levenshtein(na, nb) <= maxDist) return true;

  // First name match + similar last name
  if (partsA.length > 1 && partsB.length > 1 && partsA[0] === partsB[0]) {
    const lastDist = levenshtein(partsA[partsA.length - 1], partsB[partsB.length - 1]);
    if (lastDist <= 3) return true;
  }

  return false;
}

// ──────────────────────────────────────────────
// Season name normalization (sport5: "2024/25" → DB: "2024-2025")
// ──────────────────────────────────────────────

function normalizeSeasonName(scraped: string): string {
  // "2024/25" → "2024-2025", "2024/2025" → "2024-2025"
  const m = scraped.match(/(\d{4})\/(\d{2,4})/);
  if (!m) return scraped;
  const startYear = m[1];
  const endYear = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${startYear}-${endYear}`;
}

// ──────────────────────────────────────────────
// IFA abbreviated team name mapping
// ──────────────────────────────────────────────

const IFA_TEAM_ABBREVS: Record<string, string[]> = {
  'הפועל ב"ש': ['הפועל באר שבע'],
  'הפועל ת"א': ['הפועל תל אביב'],
  'מכבי ת"א': ['מכבי תל אביב'],
  'בית"ר י-ם': ['בית"ר ירושלים', 'ביתר ירושלים'],
  'הפועל י-ם': ['הפועל ירושלים'],
  'הפועל פ"ת': ['הפועל פתח תקווה'],
  'הפועל ק"ש': ['עירוני קריית שמונה', 'הפועל קריית שמונה'],
  'הפועל ר"ג': ['הפועל רמת גן'],
  'הפועל כפ"ס': ['הפועל כפר סבא'],
  'מכבי פ"ת': ['מכבי פתח תקווה'],
  'הפ\' חדרה ש. שוורץ': ['הפועל חדרה'],
  'הפ\' חדרה': ['הפועל חדרה'],
  'הפועל ע"א': ['הפועל עפולה'],
  'עירוני ק"ש': ['עירוני קריית שמונה'],
  'מ.ס. אשדוד': ['מ.ס. אשדוד', 'אשדוד'],
  'בני יהודה ת"א': ['בני יהודה'],
  'הפועל ק"ג': ['הפועל קריית גת'],
  'מכבי ק"ג': ['מכבי קריית גת'],
  'הפועל ר"ל': ['הפועל ראשון לציון'],
  'עירוני ר"ל': ['עירוני ראשון לציון'],
  'מכבי ב"ר': ['מכבי בני ריינה'],
  'בני סכנין': ['בני סכנין'],
  'מכבי נתניה': ['מכבי נתניה'],
  'מכבי חיפה': ['מכבי חיפה'],
  'הפועל חיפה': ['הפועל חיפה'],
  'עירוני טבריה': ['עירוני טבריה'],
};

function matchTeamName(ifaName: string, dbName: string): boolean {
  // Direct match
  if (namesMatch(ifaName, dbName)) return true;
  // Check abbreviation mapping
  const expansions = IFA_TEAM_ABBREVS[ifaName];
  if (expansions) {
    return expansions.some((exp) => namesMatch(exp, dbName));
  }
  // Fuzzy: strip quotes and compare
  const cleanIfa = normalizeName(ifaName);
  const cleanDb = normalizeName(dbName);
  if (cleanIfa === cleanDb) return true;
  // If one contains the other
  if (cleanDb.includes(cleanIfa) || cleanIfa.includes(cleanDb)) return true;
  return false;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type PreviewChange = {
  type: 'update' | 'create' | 'skip';
  entity: 'player' | 'playerStats' | 'standing';
  scrapedName: string;
  matchedName?: string;
  matchedId?: string;
  fields: Record<string, { old: any; new: any }>;
  reason?: string;
};

type MergePreview = {
  changes: PreviewChange[];
  summary: {
    updates: number;
    creates: number;
    skips: number;
  };
};

// ──────────────────────────────────────────────
// Preview: show what would change
// ──────────────────────────────────────────────

export async function previewPlayerMerge(source: string): Promise<MergePreview> {
  const changes: PreviewChange[] = [];

  const scrapedPlayers = await prisma.scrapedPlayer.findMany({
    where: { source },
    include: {
      team: { select: { nameHe: true, season: true } },
      seasonStats: true,
    },
  });

  // Get all DB seasons
  const dbSeasons = await prisma.season.findMany({ select: { id: true, name: true } });
  const seasonMap = new Map(dbSeasons.map((s) => [s.name, s.id]));

  for (const scraped of scrapedPlayers) {
    for (const stat of scraped.seasonStats) {
      const dbSeasonName = normalizeSeasonName(stat.season);
      const seasonId = seasonMap.get(dbSeasonName);
      if (!seasonId) {
        changes.push({ type: 'skip', entity: 'playerStats', scrapedName: `${scraped.nameHe} (${stat.season})`, reason: `עונה ${dbSeasonName} לא נמצאה ב-DB` });
        continue;
      }

      // Find matching team in this season
      const dbTeams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true, nameEn: true } });
      const matchedTeam = dbTeams.find((t) => namesMatch(t.nameHe, scraped.team.nameHe));
      if (!matchedTeam) {
        changes.push({ type: 'skip', entity: 'playerStats', scrapedName: `${scraped.nameHe} (${stat.season})`, reason: `קבוצה ${scraped.team.nameHe} לא נמצאה בעונה ${dbSeasonName}` });
        continue;
      }

      // Find matching player
      const dbPlayers = await prisma.player.findMany({ where: { teamId: matchedTeam.id }, select: { id: true, nameHe: true, nameEn: true } });
      const matchedPlayer = dbPlayers.find((p) => namesMatch(p.nameHe, scraped.nameHe));
      if (!matchedPlayer) {
        changes.push({ type: 'skip', entity: 'playerStats', scrapedName: `${scraped.nameHe} (${stat.season})`, reason: 'שחקן לא נמצא ב-DB' });
        continue;
      }

      // Check existing stats
      const existingStats = await prisma.playerStatistics.findFirst({
        where: { playerId: matchedPlayer.id, seasonId },
      });

      if (existingStats) {
        const fields: Record<string, { old: any; new: any }> = {};
        if (existingStats.goals === 0 && stat.goals > 0) fields.goals = { old: 0, new: stat.goals };
        if (existingStats.gamesPlayed === 0 && stat.appearances > 0) fields.gamesPlayed = { old: 0, new: stat.appearances };
        if (existingStats.starts === 0 && stat.starts > 0) fields.starts = { old: 0, new: stat.starts };
        if (existingStats.yellowCards === 0 && stat.yellowCards > 0) fields.yellowCards = { old: 0, new: stat.yellowCards };
        if (existingStats.redCards === 0 && stat.redCards > 0) fields.redCards = { old: 0, new: stat.redCards };
        if (existingStats.substituteAppearances === 0 && stat.subsIn > 0) fields.substituteAppearances = { old: 0, new: stat.subsIn };
        if (existingStats.timesSubbedOff === 0 && stat.subsOut > 0) fields.timesSubbedOff = { old: 0, new: stat.subsOut };

        if (Object.keys(fields).length > 0) {
          changes.push({
            type: 'update', entity: 'playerStats',
            scrapedName: `${scraped.nameHe} (${stat.season})`,
            matchedName: matchedPlayer.nameHe, matchedId: existingStats.id,
            fields,
          });
        } else {
          changes.push({ type: 'skip', entity: 'playerStats', scrapedName: `${scraped.nameHe} (${stat.season})`, reason: 'כל השדות כבר מלאים', fields: {} });
        }
      } else {
        changes.push({ type: 'skip', entity: 'playerStats', scrapedName: `${scraped.nameHe} (${stat.season})`, reason: 'אין רשומת סטטיסטיקות קיימת — לא יוצרים חדשה מסריקה', fields: {} });
      }
    }
  }

  return { changes, summary: buildSummary(changes) };
}

function buildSummary(changes: PreviewChange[]) {
  return {
    updates: changes.filter((c) => c.type === 'update').length,
    creates: changes.filter((c) => c.type === 'create').length,
    skips: changes.filter((c) => c.type === 'skip').length,
  };
}

// ──────────────────────────────────────────────
// Preview: IFA standings merge
// ──────────────────────────────────────────────

// IFA abbreviated name → full Hebrew name mapping for team creation
const IFA_FULL_NAMES: Record<string, { nameHe: string; nameEn: string }> = {
  'הפועל ב"ש': { nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva' },
  'הפועל ת"א': { nameHe: 'הפועל תל אביב', nameEn: 'Hapoel Tel Aviv' },
  'מכבי ת"א': { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
  'בית"ר י-ם': { nameHe: 'בית"ר ירושלים', nameEn: 'Beitar Jerusalem' },
  'הפועל י-ם': { nameHe: 'הפועל ירושלים', nameEn: 'Hapoel Jerusalem' },
  'הפועל פ"ת': { nameHe: 'הפועל פתח תקווה', nameEn: 'Hapoel Petach Tikva' },
  'הפועל ק"ש': { nameHe: 'עירוני קריית שמונה', nameEn: 'Ironi Kiryat Shmona' },
  'הפועל ר"ג': { nameHe: 'הפועל רמת גן', nameEn: 'Hapoel Ramat Gan' },
  'הפועל כפ"ס': { nameHe: 'הפועל כפר סבא', nameEn: 'Hapoel Kfar Saba' },
  'מכבי פ"ת': { nameHe: 'מכבי פתח תקווה', nameEn: 'Maccabi Petach Tikva' },
  'מ.ס. אשדוד': { nameHe: 'מ.ס. אשדוד', nameEn: 'MS Ashdod' },
  'בני יהודה ת"א': { nameHe: 'בני יהודה', nameEn: 'Bnei Yehuda' },
  'בני סכנין': { nameHe: 'בני סכנין', nameEn: 'Bnei Sakhnin' },
  'מכבי חיפה': { nameHe: 'מכבי חיפה', nameEn: 'Maccabi Haifa' },
  'מכבי נתניה': { nameHe: 'מכבי נתניה', nameEn: 'Maccabi Netanya' },
  'הפועל חיפה': { nameHe: 'הפועל חיפה', nameEn: 'Hapoel Haifa' },
  'הפועל רעננה': { nameHe: 'הפועל רעננה', nameEn: 'Hapoel Raanana' },
  'הפועל עכו': { nameHe: 'הפועל עכו', nameEn: 'Hapoel Acre' },
  'הפועל ראשל"צ': { nameHe: 'הפועל ראשון לציון', nameEn: 'Hapoel Rishon LeZion' },
  'סקציה נס ציונה': { nameHe: 'סקציה נס ציונה', nameEn: 'Sektzia Nes Tziona' },
  'הפ\' חדרה ש. שוורץ': { nameHe: 'הפועל חדרה', nameEn: 'Hapoel Hadera' },
  'הפ\' חדרה': { nameHe: 'הפועל חדרה', nameEn: 'Hapoel Hadera' },
  'הפ\' נוף הגליל': { nameHe: 'הפועל נוף הגליל', nameEn: 'Hapoel Nof HaGalil' },
  'הפועל ע. עפולה': { nameHe: 'הפועל עפולה', nameEn: 'Hapoel Afula' },
  'הפ\' בני לוד רכבת': { nameHe: 'הפועל בני לוד', nameEn: 'Hapoel Bnei Lod' },
  'בית"ר ת"א חולון': { nameHe: 'בית"ר תל אביב', nameEn: 'Beitar Tel Aviv' },
  'הפועל ע. אשקלון / לא פעיל': { nameHe: 'הפועל אשקלון', nameEn: 'Hapoel Ashkelon' },
  'עירוני דורות טבריה': { nameHe: 'עירוני טבריה', nameEn: 'Ironi Tiberias' },
  'הפועל כפר שלם': { nameHe: 'הפועל כפר שלם', nameEn: 'Hapoel Kfar Shalem' },
  'הפועל ירושלים': { nameHe: 'הפועל ירושלים', nameEn: 'Hapoel Jerusalem' },
  'הפועל א.א. פאחם': { nameHe: 'הפועל אום אל פאחם', nameEn: 'Hapoel Umm al-Fahm' },
  'עירוני נשר': { nameHe: 'עירוני נשר', nameEn: 'Ironi Nesher' },
  'א.ס. אשדוד': { nameHe: 'א.ס. אשדוד', nameEn: 'AS Ashdod' },
  'הפועל הרצליה עירוני': { nameHe: 'הפועל הרצליה', nameEn: 'Hapoel Herzliya' },
  'איחוד בני שפרעם': { nameHe: 'איחוד בני שפרעם', nameEn: 'Ihud Bnei Shefaram' },
};

function resolveTeamNames(ifaName: string): { nameHe: string; nameEn: string } {
  return IFA_FULL_NAMES[ifaName] || { nameHe: ifaName, nameEn: ifaName };
}

export async function previewStandingsMerge(
  source: string,
  options?: { season?: string },
): Promise<MergePreview> {
  const changes: PreviewChange[] = [];

  const whereClause: any = { source };
  if (options?.season) whereClause.season = options.season;

  const scrapedStandings = await prisma.scrapedStanding.findMany({
    where: whereClause,
    orderBy: [{ season: 'desc' }, { position: 'asc' }],
  });

  const dbSeasons = await prisma.season.findMany({ select: { id: true, name: true } });
  const seasonMap = new Map(dbSeasons.map((s) => [s.name, s.id]));

  // Collect seasons that need to be created
  const missingSeasonsSet = new Set<string>();

  for (const scraped of scrapedStandings) {
    const dbSeasonName = normalizeSeasonName(scraped.season);
    let seasonId = seasonMap.get(dbSeasonName);
    if (!seasonId) {
      missingSeasonsSet.add(dbSeasonName);
      // Still allow showing as "create" — season will be created during execute
      const resolved = resolveTeamNames(scraped.teamNameHe);
      changes.push({
        type: 'create', entity: 'standing',
        scrapedName: `${scraped.teamNameHe} (${scraped.season})`,
        matchedName: `[חדש] ${resolved.nameHe}`,
        reason: `ייצור עונה ${dbSeasonName} + קבוצה + שורת טבלה`,
        fields: { position: { old: null, new: scraped.position }, played: { old: null, new: scraped.played }, wins: { old: null, new: scraped.wins }, draws: { old: null, new: scraped.draws }, losses: { old: null, new: scraped.losses }, goalsFor: { old: null, new: scraped.goalsFor }, goalsAgainst: { old: null, new: scraped.goalsAgainst }, points: { old: null, new: scraped.points } },
      });
      continue;
    }

    // Find matching team
    const dbTeams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true, nameEn: true } });
    const matchedTeam = dbTeams.find((t) => matchTeamName(scraped.teamNameHe, t.nameHe));

    if (matchedTeam) {
      // Team exists — check standings
      const existing = await prisma.standing.findFirst({ where: { seasonId, teamId: matchedTeam.id } });
      if (existing) {
        const fields: Record<string, { old: any; new: any }> = {};
        if (existing.played === 0 && scraped.played > 0) fields.played = { old: 0, new: scraped.played };
        if (existing.wins === 0 && scraped.wins > 0) fields.wins = { old: 0, new: scraped.wins };
        if (existing.draws === 0 && scraped.draws > 0) fields.draws = { old: 0, new: scraped.draws };
        if (existing.losses === 0 && scraped.losses > 0) fields.losses = { old: 0, new: scraped.losses };
        if (existing.goalsFor === 0 && scraped.goalsFor > 0) fields.goalsFor = { old: 0, new: scraped.goalsFor };
        if (existing.goalsAgainst === 0 && scraped.goalsAgainst > 0) fields.goalsAgainst = { old: 0, new: scraped.goalsAgainst };
        if (existing.points === 0 && scraped.points > 0) fields.points = { old: 0, new: scraped.points };
        if (Object.keys(fields).length > 0) {
          changes.push({ type: 'update', entity: 'standing', scrapedName: `${scraped.teamNameHe} (${scraped.season})`, matchedName: matchedTeam.nameHe, matchedId: existing.id, fields });
        } else {
          changes.push({ type: 'skip', entity: 'standing', scrapedName: `${scraped.teamNameHe} (${scraped.season})`, reason: 'כל השדות מלאים', fields: {} });
        }
      } else {
        // Team exists but no standing — create
        changes.push({
          type: 'create', entity: 'standing',
          scrapedName: `${scraped.teamNameHe} (${scraped.season})`,
          matchedName: matchedTeam.nameHe,
          fields: { position: { old: null, new: scraped.position }, played: { old: null, new: scraped.played }, wins: { old: null, new: scraped.wins }, draws: { old: null, new: scraped.draws }, losses: { old: null, new: scraped.losses }, goalsFor: { old: null, new: scraped.goalsFor }, goalsAgainst: { old: null, new: scraped.goalsAgainst }, points: { old: null, new: scraped.points } },
        });
      }
    } else {
      // No team in DB — propose creating team + standing
      const resolved = resolveTeamNames(scraped.teamNameHe);
      changes.push({
        type: 'create', entity: 'standing',
        scrapedName: `${scraped.teamNameHe} (${scraped.season})`,
        matchedName: `[חדש] ${resolved.nameHe}`,
        reason: 'ייצור קבוצה חדשה + שורת טבלה',
        fields: { position: { old: null, new: scraped.position }, played: { old: null, new: scraped.played }, wins: { old: null, new: scraped.wins }, draws: { old: null, new: scraped.draws }, losses: { old: null, new: scraped.losses }, goalsFor: { old: null, new: scraped.goalsFor }, goalsAgainst: { old: null, new: scraped.goalsAgainst }, points: { old: null, new: scraped.points } },
      });
    }
  }

  return { changes, summary: buildSummary(changes) };
}

// ──────────────────────────────────────────────
// Combined preview with source + type selection
// ──────────────────────────────────────────────

export async function previewMerge(
  source: string,
  mergeType: 'players' | 'standings' | 'all',
  options?: { season?: string },
): Promise<MergePreview> {
  if (mergeType === 'players') return previewPlayerMerge(source);
  if (mergeType === 'standings') return previewStandingsMerge(source, options);

  // 'all' — combine both
  const [players, standings] = await Promise.all([
    previewPlayerMerge(source),
    previewStandingsMerge(source, options),
  ]);
  return {
    changes: [...players.changes, ...standings.changes],
    summary: {
      updates: players.summary.updates + standings.summary.updates,
      creates: players.summary.creates + standings.summary.creates,
      skips: players.summary.skips + standings.summary.skips,
    },
  };
}

// ──────────────────────────────────────────────
// Execute: apply approved changes
// ──────────────────────────────────────────────

export async function executeMerge(mergeId: string): Promise<{ updated: number; errors: string[] }> {
  const merge = await prisma.mergeOperation.findUnique({ where: { id: mergeId } });
  if (!merge || merge.status !== 'approved') {
    throw new Error('Merge must be approved before execution');
  }

  const preview = merge.previewJson as { changes: PreviewChange[] } | null;
  if (!preview?.changes) throw new Error('No preview data');

  const actionableChanges = preview.changes.filter((c) => c.type === 'update' || c.type === 'create');
  const snapshots: Array<{ id: string; entity: string; original: Record<string, any>; action: 'update' | 'create' }> = [];
  const applied: Array<{ id: string; entity: string; fields: Record<string, any> }> = [];
  const errors: string[] = [];

  for (const change of actionableChanges) {
    try {
      if (change.entity === 'playerStats' && change.type === 'update' && change.matchedId) {
        const original = await prisma.playerStatistics.findUnique({ where: { id: change.matchedId } });
        if (!original) { errors.push(`PlayerStats ${change.matchedId} not found`); continue; }
        const originalFields: Record<string, any> = {};
        const updateData: Record<string, any> = {};
        for (const [field, { new: newVal }] of Object.entries(change.fields)) {
          originalFields[field] = (original as any)[field];
          updateData[field] = newVal;
        }
        snapshots.push({ id: change.matchedId, entity: 'playerStats', original: originalFields, action: 'update' });
        await prisma.playerStatistics.update({ where: { id: change.matchedId }, data: updateData });
        applied.push({ id: change.matchedId, entity: 'playerStats', fields: updateData });
      }

      if (change.entity === 'standing' && change.type === 'update' && change.matchedId) {
        const original = await prisma.standing.findUnique({ where: { id: change.matchedId } });
        if (!original) { errors.push(`Standing ${change.matchedId} not found`); continue; }
        const originalFields: Record<string, any> = {};
        const updateData: Record<string, any> = {};
        for (const [field, { new: newVal }] of Object.entries(change.fields)) {
          originalFields[field] = (original as any)[field];
          updateData[field] = newVal;
        }
        snapshots.push({ id: change.matchedId, entity: 'standing', original: originalFields, action: 'update' });
        await prisma.standing.update({ where: { id: change.matchedId }, data: updateData });
        applied.push({ id: change.matchedId, entity: 'standing', fields: updateData });
      }

      if (change.entity === 'standing' && change.type === 'create') {
        const scrapedSeason = change.scrapedName.match(/\(([^)]+)\)/)?.[1] || '';
        const dbSeasonName = normalizeSeasonName(scrapedSeason);
        const dbSeasons = await prisma.season.findMany({ select: { id: true, name: true } });
        let seasonId = dbSeasons.find((s) => s.name === dbSeasonName)?.id;

        // Create season if it doesn't exist
        if (!seasonId) {
          const yearMatch = dbSeasonName.match(/^(\d{4})/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          if (year > 0) {
            const newSeason = await prisma.season.create({
              data: { year, name: dbSeasonName, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-06-30`) },
            });
            seasonId = newSeason.id;
            snapshots.push({ id: newSeason.id, entity: 'season', original: {}, action: 'create' });
          } else {
            errors.push(`Cannot create season: ${dbSeasonName}`);
            continue;
          }
        }

        // Find or create team
        const isNewTeam = change.matchedName?.startsWith('[חדש]');
        let teamId: string;

        if (isNewTeam) {
          // Extract the original IFA name from scrapedName
          const ifaName = change.scrapedName.replace(/\s*\([^)]+\)$/, '');
          const resolved = resolveTeamNames(ifaName);
          const newTeam = await prisma.team.create({
            data: { nameHe: resolved.nameHe, nameEn: resolved.nameEn, seasonId },
          });
          teamId = newTeam.id;
          snapshots.push({ id: newTeam.id, entity: 'team', original: {}, action: 'create' });
        } else {
          const teams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true } });
          const matchedTeamName = change.matchedName || '';
          const team = teams.find((t) => matchTeamName(matchedTeamName, t.nameHe) || t.nameHe === matchedTeamName);
          if (!team) { errors.push(`Team ${matchedTeamName} not found in ${dbSeasonName}`); continue; }
          teamId = team.id;
        }

        const created = await prisma.standing.create({
          data: {
            seasonId,
            teamId,
            position: change.fields.position?.new ?? 0,
            played: change.fields.played?.new ?? 0,
            wins: change.fields.wins?.new ?? 0,
            draws: change.fields.draws?.new ?? 0,
            losses: change.fields.losses?.new ?? 0,
            goalsFor: change.fields.goalsFor?.new ?? 0,
            goalsAgainst: change.fields.goalsAgainst?.new ?? 0,
            points: change.fields.points?.new ?? 0,
          },
        });
        snapshots.push({ id: created.id, entity: 'standing', original: {}, action: 'create' });
        applied.push({ id: created.id, entity: 'standing', fields: change.fields });
      }
    } catch (e: any) {
      errors.push(`${change.scrapedName}: ${e.message}`);
    }
  }

  await prisma.mergeOperation.update({
    where: { id: mergeId },
    data: {
      status: errors.length > 0 && applied.length === 0 ? 'failed' : 'executed',
      changesJson: { applied, errors },
      snapshotJson: { snapshots },
      recordsUpdated: applied.length,
      executedAt: new Date(),
    },
  });

  return { updated: applied.length, errors };
}

// ──────────────────────────────────────────────
// Rollback: revert executed merge
// ──────────────────────────────────────────────

export async function rollbackMerge(mergeId: string): Promise<{ reverted: number; errors: string[] }> {
  const merge = await prisma.mergeOperation.findUnique({ where: { id: mergeId } });
  if (!merge || merge.status !== 'executed') {
    throw new Error('Can only rollback executed merges');
  }

  const snapshot = merge.snapshotJson as { snapshots: Array<{ id: string; entity: string; original: Record<string, any>; action?: string }> } | null;
  if (!snapshot?.snapshots) throw new Error('No snapshot data for rollback');

  let reverted = 0;
  const errors: string[] = [];

  for (const snap of snapshot.snapshots) {
    try {
      if (snap.action === 'create') {
        // Delete the created record
        if (snap.entity === 'standing') {
          await prisma.standing.delete({ where: { id: snap.id } }).catch(() => null);
          reverted++;
        }
        if (snap.entity === 'team') {
          await prisma.team.delete({ where: { id: snap.id } }).catch(() => null);
          reverted++;
        }
        if (snap.entity === 'season') {
          // Delete season (cascade removes teams, standings, etc.)
          await prisma.season.delete({ where: { id: snap.id } }).catch(() => null);
          reverted++;
        }
      } else {
        // Revert to original values
        if (snap.entity === 'playerStats') {
          await prisma.playerStatistics.update({ where: { id: snap.id }, data: snap.original });
          reverted++;
        }
        if (snap.entity === 'standing') {
          await prisma.standing.update({ where: { id: snap.id }, data: snap.original });
          reverted++;
        }
      }
    } catch (e: any) {
      errors.push(`Rollback ${snap.id}: ${e.message}`);
    }
  }

  await prisma.mergeOperation.update({
    where: { id: mergeId },
    data: { status: 'rolled_back', rolledBackAt: new Date() },
  });

  return { reverted, errors };
}
