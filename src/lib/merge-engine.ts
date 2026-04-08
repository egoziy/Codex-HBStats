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

  return {
    changes,
    summary: {
      updates: changes.filter((c) => c.type === 'update').length,
      creates: changes.filter((c) => c.type === 'create').length,
      skips: changes.filter((c) => c.type === 'skip').length,
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

  const updates = preview.changes.filter((c) => c.type === 'update');
  const snapshots: Array<{ id: string; entity: string; original: Record<string, any> }> = [];
  const applied: Array<{ id: string; entity: string; fields: Record<string, any> }> = [];
  const errors: string[] = [];

  for (const change of updates) {
    if (change.entity === 'playerStats' && change.matchedId) {
      try {
        // Snapshot original
        const original = await prisma.playerStatistics.findUnique({ where: { id: change.matchedId } });
        if (!original) { errors.push(`ID ${change.matchedId} not found`); continue; }

        const originalFields: Record<string, any> = {};
        const updateData: Record<string, any> = {};
        for (const [field, { old: _old, new: newVal }] of Object.entries(change.fields)) {
          originalFields[field] = (original as any)[field];
          updateData[field] = newVal;
        }

        snapshots.push({ id: change.matchedId, entity: 'playerStats', original: originalFields });

        await prisma.playerStatistics.update({ where: { id: change.matchedId }, data: updateData });
        applied.push({ id: change.matchedId, entity: 'playerStats', fields: updateData });
      } catch (e: any) {
        errors.push(`${change.scrapedName}: ${e.message}`);
      }
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

  const snapshot = merge.snapshotJson as { snapshots: Array<{ id: string; entity: string; original: Record<string, any> }> } | null;
  if (!snapshot?.snapshots) throw new Error('No snapshot data for rollback');

  let reverted = 0;
  const errors: string[] = [];

  for (const snap of snapshot.snapshots) {
    try {
      if (snap.entity === 'playerStats') {
        await prisma.playerStatistics.update({ where: { id: snap.id }, data: snap.original });
        reverted++;
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
