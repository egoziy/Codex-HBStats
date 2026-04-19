'use strict';
/**
 * RSSSF Israeli Football Historical Data Scraper
 * Source: https://www.rsssf.org/tablesi/
 *
 * Scrapes pre-2000 data into ScrapedStanding, ScrapedLeaderboard, ScrapedMatch, ScrapedMatchEvent.
 * All team/player names are stored in English (as published by RSSSF).
 *
 * Three match page formats:
 *   A) ≤ 1990: No round-by-round league data; only standings + cup summaries
 *   B) 1991–1997: Plain text inside <pre>: "Home - Away  N-N"
 *   C) 1997–2000: HTML-formatted: <H3>Round N</H3><PRE><B>Home - Away N-N</B><Small>scorers</Small></PRE>
 *
 * Modes:
 *   standings   — League tables (1949/50–1999/00) from israhist.html
 *   topscorers  — Top scorers by season from isratops.html
 *   matches     — Round-by-round results from individual season pages (isra50.html–isra00.html)
 *   cups        — State Cup finals from isracuphist.html
 *   all         — All of the above
 *
 * Usage:
 *   node scripts/scrape-rsssf.js --mode all
 *   node scripts/scrape-rsssf.js --mode standings
 *   node scripts/scrape-rsssf.js --mode matches --from 91 --to 99
 *   node scripts/scrape-rsssf.js --mode all --dry-run
 */

const { execSync } = require('child_process');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SOURCE = 'rsssf';
const BASE = 'https://www.rsssf.org/tablesi';
const UA = 'Mozilla/5.0 (compatible; HBStats-Scraper/1.0)';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const MODE    = getArg('mode') || 'all';
const FROM_YY = parseInt(getArg('from') || '50', 10);   // 2-digit end-year (50 = 1949/50)
const TO_YY   = parseInt(getArg('to')   || '26', 10);   // 26 = 2025/26 (isra26.html); use 0 for 1999/2000
const DRY_RUN = args.includes('--dry-run');
const DELAY   = parseInt(getArg('delay') || '1000', 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── HTTP ──────────────────────────────────────────────────────────────────────
function curlGet(url) {
  try {
    const cmd = `curl -sL --max-time 30 -A "${UA}" "${url}"`;
    return execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 35000 }).toString('utf-8');
  } catch { return null; }
}

// ── Season helpers ────────────────────────────────────────────────────────────
// '1949/50' → '1949/1950'   '1999/00' → '1999/2000'
function normalizeSeason(raw) {
  const m = String(raw).trim().match(/^(\d{4})\/(\d{2})$/);
  if (!m) return raw;
  return `${m[1]}/${parseInt(m[1]) + 1}`;
}

