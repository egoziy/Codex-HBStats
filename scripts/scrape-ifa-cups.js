/**
 * IFA Cups Scraper (football.org.il)
 * Scrapes State Cup (גביע המדינה) and Toto Cup (גביע הטוטו)
 *
 * Competitions:
 *   state_cup   — גביע המדינה (national_cup_id=618)
 *   toto_haal   — גביע הטוטו ליגת העל (league_id=625)
 *   toto_leumit — גביע הטוטו ליגה לאומית (league_id=630)
 *   all         — All cups
 *
 * Modes:
 *   games    — Discover game IDs from cup brackets
 *   details  — Game details: lineups, events, referees, scores
 *   all      — games + details
 *
 * Usage:
 *   node scripts/scrape-ifa-cups.js --cup state_cup --season 27
 *   node scripts/scrape-ifa-cups.js --cup all --from 8 --to 27
 *   node scripts/scrape-ifa-cups.js --cup toto_haal --mode details --season 27
 */

const { execSync } = require('child_process');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SOURCE = 'footballOrgIl';
const BASE = 'https://www.football.org.il';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── CLI args ──────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const CUP = getArg('cup') || 'all';
const MODE = getArg('mode') || 'all';
const SEASON = getArg('season') || null;
const FROM = parseInt(getArg('from') || '8', 10);
const TO = parseInt(getArg('to') || '27', 10);
const DELAY = parseInt(getArg('delay') || '350', 10);

// ── Cup definitions ──────────────────────────────────
const CUP_DEFS = {
  state_cup: {
    name: 'גביע המדינה',
    framework: 'state_cup',
    pageUrl: (sid) => `/national-cup/?national_cup_id=618&season_id=${sid}`,
    ajaxMethod: 'NatCupAllTables',
    ajaxParams: (sid, box, round) => ({ national_cup_id: '618', season_id: String(sid), box, round_id: String(round) }),
  },
  toto_haal: {
    name: 'גביע הטוטו ליגת העל',
    framework: 'toto_cup',
    pageUrl: (sid) => `/totocup/priemerleague/?league_id=625&season_id=${sid}`,
    ajaxMethod: 'TotoCup_AllTables',
    ajaxParams: (sid, box, round) => ({ league_id: '625', season_id: String(sid), box, round_id: String(round) }),
  },
  toto_leumit: {
    name: 'גביע הטוטו ליגה לאומית',
    framework: 'toto_cup',
    pageUrl: (sid) => `/totocup/priemerleague/?league_id=630&season_id=${sid}`,
    ajaxMethod: 'TotoCup_AllTables',
    ajaxParams: (sid, box, round) => ({ league_id: '630', season_id: String(sid), box, round_id: String(round) }),
  },
};

function seasonLabel(sid) {
  const y = 1998 + sid;
  return `${y}/${y + 1}`;
}

function seasonIds() {
  if (SEASON) return [parseInt(SEASON, 10)];
  return Array.from({ length: TO - FROM + 1 }, (_, i) => TO - i);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP helpers ──────────────────────────────────────
function curlGet(url) {
  const escaped = url.replace(/"/g, '\\"');
  const cmd = `curl -s --max-time 20 -H "User-Agent: ${UA}" -H "Accept-Language: he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7" "${escaped}"`;
  return execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }).toString('utf-8');
}

function unescapeHtml(str) {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function fetchPage(path) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const html = curlGet(url);
  if (!html || html.length < 100) throw new Error('Empty response');
  return cheerio.load(html);
}

function fetchAjax(method, params) {
  try {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const data = curlGet(`${BASE}/Components.asmx/${method}?${qs}`);
    const m = data.match(/<HtmlData>([\s\S]*)<\/HtmlData>/);
    if (m) return cheerio.load(unescapeHtml(m[1]));
  } catch (e) { /* fall through */ }
  return null;
}

function cleanName(str) {
  return str.replace(/^(קבוצה|שם השחקן|שם הקבוצה|מיקום|תאריך|משחק|מגרש|שעה|תוצאה)\s*/g, '').trim();
}

