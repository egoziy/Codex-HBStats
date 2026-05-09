#!/usr/bin/env node
/**
 * 31-fix-player-names-from-ifa.js — Replace bad transliterations with IFA Hebrew names.
 *
 * Strategy:
 *   For each Player with nameEn (e.g. "Lucas Ventura"), find the matching IFA
 *   scraped_player (same team, same season, fuzzy name match between IFA Hebrew
 *   and the player's English name + a transliteration check). If matched, set
 *   the player's nameHe to the IFA Hebrew form (which is canonical Hebrew).
 *
 * After running this, also relink orphan game_events (events where playerId is null
 * but participantName matches an IFA-style Hebrew name).
 *
 * Usage:
 *   node scripts/rebuild/31-fix-player-names-from-ifa.js              # dry-run
 *   node scripts/rebuild/31-fix-player-names-from-ifa.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// IFA Hebrew name → likely English / transliteration markers.
// We match by checking last-name overlap or word-overlap heuristics.
function normalize(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// Best-effort same-person check between IFA Hebrew and English names.
// Strategy: split both, check if any word in English appears as a substring of any Hebrew word transliterated.
// Simplified: we just check that the IFA Hebrew has the player's last name (lowercased English last name) somewhere
// when transliterated as raw chars.

const HEB_TO_LATIN = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'h', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'p',
  'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't',
};

function hebToLatin(s) {
  return [...(s || '')].map((c) => HEB_TO_LATIN[c] ?? c).join('').toLowerCase();
}

function hebrewMatchesEnglish(heb, eng) {
  if (!heb || !eng) return false;
  const transliterated = hebToLatin(heb);
  const engNorm = eng.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const engWords = engNorm.split(' ').filter((w) => w.length >= 4);
  if (!engWords.length) return false;
  // At least one English word with length>=4 must approximately appear in the transliterated Hebrew
  for (const w of engWords) {
    // check substring with some flexibility (drop vowels)
    const dropped = w.replace(/[aeiou]/g, '');
    if (dropped.length >= 3 && transliterated.includes(dropped.slice(0, 4))) return true;
    if (transliterated.includes(w.slice(0, 4))) return true;
  }
  return false;
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} Hebrew name fix from IFA`);

  // Index IFA scraped_players by team season
  const ifaPlayers = await prisma.scrapedPlayer.findMany({
    where: { source: 'footballOrgIl' },
    select: { nameHe: true, team: { select: { nameHe: true, season: true } } },
  });
  // Map: "{teamHe}|{startYear}" → [Hebrew names]
  const ifaByKey = new Map();
  for (const p of ifaPlayers) {
    if (!p.team) continue;
    const startYear = parseInt(p.team.season.split('/')[0], 10);
    const key = `${p.team.nameHe}|${startYear}`;
    if (!ifaByKey.has(key)) ifaByKey.set(key, []);
    ifaByKey.get(key).push(p.nameHe);
  }

  // IFA team abbreviation → DB Hebrew (best effort, partial)
  const IFA_TEAM_FULL = {
    'הפועל ב"ש': 'הפועל באר שבע', 'הפועל ת"א': 'הפועל תל אביב', 'מכבי ת"א': 'מכבי תל אביב',
    'בית"ר י-ם': 'בית"ר ירושלים', 'הפועל י-ם': 'הפועל קטמון ירושלים',
    'הפועל פ"ת': 'הפועל פתח תקווה', 'הפועל ק"ש': 'עירוני קריית שמונה',
    'מכבי פ"ת': 'מכבי פתח תקווה', 'הפ\' חדרה': 'הפועל חדרה',
  };
  // Also build reverse for IFA index
  const additionalKeys = new Map();
  for (const [k, v] of ifaByKey) {
    const [teamHe, year] = k.split('|');
    const full = IFA_TEAM_FULL[teamHe];
    if (full) additionalKeys.set(`${full}|${year}`, v);
  }
  for (const [k, v] of additionalKeys) {
    if (!ifaByKey.has(k)) ifaByKey.set(k, v);
    else ifaByKey.set(k, [...ifaByKey.get(k), ...v]);
  }

  // Walk DB players
  const players = await prisma.player.findMany({
    select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true,
              team: { select: { nameHe: true, season: { select: { year: true } } } } },
  });

  let total = 0, updated = 0;
  for (const p of players) {
    if (!p.team?.nameHe) continue;
    const key = `${p.team.nameHe}|${p.team.season.year}`;
    const candidates = ifaByKey.get(key) || [];
    if (!candidates.length) continue;

    const fullNameEn = `${p.firstNameEn || ''} ${p.lastNameEn || ''}`.trim() || p.nameEn;
    const ifaMatch = candidates.find((heb) => hebrewMatchesEnglish(heb, fullNameEn));

    if (!ifaMatch) continue;
    if (ifaMatch === p.nameHe) continue; // already correct

    total++;
    if (!APPLY) {
      if (total <= 12) console.log(`  ${p.team.nameHe.padEnd(20)} ${fullNameEn.padEnd(28)} ${p.nameHe.padEnd(22)} → ${ifaMatch}`);
      continue;
    }
    try {
      await prisma.player.update({ where: { id: p.id }, data: { nameHe: ifaMatch } });
      updated++;
    } catch (e) { /* ignore */ }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} candidate updates${APPLY ? ` | applied: ${updated}` : ''}`);

  // Phase 2: relink orphan game_events whose participantName matches a player's new Hebrew name
  if (APPLY) {
    console.log('\n=== Relinking orphan game_events by Hebrew name ===');
    const result = await prisma.$executeRaw`
      UPDATE game_events ge
      SET "playerId" = sub.id
      FROM (
        SELECT p.id, p."nameHe", p."teamId"
        FROM players p
      ) sub
      WHERE ge."playerId" IS NULL
        AND ge."teamId" = sub."teamId"
        AND ge."participantName" = sub."nameHe"
    `;
    console.log(`  ${result} orphan events relinked`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
