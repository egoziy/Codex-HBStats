#!/usr/bin/env node
/**
 * 30-players.js — Build canonical players (one row per player per team-season).
 *
 * Strategy:
 *   1. Walk apifootball_raw_players per league-season → upsert Player rows.
 *      Player IDs come from API-Football (apiFootballId).
 *   2. Hebrew name: match against IFA scraped_players (same team + fuzzy name).
 *   3. Cross-season linkage: set canonicalPlayerId based on (apiFootballId or full nameEn).
 *
 * Usage:
 *   node scripts/rebuild/30-players.js              # dry-run
 *   node scripts/rebuild/30-players.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function normalize(s) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function nameMatches(a, b) {
  if (!a || !b) return false;
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return true;
  // last word match
  const wa = na.split(' '), wb = nb.split(' ');
  if (wa.length > 1 && wb.length > 1 && wa[wa.length - 1] === wb[wb.length - 1] && wa[0][0] === wb[0][0]) return true;
  // reversed
  if (na === wb.slice().reverse().join(' ')) return true;
  return false;
}

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} canonical players build`);

  // Index DB teams by (apiFootballId, seasonId) → team.id
  const dbTeams = await prisma.team.findMany({ select: { id: true, apiFootballId: true, seasonId: true, nameHe: true } });
  const teamByApiSeason = new Map();
  const teamsBySeasonName = new Map(); // for IFA matching: seasonId → [teams]
  for (const t of dbTeams) {
    if (t.apiFootballId) teamByApiSeason.set(`${t.apiFootballId}|${t.seasonId}`, t);
    if (!teamsBySeasonName.has(t.seasonId)) teamsBySeasonName.set(t.seasonId, []);
    teamsBySeasonName.get(t.seasonId).push(t);
  }

  // Index IFA scraped players by team Hebrew name
  const ifaPlayers = await prisma.scrapedPlayer.findMany({
    where: { source: 'footballOrgIl' },
    select: { sourceId: true, nameHe: true, photoUrl: true, birthDate: true, nationality: true, teamId: true,
              team: { select: { nameHe: true, season: true } } },
  });
  // Map key: "{teamNameHe}|{startYear}" → [players]
  const ifaByTeamSeason = new Map();
  for (const p of ifaPlayers) {
    if (!p.team) continue;
    const startYear = parseInt(p.team.season.split('/')[0], 10);
    const key = `${p.team.nameHe}|${startYear}`;
    if (!ifaByTeamSeason.has(key)) ifaByTeamSeason.set(key, []);
    ifaByTeamSeason.get(key).push(p);
  }

  // Walk all API-Football player rows
  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const yearById = new Map(seasons.map((s) => [s.id, s.year]));

  const afRows = await prisma.apiFootballRawPlayers.findMany({ select: { leagueId: true, season: true, payload: true } });

  let total = 0, created = 0, hebMatched = 0, hebMissing = 0, errors = 0;

  for (const row of afRows) {
    const items = row.payload?.response || [];
    for (const item of items) {
      const p = item?.player;
      const stats = (item?.statistics || [])[0] || {};
      const apiTeamId = stats?.team?.id;
      if (!p || !apiTeamId) continue;

      // Resolve DB team
      const seasonRow = seasons.find((s) => s.year === row.season);
      if (!seasonRow) continue;
      const team = teamByApiSeason.get(`${apiTeamId}|${seasonRow.id}`);
      if (!team) continue;

      const nameEn = p.name || `${p.firstname || ''} ${p.lastname || ''}`.trim();
      if (!nameEn) continue;

      // Try IFA Hebrew match
      const ifaCandidates = ifaByTeamSeason.get(`${team.nameHe}|${seasonRow.year}`) || [];
      let nameHe = nameEn, photoUrl = p.photo || null, birthDate = p.birth?.date ? new Date(p.birth.date) : null;
      let ifaMatched = ifaCandidates.find((ip) => nameMatches(ip.nameHe, nameEn));
      if (ifaMatched) {
        nameHe = ifaMatched.nameHe;
        photoUrl = photoUrl || ifaMatched.photoUrl;
        birthDate = birthDate || ifaMatched.birthDate;
        hebMatched++;
      } else { hebMissing++; }

      total++;

      if (!APPLY) {
        if (total <= 6) console.log(`  ${row.season} ${team.nameHe.padEnd(20)} ${nameEn.padEnd(30)} → ${nameHe}${ifaMatched ? ' [IFA]' : ''}`);
        continue;
      }

      try {
        await prisma.player.upsert({
          where: { apiFootballId_teamId: { apiFootballId: p.id, teamId: team.id } },
          update: {
            nameEn, nameHe,
            firstNameEn: p.firstname || undefined,
            lastNameEn: p.lastname || undefined,
            position: stats?.games?.position || p.position || undefined,
            photoUrl: photoUrl || undefined,
            birthDate: birthDate || undefined,
            nationalityEn: p.nationality || undefined,
            height: p.height || undefined,
            weight: p.weight || undefined,
            age: p.age || undefined,
          },
          create: {
            teamId: team.id,
            apiFootballId: p.id,
            nameEn, nameHe,
            firstNameEn: p.firstname || null,
            lastNameEn: p.lastname || null,
            position: stats?.games?.position || p.position || null,
            photoUrl: photoUrl || null,
            birthDate: birthDate || null,
            nationalityEn: p.nationality || null,
            height: p.height || null,
            weight: p.weight || null,
            age: p.age || null,
          },
        });
        created++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.log(`  ✗ ${nameEn}: ${e.message.slice(0, 100)}`);
      }
    }
  }

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'}: ${total} players seen | Hebrew from IFA: ${hebMatched}, fallback (English): ${hebMissing}${APPLY ? ` | upserted: ${created}, errors: ${errors}` : ''}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