// ══════════════════════════════════════════════════════
// PHASE 1 — DISCOVER GAME IDs FROM CUP BRACKETS
// ══════════════════════════════════════════════════════
async function discoverCupGames(cupKey, sid) {
  const def = CUP_DEFS[cupKey];
  const label = seasonLabel(sid);
  console.log(`  [games] ${def.name} ${label}`);

  // Get box config from the cup page
  let boxes = [];
  try {
    const $ = fetchPage(def.pageUrl(sid));
    $('select option').each((_, el) => {
      const val = $(el).attr('value');
      const minR = $(el).attr('data-min-round');
      const maxR = $(el).attr('data-max-round');
      const text = $(el).text().trim();
      if (val && minR) boxes.push({ box: val, minRound: +minR, maxRound: +maxR, title: text });
    });
  } catch (e) {
    console.log(`    → page fetch failed: ${e.message}`);
    return [];
  }

  if (!boxes.length) {
    console.log('    → no box config found');
    return [];
  }

  console.log(`    → ${boxes.length} stages: ${boxes.map(b => b.title).join(', ')}`);

  const gameMap = new Map();

  for (const { box, minRound, maxRound, title } of boxes) {
    for (let round = minRound; round <= maxRound; round++) {
      await sleep(DELAY / 2);

      const $ = fetchAjax(def.ajaxMethod, def.ajaxParams(sid, box, round));
      if (!$ || !$('a[href*="game_id="]').length) continue;

      $('a[href*="game_id="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const gm = href.match(/game_id=(\d+)/);
        if (!gm) return;
        const gameId = gm[1];
        if (gameMap.has(gameId)) return;

        const $row = $(el);
        const $dateCols = $row.find('.game-date');
        const dateText = $dateCols.text().trim();
        const resultText = $row.find('.result').text().trim();
        const venue = '';
        const teamNames = [];
        $row.find('.team-name-text').each((_, tn) => {
          teamNames.push($(tn).text().replace(/&nbsp;/g, ' ').replace(/\s*-\s*$/, '').trim());
        });

        const homeTeamId = $row.attr('data-team1') || '';
        const awayTeamId = $row.attr('data-team2') || '';

        gameMap.set(gameId, {
          gameId, dateText, resultText, teamNames, venue,
          homeTeamId, awayTeamId,
          stage: title, round: String(round),
        });
      });
    }
  }

  console.log(`    → ${gameMap.size} games found`);

  // Save to DB
  for (const [gameId, info] of gameMap) {
    let dateTime = null;
    const dm = info.dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) dateTime = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T12:00:00`);

    let homeScore = null, awayScore = null;
    const rm = info.resultText.match(/(\d+)\s*-\s*(\d+)/);
    if (rm) { homeScore = +rm[1]; awayScore = +rm[2]; }

    const home = info.teamNames[0] || 'Unknown';
    const away = info.teamNames[1] || 'Unknown';

    await prisma.scrapedMatch.upsert({
      where: { source_sourceId: { source: SOURCE, sourceId: gameId } },
      update: {
        homeTeamName: home, awayTeamName: away,
        homeScore, awayScore,
        round: info.stage || info.round,
        framework: def.framework,
        leagueNameHe: def.name,
        scrapedAt: new Date(),
      },
      create: {
        source: SOURCE, sourceId: gameId, season: label,
        homeTeamName: home, awayTeamName: away,
        homeScore, awayScore, round: info.stage || info.round,
        dateStr: info.dateText, dateTime,
        framework: def.framework,
        leagueNameHe: def.name,
        status: homeScore !== null ? 'completed' : 'scheduled',
      },
    });
  }

  return [...gameMap.keys()];
}

// ══════════════════════════════════════════════════════
// PHASE 2 — GAME DETAILS (reuse from scrape-ifa-full.js)
// ══════════════════════════════════════════════════════
async function scrapeGameDetails(gameId, sid) {
  let $;
  try {
    $ = fetchPage(`/leagues/games/game/?season_id=${sid}&game_id=${gameId}`);
  } catch (e) {
    console.log(`    → game ${gameId} fetch failed: ${e.message}`);
    return;
  }

  // Score — check for extra time
  const $total = $('#gTimeHolder .total').clone(); $total.find('.sr-only').remove();
  const $half = $('#gTimeHolder .result-half').clone(); $half.find('.sr-only').remove();
  const dateText = $('#gTimeHolder .date').text().trim();
  const totalText = $total.text().trim();
  const halfText = $half.text().trim();
  const venueText = $('#gTimeHolder a.place').text().trim();

  // Parse extra time score from full holder text
  const holderText = $('#gTimeHolder').text().replace(/\s+/g, ' ');
  const etMatch = holderText.match(/הארכה\s*:\s*.*?(\d+)\s*:\s*.*?(\d+)/);
  let extraTimeHome = null, extraTimeAway = null;
  if (etMatch) { extraTimeHome = +etMatch[1]; extraTimeAway = +etMatch[2]; }

  // Parse penalty score
  const penMatch = holderText.match(/פנדלים\s*:\s*.*?(\d+)\s*:\s*.*?(\d+)/);
  let penaltyHome = null, penaltyAway = null;
  if (penMatch) { penaltyHome = +penMatch[1]; penaltyAway = +penMatch[2]; }

  let homeScore = null, awayScore = null;
  const sm = totalText.match(/(\d+)\s*:\s*(\d+)/);
  if (sm) { homeScore = +sm[1]; awayScore = +sm[2]; }

  let homeHalf = null, awayHalf = null;
  const hm = halfText.match(/(\d+)\s*:\s*(\d+)/);
  if (hm) { homeHalf = +hm[1]; awayHalf = +hm[2]; }

  let dateTime = null;
  const dm = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*(\d{2}):(\d{2})/);
  if (dm) dateTime = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T${dm[4]}:${dm[5]}:00`);

  const homeTeamName = $('.team-home a span').first().text().trim() || '';
  const awayTeamName = $('.team-guest a span').first().text().trim() || '';

  // Title — detect framework
  const titleText = $('section.game-details .title h1').text().replace(/פרטי המשחק/g, '').trim();
  let framework = 'league';
  if (titleText.includes('גביע המדינה')) framework = 'state_cup';
  else if (titleText.includes('טוטו') || titleText.includes('גביע הטוטו')) framework = 'toto_cup';

  // Coaches
  let coachHome = '', coachAway = '';
  $('a[href*="coach_id"] b.name, a[href*="coach_id"] .name b').each((i, el) => {
    if (i === 0) coachHome = $(el).text().trim();
    if (i === 1) coachAway = $(el).text().trim();
  });

  // Referees
  const refParsed = { main: null, assist1: null, assist2: null, fourth: null, var1: null, var2: null };
  const referees = [];
  $('.judge a.player, .judge .player').each((_, el) => {
    const name = $(el).find('b.name').text().trim() || $(el).find('.name').text().trim();
    const role = $(el).find('.position').text().trim();
    if (!name) return;
    referees.push(`${name} (${role})`);
    if (role.includes('ראשי') || role.includes('ראשית')) refParsed.main = name;
    else if (role.includes('עוזר שופט 1') || role.includes('עוזרת שופט 1')) refParsed.assist1 = name;
    else if (role.includes('עוזר שופט 2') || role.includes('עוזרת שופט 2')) refParsed.assist2 = name;
    else if (role.includes('רביעי') || role.includes('רביעית')) refParsed.fourth = name;
    else if (role.includes('רחבה 1') || role.includes('VAR')) refParsed.var1 = name;
    else if (role.includes('רחבה 2')) refParsed.var2 = name;
  });

  const label = seasonLabel(sid);
  const matchRecord = await prisma.scrapedMatch.upsert({
    where: { source_sourceId: { source: SOURCE, sourceId: gameId } },
    update: {
      homeTeamName: homeTeamName || undefined,
      awayTeamName: awayTeamName || undefined,
      // If extra time exists, use it as final score; regular time stays in homeScore/awayScore
      homeScore: extraTimeHome ?? homeScore,
      awayScore: extraTimeAway ?? awayScore,
      homeScoreRegular: extraTimeHome !== null ? homeScore : null,
      awayScoreRegular: extraTimeHome !== null ? awayScore : null,
      homeHalfScore: homeHalf, awayHalfScore: awayHalf,
      homePenalty: penaltyHome, awayPenalty: penaltyAway,
      dateStr: dateText || undefined, dateTime: dateTime || undefined,
      venue: venueText || undefined,
      referee: referees.join(', ') || undefined,
      refereeMain: refParsed.main || undefined,
      refereeAssist1: refParsed.assist1 || undefined,
      refereeAssist2: refParsed.assist2 || undefined,
      refereeFourth: refParsed.fourth || undefined,
      refereeVar1: refParsed.var1 || undefined,
      refereeVar2: refParsed.var2 || undefined,
      framework,
      coachHome: coachHome || undefined,
      coachAway: coachAway || undefined,
      status: homeScore !== null ? 'completed' : 'scheduled',
      scrapedAt: new Date(),
    },
    create: {
      source: SOURCE, sourceId: gameId, season: label,
      homeTeamName: homeTeamName || 'Unknown',
      awayTeamName: awayTeamName || 'Unknown',
      homeScore: extraTimeHome ?? homeScore,
      awayScore: extraTimeAway ?? awayScore,
      homeScoreRegular: extraTimeHome !== null ? homeScore : null,
      awayScoreRegular: extraTimeHome !== null ? awayScore : null,
      homeHalfScore: homeHalf, awayHalfScore: awayHalf,
      homePenalty: penaltyHome, awayPenalty: penaltyAway,
      dateStr: dateText, dateTime,
      venue: venueText,
      referee: referees.join(', '),
      refereeMain: refParsed.main, refereeAssist1: refParsed.assist1,
      refereeAssist2: refParsed.assist2, refereeFourth: refParsed.fourth,
      refereeVar1: refParsed.var1, refereeVar2: refParsed.var2,
      framework, coachHome, coachAway,
      status: homeScore !== null ? 'completed' : 'scheduled',
    },
  });

  // Lineups
  const lineupEntries = [];
  function parseLineup(selector, teamSide, role) {
    $(selector).find('a[href*="player_id"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const pidMatch = href.match(/player_id=(\d+)/);
      const nameText = $el.find('.player .name b').text().trim();
      const numText = $el.find('.player .number').text().trim();
      const numMatch = numText.match(/(\d+)/);
      const posText = $el.find('.player .name').text().replace(nameText, '').trim();
      let marker = null;
      if (posText.includes('GK')) marker = 'GK';
      else if (posText.includes('(C)')) marker = 'C';
      if (nameText) {
        lineupEntries.push({
          source: SOURCE, matchSourceId: gameId,
          teamSide, role, playerName: nameText,
          playerSourceId: pidMatch ? pidMatch[1] : null,
          playerNumber: numMatch ? +numMatch[1] : null,
          positionMarker: marker,
        });
      }
    });
  }

  parseLineup('.players-cont .home.Active', 'home', 'starter');
  parseLineup('.players-cont .guest.Active', 'away', 'starter');
  parseLineup('.players-cont .home.Replacement', 'home', 'sub');
  parseLineup('.players-cont .guest.Replacement', 'away', 'sub');
  parseLineup('.players-cont .home.Bench', 'home', 'bench');
  parseLineup('.players-cont .guest.Bench', 'away', 'bench');

  await prisma.scrapedMatchLineup.deleteMany({ where: { source: SOURCE, matchSourceId: gameId } });
  for (const entry of lineupEntries) {
    try { await prisma.scrapedMatchLineup.create({ data: { ...entry, matchId: matchRecord.id } }); } catch (_) {}
  }

  // Events
  const events = [];
  $('#gameMoves .timeline .node').each((_, el) => {
    const $node = $(el);
    const classes = $node.attr('class') || '';
    if (classes.includes('number')) return;

    const minuteText = $node.find('.minute div, .minute i div').first().text().trim();
    const minute = parseInt(minuteText, 10);
    if (isNaN(minute)) return;

    const teamSide = classes.includes('team1') ? 'home' : classes.includes('team2') ? 'away' : null;
    const teamName = $node.find('.team').text().trim();

    let type = 'unknown';
    if (classes.includes('goal') && !classes.includes('own-goal')) type = 'goal';
    if (classes.includes('own-goal')) type = 'own_goal';
    if (classes.includes('penalty')) type = 'penalty_goal';
    if (classes.includes('yellow')) type = 'yellow_card';
    if (classes.includes('red')) type = 'red_card';
    if (classes.includes('playerout') || classes.includes('change')) type = 'sub';

    function parsePlayer(selector) {
      const text = $node.find(selector).text().trim();
      const pm = text.match(/(.+?)\s*\((\d+)\)\s*$/);
      return { name: pm ? pm[1].trim() : text, number: pm ? +pm[2] : null };
    }

    if (type === 'sub') {
      const out = parsePlayer('.player.PlayerOut');
      const inn = parsePlayer('.player.PlayerIn');
      if (out.name) {
        events.push({
          source: SOURCE, matchSourceId: gameId, minute, type,
          playerName: out.name, playerNumber: out.number,
          secondPlayerName: inn.name || null, secondPlayerNumber: inn.number || null,
          teamSide, teamName,
        });
      }
    } else {
      const player = parsePlayer('.player');
      if (player.name) {
        events.push({
          source: SOURCE, matchSourceId: gameId, minute, type,
          playerName: player.name, playerNumber: player.number,
          teamSide, teamName,
        });
      }
    }
  });

  await prisma.scrapedMatchEvent.deleteMany({ where: { source: SOURCE, matchSourceId: gameId } });
  for (const ev of events) {
    try { await prisma.scrapedMatchEvent.create({ data: { ...ev, matchId: matchRecord.id } }); } catch (_) {}
  }

  return { lineups: lineupEntries.length, events: events.length };
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════
async function main() {
  const cupKeys = CUP === 'all' ? Object.keys(CUP_DEFS) : [CUP];
  const modes = MODE === 'all' ? ['games', 'details'] : [MODE];
  const sids = seasonIds();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   IFA Cups Scraper — football.org.il     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Cups: ${cupKeys.map(k => CUP_DEFS[k].name).join(', ')}`);
  console.log(`Mode: ${modes.join(' → ')}`);
  console.log(`Seasons: ${sids.map(s => seasonLabel(s)).join(', ')}`);
  console.log(`Delay: ${DELAY}ms\n`);

  const totals = { games: 0, details: 0 };

  for (const sid of sids) {
    const label = seasonLabel(sid);
    console.log(`\n━━━ ${label} ━━━`);

    for (const cupKey of cupKeys) {
      let gameIds = [];

      // Games discovery
      if (modes.includes('games')) {
        gameIds = await discoverCupGames(cupKey, sid);
        totals.games += gameIds.length;
        await sleep(DELAY);
      }

      // Load from DB if only doing details
      if (modes.includes('details') && !gameIds.length) {
        const def = CUP_DEFS[cupKey];
        const dbMatches = await prisma.scrapedMatch.findMany({
          where: { source: SOURCE, season: label, framework: def.framework, leagueNameHe: def.name },
          select: { sourceId: true },
        });
        gameIds = dbMatches.map(m => m.sourceId).filter(Boolean);
        if (gameIds.length) console.log(`  [db] Loaded ${gameIds.length} ${def.name} game IDs`);
      }

      // Game details
      if (modes.includes('details') && gameIds.length) {
        const def = CUP_DEFS[cupKey];
        console.log(`  [details] ${def.name}: ${gameIds.length} games...`);
        let done = 0;
        for (const gid of gameIds) {
          await sleep(DELAY);
          const result = await scrapeGameDetails(gid, sid);
          done++;
          if (result) {
            totals.details++;
            if (done % 20 === 0 || done === gameIds.length) {
              console.log(`    → ${done}/${gameIds.length} (lineups: ${result.lineups}, events: ${result.events})`);
            }
          }
        }
      }
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              Summary                     ║');
  console.log('╚══════════════════════════════════════════╝');
  if (totals.games) console.log(`  Games discovered: ${totals.games}`);
  if (totals.details) console.log(`  Game details scraped: ${totals.details}`);

  const cupMatches = await prisma.scrapedMatch.count({
    where: { source: SOURCE, framework: { in: ['state_cup', 'toto_cup'] } },
  });
  console.log(`\n  DB total cup matches (IFA): ${cupMatches}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  prisma.$disconnect();
  process.exit(1);
});