function seasonStartYear(s) {
  const m = String(s).match(/^(\d{4})\//);
  return m ? parseInt(m[1]) : 0;
}

// 2-digit suffix → startYear, endYear, season string
function suffixInfo(yy) {
  const n = parseInt(yy, 10);
  const endYear  = n === 0 ? 2000 : (n < 30 ? 2000 + n : 1900 + n);
  const startYear = endYear - 1;
  return { startYear, endYear, season: `${startYear}/${endYear}` };
}

// Build ordered list of 2-digit suffixes to scrape
// Range covers 1949/50 (suffix 50) through 2025/26 (suffix 26).
// Special: suffix 00 = 1999/2000; suffixes 01-29 = 2000/01-2028/29; 50-99 = 1949/50-1998/99.
function buildSuffixList(fromYY, toYY) {
  const list = [];

  // Phase 1: fromYY..99 (e.g. 50..99 for 1949/50..1998/99)
  const phase1End = (fromYY >= 50 || toYY > fromYY) ? 99 : toYY;
  for (let y = fromYY; y <= Math.min(phase1End, 99); y++) {
    list.push(String(y).padStart(2, '0'));
  }

  // Phase 2: 00..toYY for 1999/2000..2028/29 (only when toYY is 0..29 range)
  if (toYY <= 29 || toYY === 0) {
    const phase2End = toYY === 0 ? 0 : toYY;
    for (let y = 0; y <= phase2End; y++) {
      list.push(String(y).padStart(2, '0'));
    }
  }

  return list;
}

// ── Unique match ID ───────────────────────────────────────────────────────────
function makeMatchId(season, round, home, away) {
  const s = season.replace('/', '-');
  const h = home.replace(/\W+/g, '_').slice(0, 18);
  const a = away.replace(/\W+/g, '_').slice(0, 18);
  return `${s}|R${String(round).padStart(2, '0')}|${h}|${a}`;
}

// ── Score line parser ─────────────────────────────────────────────────────────
// Parses "Home Team - Away Team  N-N  [optional date/note]"
// Returns { home, away, homeScore, awayScore } or null
function parseMatchLine(text) {
  if (!text) return null;
  // Strip date annotations like [21/8/98] and footnotes [*1]
  const clean = text
    .replace(/\s*\[\*\d+\]\s*/g, '')
    .replace(/\s*\[[\d\/]+\]\s*$/, '')
    .trim();

  // Score must be at the end: digits-digits
  const scoreM = clean.match(/(\d+)-(\d+)\s*$/);
  if (!scoreM) return null;

  const homeScore = parseInt(scoreM[1]);
  const awayScore = parseInt(scoreM[2]);
  const teamsStr  = clean.slice(0, clean.length - scoreM[0].length).trim();

  // Find " - " separator (space-dash-space); not possible in any Israeli team name
  const dashIdx = teamsStr.indexOf(' - ');
  if (dashIdx < 0) return null;

  const home = teamsStr.slice(0, dashIdx).trim();
  const away = teamsStr.slice(dashIdx + 3).trim();

  if (home.length < 3 || away.length < 3) return null;
  return { home, away, homeScore, awayScore };
}

function buildMatch(season, round, info, league = 'ליגת העל') {
  return {
    source:       SOURCE,
    sourceId:     makeMatchId(season, round, info.home, info.away),
    season,
    leagueNameHe: league,
    round:        `Round ${round}`,
    homeTeamName: info.home,
    awayTeamName: info.away,
    homeScore:    info.homeScore,
    awayScore:    info.awayScore,
    status:       'completed',
    framework:    'league',
    scrapedAt:    new Date(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE: standings — parse israhist.html
// ═══════════════════════════════════════════════════════════════════════════════
async function scrapeStandings() {
  console.log('\n📊 Standings — fetching israhist.html …');
  const html = curlGet(`${BASE}/israhist.html`);
  if (!html) { console.error('  ❌ Failed to fetch'); return; }

  const $ = cheerio.load(html);
  const rows = [];
  $('pre, PRE').each((_, el) => extractStandingRows($(el).text(), rows));

  const seasons = [...new Set(rows.map(r => r.season))].sort();
  console.log(`  Parsed ${rows.length} rows across ${seasons.length} seasons (${seasons[0]} → ${seasons[seasons.length - 1]})`);

  if (DRY_RUN) { console.log('  [dry-run] skipping DB'); return; }

  let ok = 0, err = 0;
  for (const row of rows) {
    try {
      await prisma.scrapedStanding.upsert({
        where: {
          source_season_leagueNameHe_position: {
            source:       row.source,
            season:       row.season,
            leagueNameHe: row.leagueNameHe,
            position:     row.position,
          },
        },
        create: row,
        update: { ...row, scrapedAt: new Date() },
      });
      ok++;
    } catch { err++; }
  }
  console.log(`  ✅ ${ok} upserted, ${err} errors`);
}

function extractStandingRows(text, results) {
  const lines = text.split('\n');
  let season = null;

  for (const line of lines) {
    // Season header: "Israeli League 1949/50", "Liga Leumit 1999/00", "League A 1953/54"
    const hdr = line.match(
      /^\s*(Israeli\s+League|Liga\s+Leumit|League\s+[A-Z]|National\s+League|Premier\s+League|First\s+Level)\s+(\d{4}\/\d{2})\s*$/i
    );
    if (hdr) { season = normalizeSeason(hdr[2]); continue; }

    if (!season) continue;

    // Team row: "  1. Maccabi Tel-Aviv   24  21   1   2  103-18  +85   43  champions"
    // Goal diff may be padded: "+ 4" or "- 6" (single-digit with space after sign)
    const m = line.match(
      /^\s*(\d{1,2})\.\s+(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)-(\d+)\s+[+\-]?\s*\d+\s+(\d+)/
    );
    if (m) {
      const gf = parseInt(m[7]), ga = parseInt(m[8]);
      results.push({
        source:         SOURCE,
        season,
        leagueNameHe:   'ליגת העל',
        position:       parseInt(m[1]),
        teamNameHe:     m[2].trim(),
        played:         parseInt(m[3]),
        wins:           parseInt(m[4]),
        draws:          parseInt(m[5]),
        losses:         parseInt(m[6]),
        goalsFor:       gf,
        goalsAgainst:   ga,
        goalDifference: gf - ga,
        points:         parseInt(m[9]),
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE: topscorers — parse isratops.html
// ═══════════════════════════════════════════════════════════════════════════════
async function scrapeTopScorers() {
  console.log('\n⚽ Top Scorers — fetching isratops.html …');
  const html = curlGet(`${BASE}/isratops.html`);
  if (!html) { console.error('  ❌ Failed to fetch'); return; }

  const $ = cheerio.load(html);
  const rows = [];
  $('pre, PRE').each((_, el) => extractTopScorers($(el).text(), rows));

  console.log(`  Parsed ${rows.length} entries`);

  if (DRY_RUN) { console.log('  [dry-run] skipping DB'); return; }

  let ok = 0, err = 0;
  for (const row of rows) {
    try {
      await prisma.scrapedLeaderboard.upsert({
        where: {
          source_season_category_rank: {
            source: row.source, season: row.season, category: row.category, rank: row.rank,
          },
        },
        create: row,
        update: { ...row, scrapedAt: new Date() },
      });
      ok++;
    } catch { err++; }
  }
  console.log(`  ✅ ${ok} upserted, ${err} errors`);
}

function extractTopScorers(text, results) {
  const lines = text.split('\n');
  let lastSeason = null;
  const rankBySeason = {};

  for (const line of lines) {
    const yearStart = line.match(/^(\d{4}\/\d{2})\s+(.*)/);
    const isContinuation = !yearStart && lastSeason && /^\s{4,}\S/.test(line);

    let season = lastSeason;
    let rest   = null;

    if (yearStart) {
      season = normalizeSeason(yearStart[1]);
      lastSeason = season;
      rest = yearStart[2];
    } else if (isContinuation) {
      rest = line.trim();
    }

    if (!rest || !season) continue;
    lastSeason = season;

    // Strip trailing numbers (goals, rounds, avg) and extract player/team
    // rest: "Player Name  Team  Goals  [Rounds  Avg]"  OR  "Player (Team)  Goals"
    const numEnd = rest.match(/\s+(\d+)(?:\s+[\d.]+)?\s*$/);
    if (!numEnd) continue;
    const goals = parseInt(numEnd[1]);
    if (!goals || goals < 1) continue;

    const withoutNums = rest.slice(0, rest.lastIndexOf(numEnd[0])).trim();

    let playerName, teamName;
    const parenFmt = withoutNums.match(/^(.+?)\s+\((.+)\)\s*$/);
    if (parenFmt) {
      playerName = parenFmt[1].trim();
      teamName   = parenFmt[2].trim();
    } else {
      const parts = withoutNums.split(/\s{2,}/);
      playerName = parts.slice(0, -1).join(' ').trim() || withoutNums;
      teamName   = parts.length > 1 ? parts[parts.length - 1].trim() : '';
    }

    if (!playerName) continue;

    rankBySeason[season] = (rankBySeason[season] || 0) + 1;
    results.push({
      source:       SOURCE,
      season,
      leagueNameHe: 'ליגת העל',
      category:     'goals',
      rank:         rankBySeason[season],
      playerName,
      teamName,
      value:        goals,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE: matches — individual season pages isra##.html
// ═══════════════════════════════════════════════════════════════════════════════
async function scrapeMatches() {
  console.log('\n🏟  Matches — scraping season pages …');

  const suffixes = buildSuffixList(FROM_YY, TO_YY);
  console.log(`  Trying ${suffixes.length} pages: isra${suffixes[0]}.html … isra${suffixes[suffixes.length - 1]}.html`);

  let totalMatches = 0, totalEvents = 0;

  for (const suffix of suffixes) {
    const { season } = suffixInfo(suffix);

    const url = `${BASE}/isra${suffix}.html`;
    const html = curlGet(url);

    if (!html || html.length < 800 || /<title>.*404/i.test(html) || /page not found/i.test(html)) {
      console.log(`  ⏭  ${season} — page not found`);
      continue;
    }

    const { matches, events } = parseSeasonPage(html, season);

    if (matches.length === 0) {
      console.log(`  ⚠️  ${season} — no league matches found (standings-only page)`);
      continue;
    }

    console.log(`  ✓  ${season}: ${matches.length} matches, ${events.length} goal events`);
    totalMatches += matches.length;
    totalEvents  += events.length;

    if (!DRY_RUN) {
      for (const match of matches) {
        try {
          const saved = await prisma.scrapedMatch.upsert({
            where: { source_sourceId: { source: match.source, sourceId: match.sourceId } },
            create: match,
            update: { ...match, scrapedAt: new Date() },
          });
          const matchEvents = events.filter(e => e.matchSourceId === match.sourceId);
          if (matchEvents.length > 0) {
            await prisma.scrapedMatchEvent.deleteMany({ where: { matchId: saved.id } });
            await prisma.scrapedMatchEvent.createMany({
              data: matchEvents.map(e => ({ ...e, matchId: saved.id })),
            });
          }
        } catch { /* skip duplicates */ }
      }
    }

    await sleep(DELAY);
  }

  console.log(`\n  ✅ Total: ${totalMatches} matches, ${totalEvents} goal events`);
}

// ── Top-level season page router ──────────────────────────────────────────────
function parseSeasonPage(html, season) {
  const $ = cheerio.load(html);

  // Format C (1997+): has <H3> round headers outside <PRE>
  const hasH3Rounds = $('h3, H3').toArray().some(el => /Round\s+\d+/i.test($(el).text()));
  if (hasH3Rounds) {
    return parseFormatC($, season);
  }

  // Format B (1991–1997): round headers as plain text within <pre>
  return parseFormatB($, season);
}

// ── Format C: HTML-formatted pages (isra98.html, isra99.html, isra00.html) ────
function parseFormatC($, season) {
  const matches = [];
  const events  = [];
  let currentRound = null;

  const els = $('h2,h3,h4,H2,H3,H4,pre,PRE').toArray();
  for (const el of els) {
    const tag  = el.tagName.toLowerCase();
    const text = $(el).text().trim();

    if (/^h[234]$/.test(tag)) {
      const rn = text.match(/Round\s+(\d+)/i);
      if (rn) currentRound = parseInt(rn[1]);
      continue;
    }

    if (tag === 'pre' && currentRound) {
      // Use innerHTML to find <B>...</B><Small>...</Small> pairs
      let rawHtml = $(el).html() || '';
      // Remove orphan </Small> at start (bleed from previous PRE block)
      rawHtml = rawHtml.replace(/^[\s\S]*?(?=<[Bb]>)/, '');

      const pairRe = /<[Bb]>([\s\S]*?)<\/[Bb]>[\s\S]*?<[Ss]mall>([\s\S]*?)<\/[Ss]mall>/g;
      let m;
      while ((m = pairRe.exec(rawHtml)) !== null) {
        const boldText  = m[1].replace(/<[^>]+>/g, '').trim();
        const smallText = m[2];

        const info = parseMatchLine(boldText);
        if (!info) continue;

        const match = buildMatch(season, currentRound, info);
        matches.push(match);
        parseGoalscorers(smallText, match, events);
      }
    }
  }

  return { matches, events };
}

// ── Format B: plain text in <pre> blocks (isra91.html–isra97.html) ────────────
function parseFormatB($, season) {
  const matches = [];

  $('pre, PRE').each((_, el) => {
    const text = $(el).text();
    const lines = text.split('\n');
    let currentRound = null;

    for (const line of lines) {
      // Round header: "Round 1 - 28/8/93" or "Round 1"
      const rn = line.match(/^\s*Round\s+(\d+)/i);
      if (rn) { currentRound = parseInt(rn[1]); continue; }

      if (!currentRound) continue;

      const info = parseMatchLine(line);
      if (info) {
        matches.push(buildMatch(season, currentRound, info));
      }
    }
  });

  // No scorer data in plain-text format
  return { matches, events: [] };
}

// ── Goalscorer parser (Format C) ──────────────────────────────────────────────
// Each <Small> block has two visual columns: home (left) and away (right).
// We detect which side a scorer belongs to by their horizontal position.
function parseGoalscorers(smallHtml, match, events) {
  // Strip remaining HTML tags, decode entities
  const text = smallHtml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;

    // Find all "Name (minutes)" tokens and their positions
    const tokenRe = /([A-Z][a-zé\-'A-Z ]+)\s+\(([^)]+)\)/g;
    let tm;
    while ((tm = tokenRe.exec(line)) !== null) {
      const pos  = tm.index;
      const name = tm[1].trim();
      const mins = tm[2];

      // Column threshold: ~38 chars. Right of threshold = away, left = home
      const side = (pos >= 38 || /^\s{20,}/.test(line.slice(0, pos))) ? 'away' : 'home';

      // Parse multiple minutes: "30, 56 pen" or "45 og"
      mins.split(',').forEach(part => {
        part = part.trim();
        const pm = part.match(/^(\d+)\s*([a-z.]*)/i);
        if (!pm) return;
        const minute = parseInt(pm[1]);
        const flag   = (pm[2] || '').toLowerCase().replace(/\./g, '');
        const type   = flag === 'og' ? 'own_goal' : flag === 'pen' ? 'penalty_goal' : 'goal';

        events.push({
          source:        SOURCE,
          matchSourceId: match.sourceId,
          matchId:       null,
          minute,
          type,
          playerName:    name,
          teamSide:      side,
          teamName:      side === 'home' ? match.homeTeamName : match.awayTeamName,
          scrapedAt:     new Date(),
        });
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE: cups — parse isracuphist.html
// ═══════════════════════════════════════════════════════════════════════════════
async function scrapeCups() {
  console.log('\n🏅 Cup Finals — fetching isracuphist.html …');
  const html = curlGet(`${BASE}/isracuphist.html`);
  if (!html) { console.error('  ❌ Failed to fetch'); return; }

  const $ = cheerio.load(html);
  const rows = [];
  $('pre, PRE').each((_, el) => extractCupFinals($(el).text(), rows));

  console.log(`  Parsed ${rows.length} cup final records`);

  if (DRY_RUN) { console.log('  [dry-run] skipping DB'); return; }

  let ok = 0, err = 0;
  for (const row of rows) {
    try {
      await prisma.scrapedMatch.upsert({
        where: { source_sourceId: { source: row.source, sourceId: row.sourceId } },
        create: row,
        update: { ...row, scrapedAt: new Date() },
      });
      ok++;
    } catch { err++; }
  }
  console.log(`  ✅ ${ok} upserted, ${err} errors`);
}

function extractCupFinals(text, results) {
  for (const line of text.split('\n')) {
    // "1948/49  Bnei Yehuda Tel-Aviv  1-0  Maccabi Tel-Aviv"
    // "1997/98  Beitar Jerusalem  1-1  Hapoel Tel-Aviv  (4-2 pen.)  [aet]"
    const m = line.match(
      /^(\d{4}\/\d{2})\s+(.+?)\s{2,}(\d+)-(\d+)(?:\s+\((\d+)-(\d+)\s*pen\.?\))?\s+(.+?)(?:\s+\[aet\])?(?:\s+\[\*\d+\])?\s*$/
    );
    if (!m) continue;

    const season = normalizeSeason(m[1]);
    const winner = m[2].trim();
    const loser  = m[7].replace(/\s*\[\S+\]\s*$/, '').trim();
    if (loser.length < 3) continue;

    const hScore = parseInt(m[3]);
    const aScore = parseInt(m[4]);
    const isAet  = /\[aet\]/i.test(line);
    const hPen   = m[5] ? parseInt(m[5]) : null;
    const aPen   = m[6] ? parseInt(m[6]) : null;

    results.push({
      source:            SOURCE,
      sourceId:          `cup|${m[1]}|final`,
      season,
      leagueNameHe:      'גביע המדינה',
      round:             'Final',
      homeTeamName:      winner,
      awayTeamName:      loser,
      homeScore:         hScore,
      awayScore:         aScore,
      homeScoreRegular:  isAet ? hScore : null,
      awayScoreRegular:  isAet ? aScore : null,
      homePenalty:       hPen,
      awayPenalty:       aPen,
      status:            'completed',
      framework:         'state_cup',
      scrapedAt:         new Date(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' RSSSF Israeli Football Scraper — Pre-2000 History ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Mode: ${MODE} | Dry-run: ${DRY_RUN}`);

  try {
    if (MODE === 'standings'  || MODE === 'all') await scrapeStandings();
    if (MODE === 'topscorers' || MODE === 'all') await scrapeTopScorers();
    if (MODE === 'matches'    || MODE === 'all') await scrapeMatches();
    if (MODE === 'cups'       || MODE === 'all') await scrapeCups();

    if (!DRY_RUN) {
      const [st, lb, ma] = await Promise.all([
        prisma.scrapedStanding.count({ where: { source: SOURCE } }),
        prisma.scrapedLeaderboard.count({ where: { source: SOURCE } }),
        prisma.scrapedMatch.count({ where: { source: SOURCE } }),
      ]);
      console.log('\n────────────────────────────────────────────');
      console.log(` DB totals (source=rsssf):`);
      console.log(`   Standings:    ${st}`);
      console.log(`   Leaderboards: ${lb}`);
      console.log(`   Matches:      ${ma}`);
      console.log('────────────────────────────────────────────');
    }
    console.log('✅ Done!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
