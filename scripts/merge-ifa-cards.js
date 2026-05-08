/**
 * scripts/merge-ifa-cards.js
 *
 * Pulls yellow/red card events from scraped_match_events into the main game_events
 * table. Matches games by date + team-name; matches players by team + name match.
 *
 * Usage:
 *   node scripts/merge-ifa-cards.js              -- dry run
 *   node scripts/merge-ifa-cards.js --apply      -- write to DB
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Same abbreviation map as merge-engine.ts
const IFA_TEAM_ABBREVS = {
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
  'מכבי חיפה': ['מכבי חיפה'],
  'מכבי נתניה': ['מכבי נתניה'],
  'הפועל חיפה': ['הפועל חיפה'],
  'הפועל קטמון': ['הפועל קטמון ירושלים'],
  'הפועל באר שבע': ['הפועל באר שבע'],
  'הפועל י-ם': ['הפועל ירושלים', 'הפועל קטמון ירושלים', 'הפועל קטמון'],
  'עירוני דורות טבריה': ['עירוני טבריה', 'עירוני דורות טבריה'],
  'עירוני טבריה': ['עירוני טבריה', 'עירוני דורות טבריה'],
  'הפ\' חדרה': ['הפועל חדרה', 'הפועל חדרה ש. שוורץ'],
  'הפועל ר"ל': ['הפועל ראשון לציון', 'הפועל ראשל"צ'],
  'הפועל ראשל"צ': ['הפועל ראשון לציון'],
  'הפועל נצרת עילית': ['הפועל נוף הגליל'],
  'הפ\' נוף הגליל': ['הפועל נוף הגליל'],
  'הפועל ע. עפולה': ['הפועל עפולה'],
  'הפועל ע. עפולה / לא פעיל': ['הפועל עפולה'],
  'בית"ר ת"א חולון': ['בית"ר תל אביב'],
  'הפועל ע. אשקלון / לא פעיל': ['הפועל אשקלון'],
  'הפועל אשקלון': ['הפועל אשקלון'],
  'הפועל ניר רמה"ש': ['הפועל ניר רמת השרון'],
  'הפ\' בני לוד רכבת': ['הפועל בני לוד'],
  'מ.ס. כפר קאסם סוהיב': ['מ.ס. כפר קאסם'],
  'מכבי אחי נצרת': ['מכבי אחי נצרת'],
  'א.ס. אשדוד': ['א.ס. אשדוד'],
  'הכח מכבי עמידר ר"ג': ['הכח מכבי עמידר רמת גן'],
  'מכבי הרצליה דיוויד יחזקאל': ['מכבי הרצליה'],
  'מכבי  פ"ת': ['מכבי פתח תקווה'],
  'הפועל פ"ת': ['הפועל פתח תקווה'],
  'בני יהודה': ['בני יהודה תל אביב'],
};

function teamNameMatches(scrapedName, dbName) {
  if (!scrapedName || !dbName) return false;
  const a = scrapedName.trim();
  const b = dbName.trim();
  if (a === b) return true;
  if (IFA_TEAM_ABBREVS[a]?.includes(b)) return true;
  if (IFA_TEAM_ABBREVS[b]?.includes(a)) return true;
  // shared abbreviations (both map to overlapping canonical names)
  const aCanon = IFA_TEAM_ABBREVS[a] || [a];
  const bCanon = IFA_TEAM_ABBREVS[b] || [b];
  for (const x of aCanon) for (const y of bCanon) if (x === y) return true;
  // substring match either way
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  // last-word match for compound names like "מכבי בני ריינה" vs "מכבי ב"ר"
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  if (wa.length > 0 && wb.length > 0 && wa[0] === wb[0] && (wa[wa.length - 1] === wb[wb.length - 1])) return true;
  return false;
}

function nameMatches(a, b) {
  if (!a || !b) return false;
  const na = a.trim();
  const nb = b.trim();
  if (na === nb) return true;
  // last word match
  const wa = na.split(/\s+/);
  const wb = nb.split(/\s+/);
  if (wa.length > 1 && wb.length > 1 && wa[wa.length - 1] === wb[wb.length - 1] && wa[0][0] === wb[0][0]) return true;
  // reversed name (first/last swapped)
  if (na === wb.slice().reverse().join(' ')) return true;
  return false;
}

const TYPE_MAP = {
  yellow_card: 'YELLOW_CARD',
  red_card: 'RED_CARD',
  yellow_red_card: 'YELLOW_RED_CARD',
};

async function main() {
  // Index DB teams by season year, then by nameHe (for fast lookups)
  const dbTeamsByYear = new Map();
  const allDbTeams = await prisma.team.findMany({
    select: { id: true, nameHe: true, nameEn: true, seasonId: true, season: { select: { year: true } } },
  });
  for (const t of allDbTeams) {
    const y = t.season?.year;
    if (y == null) continue;
    if (!dbTeamsByYear.has(y)) dbTeamsByYear.set(y, []);
    dbTeamsByYear.get(y).push(t);
  }

  function findDbTeamForSeason(scrapedNameHe, year) {
    const candidates = dbTeamsByYear.get(year) || [];
    return candidates.find((c) => teamNameMatches(scrapedNameHe, c.nameHe))?.id || null;
  }

  // Index DB players by team
  const playersByTeam = new Map();
  const allDbPlayers = await prisma.player.findMany({
    select: { id: true, nameHe: true, nameEn: true, teamId: true },
  });
  for (const p of allDbPlayers) {
    if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, []);
    playersByTeam.get(p.teamId).push(p);
  }

  // Index DB games by day + home + away
  const dbGameByKey = new Map();
  const dbGames = await prisma.game.findMany({
    select: { id: true, dateTime: true, homeTeamId: true, awayTeamId: true, competitionId: true },
  });
  for (const g of dbGames) {
    if (!g.dateTime) continue;
    const dayKey = g.dateTime.toISOString().slice(0, 10);
    const k = `${dayKey}|${g.homeTeamId}|${g.awayTeamId}`;
    if (!dbGameByKey.has(k)) dbGameByKey.set(k, []);
    dbGameByKey.get(k).push(g.id);
  }

  // Walk all scraped matches with cards
  const scrapedMatches = await prisma.scrapedMatch.findMany({
    where: { source: 'footballOrgIl' },
    select: {
      id: true, dateTime: true,
      homeTeamName: true, awayTeamName: true,
      season: true,
    },
  });
  console.log(`Loaded ${scrapedMatches.length} scraped matches`);

  let matchedGames = 0;
  let cardsInserted = 0;
  let cardsSkipped = 0;
  let unmatchedPlayers = 0;
  let unmatchedGames = 0;
  let unmatchedTeams = 0;

  for (const sm of scrapedMatches) {
    if (!sm.dateTime) continue;
    const startYear = parseInt(sm.season.split('/')[0], 10);
    if (!startYear) continue;
    const dbHome = findDbTeamForSeason(sm.homeTeamName, startYear);
    const dbAway = findDbTeamForSeason(sm.awayTeamName, startYear);
    if (!dbHome || !dbAway) { unmatchedTeams++; continue; }

    const dayKey = sm.dateTime.toISOString().slice(0, 10);
    const candidates = dbGameByKey.get(`${dayKey}|${dbHome}|${dbAway}`) || [];
    if (!candidates.length) { unmatchedGames++; continue; }
    const dbGameId = candidates[0]; // pick first candidate (handles dups)
    matchedGames++;

    const events = await prisma.scrapedMatchEvent.findMany({
      where: { matchId: sm.id, type: { in: ['yellow_card', 'red_card', 'yellow_red_card'] } },
    });
    if (!events.length) continue;

    const existing = await prisma.gameEvent.count({
      where: { gameId: dbGameId, type: { in: ['YELLOW_CARD', 'RED_CARD', 'YELLOW_RED_CARD'] } },
    });
    if (existing > 0) { cardsSkipped += events.length; continue; }

    for (const ev of events) {
      const eventType = TYPE_MAP[ev.type];
      if (!eventType) continue;

      const teamId = ev.teamSide === 'home' ? dbHome : ev.teamSide === 'away' ? dbAway : null;
      let playerId = null;
      if (teamId) {
        const candidates = playersByTeam.get(teamId) || [];
        const match = candidates.find((p) => nameMatches(p.nameHe, ev.playerName) || nameMatches(p.nameEn, ev.playerName));
        if (match) playerId = match.id;
        else unmatchedPlayers++;
      }

      if (APPLY) {
        await prisma.gameEvent.create({
          data: {
            gameId: dbGameId,
            minute: ev.minute,
            type: eventType,
            team: ev.teamName || (ev.teamSide || ''),
            teamId,
            participantName: ev.playerName,
            playerId,
          },
        });
      }
      cardsInserted++;
    }
  }

  console.log('\n' + (APPLY ? '✓ Applied' : '[DRY RUN]'));
  console.log(`  matched games:                 ${matchedGames}`);
  console.log(`  cards inserted:                ${cardsInserted}`);
  console.log(`  cards skipped (already had):   ${cardsSkipped}`);
  console.log(`  scraped matches w/ no team match: ${unmatchedTeams}`);
  console.log(`  scraped matches w/ no game match: ${unmatchedGames}`);
  console.log(`  player names unmatched:        ${unmatchedPlayers}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); prisma.$disconnect(); process.exit(1); });
