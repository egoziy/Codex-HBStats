#!/usr/bin/env node
/**
 * 32-relink-orphan-events.js — Relink orphan game_events (playerId=NULL) by name.
 *
 * For each orphan event with a Hebrew participantName, find a player on the same
 * team whose English last name (transliterated) appears in the Hebrew participant.
 *
 * Usage:
 *   node scripts/rebuild/32-relink-orphan-events.js              # dry-run
 *   node scripts/rebuild/32-relink-orphan-events.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const HEB_TO_LATIN = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'h', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'p',
  'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't',
};
function hebToLatin(s) { return [...(s || '')].map((c) => HEB_TO_LATIN[c] ?? c).join('').toLowerCase(); }

function consonantSkeleton(s) {
  return s.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} orphan event relink`);

  // Pull orphan events with hebrew participant + team
  const orphans = await prisma.$queryRaw`
    SELECT id, "teamId", "participantName" FROM game_events
    WHERE "playerId" IS NULL AND "participantName" IS NOT NULL AND "teamId" IS NOT NULL
      AND "participantName" ~ '[֐-׿]'
  `;
  console.log(`  ${orphans.length} orphan events with Hebrew participant + team`);

  // Index players by team id
  const players = await prisma.player.findMany({
    select: { id: true, teamId: true, nameEn: true, lastNameEn: true, firstNameEn: true },
  });
  const byTeam = new Map();
  for (const p of players) {
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId).push(p);
  }

  let matched = 0;
  const updates = [];
  for (const ev of orphans) {
    const teamPlayers = byTeam.get(ev.teamId) || [];
    if (!teamPlayers.length) continue;

    const participantLatin = hebToLatin(ev.participantName);
    const participantSkeleton = consonantSkeleton(participantLatin);

    // Score each player by how many consonants of their last name appear contiguously in the participant skeleton
    const scored = teamPlayers.map((p) => {
      const lastSkel = consonantSkeleton(p.lastNameEn || p.nameEn || '');
      const firstSkel = consonantSkeleton(p.firstNameEn || '');
      let score = 0;
      if (lastSkel.length >= 3 && participantSkeleton.includes(lastSkel)) score += 10 + lastSkel.length;
      if (lastSkel.length >= 4 && participantSkeleton.includes(lastSkel.slice(0, lastSkel.length - 1))) score += 4;
      if (firstSkel.length >= 3 && participantSkeleton.includes(firstSkel)) score += 6;
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];
    if (!best || best.score < 10) continue;
    // Require best to be uniquely best by margin
    if (second && best.score - second.score < 4) continue;

    matched++;
    if (!APPLY) {
      if (matched <= 12) console.log(`  ${ev.participantName.padEnd(28)} → ${best.p.nameEn} (score ${best.score})`);
      continue;
    }
    updates.push({ id: ev.id, playerId: best.p.id });
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: matched ${matched}/${orphans.length}`);

  if (APPLY && updates.length) {
    let done = 0;
    for (const u of updates) {
      await prisma.gameEvent.update({ where: { id: u.id }, data: { playerId: u.playerId } });
      done++;
      if (done % 500 === 0) console.log(`  ...${done}/${updates.length}`);
    }
    console.log(`  ✓ ${done} events relinked`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
