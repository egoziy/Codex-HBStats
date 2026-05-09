#!/usr/bin/env node
/**
 * 33-link-ifa-names.js — Use IFA scraped_player as the source-of-truth Hebrew name
 * for DB players, then relink orphan game_events.
 *
 * Algorithm:
 *   1. Walk all IFA scraped_player records.
 *   2. Find the DB team in the same season (via IFA_TEAM_FULL_NAMES mapping).
 *   3. For each DB player on that team, score how well it matches the IFA player
 *      using consonant-skeleton overlap (Hebrew→Latin) AND name-direction reversal.
 *   4. If a uniquely-best match exists with high enough score → update DB player.nameHe
 *      to the IFA Hebrew (canonical, full form, "First Last" word order).
 *   5. Then relink orphan game_events whose participantName now equals a player.nameHe.
 *
 * Usage:
 *   node scripts/rebuild/33-link-ifa-names.js              # dry-run
 *   node scripts/rebuild/33-link-ifa-names.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const HEB_TO_LATIN = {
  'א': '', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'h', 'ט': 't', 'י': '', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '', 'פ': 'p', 'ף': 'p',
  'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't',
};
function hebToLatin(s) { return [...(s || '')].map((c) => HEB_TO_LATIN[c] ?? '').join('').toLowerCase(); }
function consonants(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, ''); }

// IFA team Hebrew (abbreviated/scraped) → canonical full Hebrew (matches DB team.nameHe).
const IFA_TEAM_FULL = {
  'הפועל ב"ש': 'הפועל באר שבע',
  'הפועל ת"א': 'הפועל תל אביב',
  'מכבי ת"א': 'מכבי תל אביב',
  'בית"ר י-ם': 'בית"ר ירושלים',
  'הפועל י-ם': 'הפועל קטמון ירושלים',
  'הפועל פ"ת': 'הפועל פתח תקווה',
  'הפועל ק"ש': 'עירוני קריית שמונה',
  'הפועל ר"ג': 'הפועל רמת גן',
  'הפועל כפ"ס': 'הפועל כפר סבא',
  'מכבי פ"ת': 'מכבי פתח תקווה',
  'הפ\' חדרה ש. שוורץ': 'הפועל חדרה',
  'הפ\' חדרה': 'הפועל חדרה',
  'הפועל ע"א': 'הפועל עפולה',
  'עירוני ק"ש': 'עירוני קריית שמונה',
  'מ.ס. אשדוד': 'מ.ס. אשדוד',
  'בני יהודה ת"א': 'בני יהודה',
  'בני סכנין': 'בני סכנין',
  'מכבי חיפה': 'מכבי חיפה',
  'מכבי נתניה': 'מכבי נתניה',
  'הפועל חיפה': 'הפועל חיפה',
  'מכבי בני ריינה': 'מכבי בני ריינה',
  'עירוני דורות טבריה': 'עירוני טבריה',
  'מכבי  פ"ת': 'מכבי פתח תקווה',
  'מכבי הרצליה דיוויד יחזקאל': 'מכבי הרצליה',
  'הכח מכבי עמידר ר"ג': 'הכח מכבי עמידר רמת גן',
  'הפועל ר"ל': 'הפועל ראשון לציון',
  'הפועל ראשל"צ': 'הפועל ראשון לציון',
  'הפועל ניר רמה"ש': 'הפועל ניר רמת השרון',
  'הפ\' בני לוד רכבת': 'הפועל בני לוד',
};

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} IFA name link to DB players`);

  // 1. Fetch all DB teams indexed by (nameHe, year)
  const dbTeams = await prisma.team.findMany({
    select: { id: true, nameHe: true, season: { select: { year: true } } },
  });
  const dbTeamByKey = new Map();
  for (const t of dbTeams) dbTeamByKey.set(`${t.nameHe}|${t.season?.year}`, t.id);

  // 2. Fetch DB players grouped by team
  const dbPlayers = await prisma.player.findMany({
    select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, teamId: true },
  });
  const playersByTeam = new Map();
  for (const p of dbPlayers) {
    if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
    playersByTeam.get(p.teamId).push(p);
  }

  // 3. Walk IFA scraped_players
  const ifaPlayers = await prisma.scrapedPlayer.findMany({
    where: { source: 'footballOrgIl' },
    select: { nameHe: true, team: { select: { nameHe: true, season: true } } },
  });

  let totalIfa = 0, mapped = 0, skippedNoTeam = 0, skippedAmbig = 0, skippedLow = 0;
  const updates = []; // { playerId, newNameHe }

  for (const sp of ifaPlayers) {
    if (!sp.team || !sp.nameHe) continue;
    totalIfa++;
    const startYear = parseInt(sp.team.season.split('/')[0], 10);
    if (!startYear) continue;

    // Map IFA team Hebrew → DB team Hebrew
    const dbTeamHe = IFA_TEAM_FULL[sp.team.nameHe] || sp.team.nameHe;
    const dbTeamId = dbTeamByKey.get(`${dbTeamHe}|${startYear}`);
    if (!dbTeamId) { skippedNoTeam++; continue; }

    const teamPlayers = playersByTeam.get(dbTeamId) || [];
    if (!teamPlayers.length) continue;

    // IFA Hebrew is "Last First" — reverse for canonical "First Last"
    const ifaWords = sp.nameHe.trim().split(/\s+/);
    const reversedHe = ifaWords.slice().reverse().join(' ');
    const ifaLatin = hebToLatin(sp.nameHe);
    const ifaSkeleton = consonants(ifaLatin);
    if (ifaSkeleton.length < 3) continue;

    // Score each player. Best candidate must be uniquely best.
    const scored = teamPlayers.map((p) => {
      const fullEn = `${p.firstNameEn || ''} ${p.lastNameEn || ''}`.trim() || p.nameEn || '';
      const lastSkel = consonants(p.lastNameEn || p.nameEn || '');
      const firstSkel = consonants(p.firstNameEn || '');
      const fullSkel = consonants(fullEn);
      let score = 0;
      // Strong signal: last name skeleton is a substring of IFA latin skeleton
      if (lastSkel.length >= 3 && ifaSkeleton.includes(lastSkel)) score += 10 + lastSkel.length;
      // First name match adds confidence
      if (firstSkel.length >= 3 && ifaSkeleton.includes(firstSkel)) score += 5;
      // Both first AND last in skeleton → very high confidence (avoid duplicates with same lastname)
      if (lastSkel.length >= 3 && firstSkel.length >= 3 &&
          ifaSkeleton.includes(lastSkel) && ifaSkeleton.includes(firstSkel)) score += 15;
      // Long full-name skeleton match
      if (fullSkel.length >= 6 && ifaSkeleton.includes(fullSkel)) score += 8;
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];

    if (!best || best.score < 15) { skippedLow++; continue; }
    if (second && best.score - second.score < 6) { skippedAmbig++; continue; }

    if (best.p.nameHe === reversedHe) { mapped++; continue; } // already correct

    updates.push({ playerId: best.p.id, newNameHe: reversedHe, dbName: best.p.nameEn, fromIfa: sp.nameHe });
    mapped++;
  }

  console.log(`\n  IFA players walked:      ${totalIfa}`);
  console.log(`  Mapped to DB player:     ${mapped}`);
  console.log(`  Updates queued:          ${updates.length}`);
  console.log(`  Skipped no-team:         ${skippedNoTeam}`);
  console.log(`  Skipped ambiguous:       ${skippedAmbig}`);
  console.log(`  Skipped low-score:       ${skippedLow}`);

  if (!APPLY) {
    console.log('\n  Sample of proposed updates:');
    updates.slice(0, 10).forEach((u) => console.log(`    ${u.dbName.padEnd(28)} → ${u.newNameHe} (IFA: ${u.fromIfa})`));
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const u of updates) {
    await prisma.player.update({ where: { id: u.playerId }, data: { nameHe: u.newNameHe } }).catch(() => null);
    done++;
    if (done % 500 === 0) console.log(`    updated ${done}/${updates.length}`);
  }

  // 4. Relink orphan events whose participantName now matches a player's updated nameHe
  console.log(`\n  Relinking orphan events by exact name match...`);
  const result = await prisma.$executeRaw`
    UPDATE game_events ge
    SET "playerId" = sub.id
    FROM (SELECT id, "nameHe", "teamId" FROM players) sub
    WHERE ge."playerId" IS NULL
      AND ge."teamId" = sub."teamId"
      AND ge."participantName" = sub."nameHe"
  `;
  console.log(`  ✓ relinked ${result} orphan events`);

  // Also check reversed direction
  const result2 = await prisma.$executeRaw`
    UPDATE game_events ge
    SET "playerId" = sub.id
    FROM (
      SELECT id, "nameHe", "teamId",
             ARRAY_TO_STRING(ARRAY_REVERSE(STRING_TO_ARRAY("nameHe", ' ')), ' ') AS reversed
      FROM players WHERE "nameHe" IS NOT NULL
    ) sub
    WHERE ge."playerId" IS NULL
      AND ge."teamId" = sub."teamId"
      AND ge."participantName" = sub.reversed
  `.catch((e) => { console.log(`  (reversed-match query unsupported: ${e.message.slice(0, 80)})`); return 0; });
  if (result2) console.log(`  ✓ relinked ${result2} more via reversed name match`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
