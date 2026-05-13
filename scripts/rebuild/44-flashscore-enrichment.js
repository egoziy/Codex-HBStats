#!/usr/bin/env node
/**
 * 44-flashscore-enrichment.js — merge Flashscore raw archive into main DB.
 *
 * Source priority (Phase 3): API-Football is primary, Flashscore fills gaps only.
 *   - GameStatistics: every field is filled only if currently null (or 0 for xG,
 *     which is the API-Football sentinel for "no data"). Never clobbers API
 *     values. Advanced stats (xA / xGOT / big chances / touches in box) live
 *     in additionalInfo because they have no dedicated columns.
 *   - GameEvent (goals + cards + subs): backfilled only when the game has zero
 *     events from API-Football. Players are linked by name where possible;
 *     unlinked rows keep `participantName` for admin review.
 *   - GameLineupEntry: backfilled only when the game has zero lineup rows.
 *   - Player.position / birthDate / nationalityEn: filled when null.
 *   - Player market value / contract until / career history → additionalInfo.
 *
 * Usage:
 *   node scripts/rebuild/44-flashscore-enrichment.js              # dry-run
 *   node scripts/rebuild/44-flashscore-enrichment.js --apply
 *   node scripts/rebuild/44-flashscore-enrichment.js --apply --skip-players
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const SKIP_PLAYERS = process.argv.includes('--skip-players');
const SKIP_MATCHES = process.argv.includes('--skip-matches');

const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Flashscore drops common Israeli club prefixes ("Bnei", "Ironi", "Maccabi"
// or "SC"). Aliases below restore them so DB teams (which carry the full
// English name) match. Aliases are matched as whole-string equalities.
const FLASHSCORE_TEAM_ALIASES = {
  'Sakhnin': 'Bnei Sakhnin',
  'Kiryat Shmona': 'Ironi Kiryat Shmona',
  'Netanya': 'Maccabi Netanya',
  'Ashdod': 'SC Ashdod',
  'SC Ashdod': 'SC Ashdod',
  'Ironi Tiberias': 'Ironi Tiberias',
  'Tiberias': 'Ironi Tiberias',
  'Maccabi Bnei Raina': 'Bnei Reineh',
  'Bnei Raina': 'Bnei Reineh',
  // Same club, two names — DB uses the historical "Hapoel Katamon Jerusalem";
  // Flashscore uses the shortened modern form.
  'Hapoel Jerusalem': 'Hapoel Katamon',
};

const expandAlias = (s) => {
  const trimmed = (s || '').trim();
  if (FLASHSCORE_TEAM_ALIASES[trimmed]) return FLASHSCORE_TEAM_ALIASES[trimmed];
  return trimmed;
};

const normEn = (s) =>
  expandAlias(s || '')
    .replace(/\s*FC$/i, '')
    .replace(/['’`\-.]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bH\.?\s+/i, 'hapoel ')
    .replace(/\bM\.?\s+/i, 'maccabi ')
    .replace(/\bSC\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Map a Flashscore stat label → main GameStatistics column.
// Anything not mapped lands in additionalInfo as flashscore.<label>.
const STAT_MAP = {
  'Expected goals (xG)': ['homeXg', 'awayXg', 'float'],
  'Ball possession': ['homeTeamPossession', 'awayTeamPossession', 'percent'],
  'Total shots': ['homeShotsTotal', 'awayShotsTotal', 'int'],
  'Shots on target': ['homeShotsOnTarget', 'awayShotsOnTarget', 'int'],
  'Corner kicks': ['homeCorners', 'awayCorners', 'int'],
  'Fouls': ['homeFouls', 'awayFouls', 'int'],
  'Offsides': ['homeOffsides', 'awayOffsides', 'int'],
  // Yellow/red cards intentionally NOT mapped — IFA event-count wins.
};

const parseNum = (s, kind) => {
  if (s == null) return null;
  const v = String(s).replace('%', '').replace(',', '.');
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return kind === 'int' ? Math.round(n) : n;
};

async function buildGameLookup() {
  const dbGames = await prisma.game.findMany({
    select: {
      id: true,
      dateTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { nameEn: true, nameHe: true } },
      awayTeam: { select: { nameEn: true, nameHe: true } },
    },
  });
  const map = new Map();
  for (const g of dbGames) {
    if (!g.dateTime) continue;
    const k = `${dayKey(g.dateTime)}|${normEn(g.homeTeam?.nameEn)}|${normEn(g.awayTeam?.nameEn)}`;
    map.set(k, { id: g.id, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId });
  }
  return { map, total: dbGames.length };
}

// Given a FlashscoreScrapedMatch, resolve to the DB Game (plus its team IDs).
function findGameForFsMatch(fs, gameByKey) {
  const payload = fs.payload || {};
  const titleMatch = payload.title && payload.title.match(/\|\s*(.+?)\s+v\s+(.+?)\s+\d/);
  const homeName = titleMatch ? titleMatch[1] : (fs.homeKey || '').replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ');
  const awayName = titleMatch ? titleMatch[2] : (fs.awayKey || '').replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ');
  if (!fs.kickoffAt) return null;
  const baseKey = `|${normEn(homeName)}|${normEn(awayName)}`;
  let info = gameByKey.get(`${dayKey(fs.kickoffAt)}${baseKey}`);
  if (!info) {
    const d = new Date(fs.kickoffAt);
    for (const offset of [-1, 1]) {
      info = gameByKey.get(`${dayKey(new Date(d.getTime() + offset * 86400000))}${baseKey}`);
      if (info) break;
    }
  }
  if (!info) return null;
  return { ...info, homeName, awayName };
}

async function buildTeamLookup() {
  // Map FlashscoreScrapedTeam.teamKey → list of DB team IDs (one per season).
  // Players exist per-season, so a Flashscore team key may map to several DB
  // teams; we use the most-recent one (highest createdAt) for player lookup.
  const dbTeams = await prisma.team.findMany({
    select: { id: true, nameEn: true, nameHe: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const byNorm = new Map();
  for (const t of dbTeams) {
    if (!t.nameEn) continue;
    const k = normEn(t.nameEn);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(t.id);
  }
  const fsTeams = await prisma.flashscoreScrapedTeam.findMany();
  const map = new Map();
  let matched = 0, unmatched = [];
  for (const ft of fsTeams) {
    const ids = byNorm.get(normEn(ft.nameEn || ''));
    if (ids && ids.length) { map.set(ft.teamKey, ids); matched++; }
    else unmatched.push(ft.nameEn);
  }
  return { map, matched, total: fsTeams.length, unmatched };
}

async function enrichMatches() {
  console.log('\n[matches]');
  const { map: gameByKey, total: gamesTotal } = await buildGameLookup();
  console.log(`  DB games loaded: ${gamesTotal}`);

  const fsMatches = await prisma.flashscoreScrapedMatch.findMany();
  console.log(`  Flashscore matches: ${fsMatches.length}`);

  let matched = 0, missingDate = 0, noStats = 0, upserted = 0, errors = 0;
  const examples = [];

  for (const fs of fsMatches) {
    const payload = fs.payload || {};
    const stats = Array.isArray(payload.stats) ? payload.stats : null;
    if (!stats || stats.length === 0) { noStats++; continue; }
    if (!fs.kickoffAt) { missingDate++; continue; }

    const game = findGameForFsMatch(fs, gameByKey);
    if (!game) continue;
    const gameId = game.id;
    matched++;

    if (matched <= 5) {
      const xg = stats.find((s) => /xG/i.test(s.label) && !/xGOT/i.test(s.label));
      examples.push({ matchKey: fs.matchKey, gameId, home: game.homeName, away: game.awayName, xg });
    }

    if (!APPLY) continue;

    // Build candidate values
    const candidate = {};
    const additional = {};
    for (const s of stats) {
      const mapped = STAT_MAP[s.label];
      if (mapped) {
        const [hKey, aKey, kind] = mapped;
        candidate[hKey] = parseNum(s.home, kind);
        candidate[aKey] = parseNum(s.away, kind);
      } else {
        additional[s.label] = { home: s.home, away: s.away };
      }
    }

    try {
      // Fetch current GameStatistics so we only fill empties.
      const cur = await prisma.gameStatistics.findUnique({ where: { gameId } });

      // API-Football is the primary; only fill keys that are currently null
      // (or 0 for xG — API-Football's sentinel for "no data").
      const updateData = {};
      for (const [k, v] of Object.entries(candidate)) {
        if (v == null) continue;
        const isXg = /Xg$/.test(k);
        const curVal = cur ? cur[k] : null;
        const isEmpty = isXg ? (curVal == null || curVal === 0) : (curVal == null);
        if (isEmpty) updateData[k] = v;
      }

      // Advanced Flashscore-only stats always go in additionalInfo (no other source).
      const newAdditional = {
        ...(cur?.additionalInfo || {}),
        flashscore: additional,
        flashscoreMatchKey: fs.matchKey,
      };

      await prisma.gameStatistics.upsert({
        where: { gameId },
        update: { ...updateData, additionalInfo: newAdditional },
        create: { gameId, ...candidate, additionalInfo: newAdditional },
      });
      upserted++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.log(`    error on game ${gameId}: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`  matched: ${matched}, no-stats: ${noStats}, no-date: ${missingDate}, upserted: ${upserted}, errors: ${errors}`);
  if (!APPLY && examples.length) {
    console.log('  examples:');
    for (const e of examples) {
      console.log(`    ${e.matchKey} ${e.home} vs ${e.away} → game ${e.gameId} xG h=${e.xg?.home} a=${e.xg?.away}`);
    }
  }
}

async function enrichPlayers() {
  console.log('\n[players]');
  const { map: teamMap, matched, total, unmatched } = await buildTeamLookup();
  console.log(`  Flashscore teams matched to DB: ${matched}/${total}`);
  if (unmatched.length) console.log(`  unmatched team names:`, unmatched);

  const fsPlayers = await prisma.flashscoreScrapedPlayer.findMany();
  console.log(`  Flashscore players: ${fsPlayers.length}`);

  let mapped = 0, multiMatch = 0, notFound = 0, updated = 0, errors = 0;

  for (const fp of fsPlayers) {
    if (!fp.currentTeamKey) { notFound++; continue; }
    const dbTeamIds = teamMap.get(fp.currentTeamKey);
    if (!dbTeamIds || !dbTeamIds.length) { notFound++; continue; }
    if (!fp.nameEn) { notFound++; continue; }

    // Find candidate DB players across this team's season rows (any of dbTeamIds).
    const playersInTeam = await prisma.player.findMany({ where: { teamId: { in: dbTeamIds } } });
    // Player name normalizer: tolerant of word order + accents + dots
    const namePieces = (s) => normEn((s || '').replace(/\./g, ''))
      .split(/\s+/).filter((w) => w.length >= 2).sort();
    const target = namePieces(fp.nameEn);
    const targetSet = new Set(target);
    const candidates = playersInTeam.filter((p) => {
      const pn = namePieces(p.nameEn);
      if (pn.length === 0) return false;
      // Pieces match in any order — every Flashscore piece must appear in DB name OR vice-versa.
      const dbHasAll = target.every((w) => pn.includes(w));
      const fsHasAll = pn.every((w) => targetSet.has(w));
      return dbHasAll || fsHasAll;
    });

    if (candidates.length === 0) { notFound++; continue; }
    if (candidates.length > 1) {
      // Prefer the one whose birthDate matches if Flashscore has one
      if (fp.birthDate) {
        const exact = candidates.find((p) => p.birthDate && dayKey(p.birthDate) === dayKey(fp.birthDate));
        if (exact) candidates.splice(0, candidates.length, exact);
      }
      if (candidates.length > 1) { multiMatch++; continue; }
    }
    const dbPlayer = candidates[0];
    mapped++;

    if (!APPLY) continue;

    try {
      const newAdditional = {
        ...(dbPlayer.additionalInfo || {}),
        flashscore: {
          playerKey: fp.playerKey,
          url: fp.url,
          marketValue: fp.marketValue,
          contractUntil: fp.contractUntil ? fp.contractUntil.toISOString().slice(0, 10) : null,
          career: fp.payload?.career || null,
          nationality: fp.nationality,
        },
      };
      const data = { additionalInfo: newAdditional };
      // Only fill primary columns when currently null
      if (!dbPlayer.birthDate && fp.birthDate) data.birthDate = fp.birthDate;
      if (!dbPlayer.position && fp.position) data.position = fp.position;
      if (!dbPlayer.nationalityEn && fp.nationality) data.nationalityEn = fp.nationality;

      await prisma.player.update({ where: { id: dbPlayer.id }, data });
      updated++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.log(`    error on player ${dbPlayer.id}: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`  mapped: ${mapped}, multi-match (skipped): ${multiMatch}, not-found: ${notFound}, updated: ${updated}, errors: ${errors}`);
}

// Match a player name to one of the DB players in a given team. Returns
// playerId or null. Uses the same word-bag matcher as enrichPlayers().
function pickPlayerByName(rawName, candidatesInTeam) {
  if (!rawName || candidatesInTeam.length === 0) return null;
  const pieces = (s) => normEn((s || '').replace(/\./g, ''))
    .split(/\s+/).filter((w) => w.length >= 2).sort();
  const target = pieces(rawName);
  if (target.length === 0) return null;
  const targetSet = new Set(target);
  const hits = candidatesInTeam.filter((p) => {
    const pn = pieces(p.nameEn);
    if (pn.length === 0) return false;
    return target.every((w) => pn.includes(w)) || pn.every((w) => targetSet.has(w));
  });
  // Last-name only fallback (Flashscore often shows "Levy R.")
  if (hits.length === 0 && target.length === 1) {
    const lastWordOnly = candidatesInTeam.filter((p) => {
      const pn = pieces(p.nameEn);
      return pn.length > 0 && pn[pn.length - 1] === target[0];
    });
    return lastWordOnly.length === 1 ? lastWordOnly[0].id : null;
  }
  return hits.length === 1 ? hits[0].id : null;
}

async function enrichLineups() {
  console.log('\n[lineups]');
  const { map: gameByKey } = await buildGameLookup();
  const fsMatches = await prisma.flashscoreScrapedMatch.findMany();

  let processed = 0, gamesWithExisting = 0, inserted = 0, unlinkedRows = 0, errors = 0;

  for (const fs of fsMatches) {
    const lineups = fs.payload?.lineups;
    if (!lineups || !lineups.home || !lineups.away) continue;
    const game = findGameForFsMatch(fs, gameByKey);
    if (!game) continue;
    processed++;

    // Skip games that already have lineup entries from API-Football.
    const existing = await prisma.gameLineupEntry.count({ where: { gameId: game.id } });
    if (existing > 0) { gamesWithExisting++; continue; }
    if (!APPLY) continue;

    const homePlayers = await prisma.player.findMany({ where: { teamId: game.homeTeamId } });
    const awayPlayers = await prisma.player.findMany({ where: { teamId: game.awayTeamId } });

    const rowsToInsert = [];
    for (const [side, teamId, candidates] of [
      ['home', game.homeTeamId, homePlayers],
      ['away', game.awayTeamId, awayPlayers],
    ]) {
      const sideObj = lineups[side];
      for (const entry of (sideObj.starters || [])) {
        rowsToInsert.push({
          gameId: game.id,
          teamId,
          playerId: pickPlayerByName(entry.name, candidates),
          role: 'STARTER',
          jerseyNumber: entry.jersey ?? null,
          participantName: entry.name || null,
          formation: sideObj.formation || null,
        });
      }
      for (const entry of (sideObj.subs || [])) {
        rowsToInsert.push({
          gameId: game.id,
          teamId,
          playerId: pickPlayerByName(entry.name, candidates),
          role: 'SUBSTITUTE',
          jerseyNumber: entry.jersey ?? null,
          participantName: entry.name || null,
          formation: sideObj.formation || null,
        });
      }
    }

    try {
      for (const r of rowsToInsert) {
        await prisma.gameLineupEntry.create({ data: r });
        inserted++;
        if (r.playerId == null) unlinkedRows++;
      }
    } catch (e) {
      errors++;
      if (errors <= 3) console.log(`    error on game ${game.id}: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`  matches processed: ${processed}, games already-had-lineup: ${gamesWithExisting}, rows inserted: ${inserted} (unlinked players: ${unlinkedRows}), errors: ${errors}`);
}

// Parse a Flashscore event text line into a structured event.
// Returns null when the line doesn't match a clear, conservative pattern.
// Score-progression context is passed in via {homeScore, awayScore} (mutated).
function parseEvent(text, ctx) {
  const minuteMatch = text.match(/^(\d+)'/);
  if (!minuteMatch) return null;
  const minute = parseInt(minuteMatch[1], 10);

  // Goal: "8' 0 - 1 Levy R. (Kangwa K.)" or "(Own goal)" or "(Penalty)"
  const goal = text.match(/^\d+'\s+(\d+)\s*-\s*(\d+)\s+(.+?)(?:\s+\((.+)\))?\s*$/);
  if (goal) {
    const newHome = parseInt(goal[1], 10);
    const newAway = parseInt(goal[2], 10);
    const player = goal[3].trim();
    const parens = goal[4] || '';
    const side = newHome > ctx.homeScore ? 'home' : (newAway > ctx.awayScore ? 'away' : null);
    ctx.homeScore = newHome; ctx.awayScore = newAway;
    let type = 'GOAL';
    let assist = null;
    if (/own goal/i.test(parens)) type = 'OWN_GOAL';
    else if (/penalty/i.test(parens)) type = 'PENALTY_GOAL';
    else if (parens.trim()) assist = parens.trim();
    return { minute, type, side, player, assist };
  }

  // Substitution: "46' Mazal S. Koszta M." — two names, no parens, no score
  // Be conservative: require exactly two name-like tokens.
  const sub = text.match(/^\d+'\s+([A-Z][^()]+?)\s+([A-Z][^()]+)$/);
  if (sub && !/\d+\s*-\s*\d+/.test(text)) {
    return {
      minute,
      type: 'SUBSTITUTION_IN',
      side: null,
      player: sub[2].trim(), // incoming
      relatedPlayer: sub[1].trim(), // outgoing
    };
  }

  // Everything else (single name + "(Foul)" / "(Delay of game)") — ambiguous,
  // skip until admin enters manually.
  return null;
}

async function enrichEvents() {
  console.log('\n[events]');
  const { map: gameByKey } = await buildGameLookup();
  const fsMatches = await prisma.flashscoreScrapedMatch.findMany();

  let processed = 0, gamesWithExisting = 0, parsed = 0, inserted = 0, unlinked = 0, errors = 0;

  for (const fs of fsMatches) {
    const events = fs.payload?.events;
    if (!Array.isArray(events) || events.length === 0) continue;
    const game = findGameForFsMatch(fs, gameByKey);
    if (!game) continue;
    processed++;

    const existing = await prisma.gameEvent.count({ where: { gameId: game.id } });
    if (existing > 0) { gamesWithExisting++; continue; }
    if (!APPLY) continue;

    const homePlayers = await prisma.player.findMany({ where: { teamId: game.homeTeamId } });
    const awayPlayers = await prisma.player.findMany({ where: { teamId: game.awayTeamId } });
    const ctx = { homeScore: 0, awayScore: 0 };
    let sortOrder = 0;

    for (const ev of events) {
      const parsed_ev = parseEvent(ev.text || '', ctx);
      if (!parsed_ev) continue;
      parsed++;
      const teamId = parsed_ev.side === 'home' ? game.homeTeamId : (parsed_ev.side === 'away' ? game.awayTeamId : null);
      const candidates = parsed_ev.side === 'home' ? homePlayers : (parsed_ev.side === 'away' ? awayPlayers : [...homePlayers, ...awayPlayers]);
      const playerId = pickPlayerByName(parsed_ev.player, candidates);
      const relatedPlayerId = parsed_ev.relatedPlayer ? pickPlayerByName(parsed_ev.relatedPlayer, candidates) : null;
      if (playerId == null) unlinked++;
      try {
        await prisma.gameEvent.create({
          data: {
            gameId: game.id,
            teamId,
            team: parsed_ev.side || 'unknown',
            type: parsed_ev.type,
            minute: parsed_ev.minute,
            playerId,
            participantName: parsed_ev.player,
            relatedPlayerId,
            relatedParticipantName: parsed_ev.relatedPlayer || null,
            sortOrder: sortOrder++,
            notesEn: 'flashscore',
          },
        });
        inserted++;
        // If this was a sub, also insert the OUT event for the related player.
        if (parsed_ev.type === 'SUBSTITUTION_IN' && parsed_ev.relatedPlayer) {
          await prisma.gameEvent.create({
            data: {
              gameId: game.id,
              teamId,
              team: parsed_ev.side || 'unknown',
              type: 'SUBSTITUTION_OUT',
              minute: parsed_ev.minute,
              playerId: relatedPlayerId,
              participantName: parsed_ev.relatedPlayer,
              sortOrder: sortOrder++,
              notesEn: 'flashscore',
            },
          });
          inserted++;
          if (relatedPlayerId == null) unlinked++;
        }
      } catch (e) {
        errors++;
        if (errors <= 3) console.log(`    error on game ${game.id}: ${e.message.slice(0, 100)}`);
      }
    }
  }

  console.log(`  matches processed: ${processed}, games already-had-events: ${gamesWithExisting}, events parsed: ${parsed}, inserted: ${inserted} (unlinked: ${unlinked}), errors: ${errors}`);
}

async function main() {
  console.log(`${APPLY ? '✓ APPLYING' : '[DRY RUN]'} Flashscore enrichment`);
  if (!SKIP_MATCHES) await enrichMatches();
  if (!process.argv.includes('--skip-lineups')) await enrichLineups();
  if (!process.argv.includes('--skip-events')) await enrichEvents();
  if (!SKIP_PLAYERS) await enrichPlayers();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
