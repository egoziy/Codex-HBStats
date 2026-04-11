/**
 * IFA Full Data Scraper (football.org.il)
 * HTTP-based — no Puppeteer needed.
 *
 * Modes:
 *   standings  — League standings + team IDs
 *   games      — Discover game IDs from team pages
 *   details    — Game details: lineups, events, referees, scores
 *   stats      — Player statistics per team/season (AJAX endpoint)
 *   players    — Player details: photo, birth date, nationality
 *   all        — Everything in order
 *
 * Usage:
 *   node scripts/scrape-ifa-full.js --mode standings --league 40 --from 8 --to 27
 *   node scripts/scrape-ifa-full.js --mode all --season 14 --league 40
 *   node scripts/scrape-ifa-full.js --mode details --season 14 --league 40
 *   node scripts/scrape-ifa-full.js --mode stats --season 14 --league 40
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
const MODE = getArg('mode') || 'all';
const LEAGUE = getArg('league') || '40';
const SEASON = getArg('season') || null;
const FROM = parseInt(getArg('from') || '8', 10);
const TO = parseInt(getArg('to') || '27', 10);
const DELAY = parseInt(getArg('delay') || '500', 10);

// ── Season mapping ────────────────────────────────────
// season_id N → start year = 1998 + N
function seasonLabel(sid) {
  const y = 1998 + sid;
  return `${y}/${y + 1}`;
}

function leagueName(lid) {
  return lid === '45' ? 'ליגה לאומית' : 'ליגת העל';
}

function seasonIds() {
  if (SEASON) return [parseInt(SEASON, 10)];
  return Array.from({ length: TO - FROM + 1 }, (_, i) => TO - i);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strip common sr-only label leakage from team/player names
function cleanName(str) {
  return str.replace(/^(קבוצה|שם השחקן|שם הקבוצה|מיקום|תאריך|משחק|מגרש|שעה|תוצאה)\s*/g, '').trim();
}

// ── HTTP helpers (curl-based to bypass Cloudflare TLS fingerprinting) ──
function curlGet(url) {
  const escaped = url.replace(/"/g, '\\"');
  const cmd = `curl -s --max-time 20 -H "User-Agent: ${UA}" -H "Accept-Language: he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7" "${escaped}"`;
  return execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }).toString('utf-8');
}

function curlPost(url, body, contentType) {
  const escaped = url.replace(/"/g, '\\"');
  const bodyEscaped = body.replace(/"/g, '\\"');
  const cmd = `curl -s --max-time 20 -X POST -H "User-Agent: ${UA}" -H "Content-Type: ${contentType}" -H "X-Requested-With: XMLHttpRequest" -H "Accept-Language: he-IL,he;q=0.9" -d "${bodyEscaped}" "${escaped}"`;
  return execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }).toString('utf-8');
}

async function fetchPage(path) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const html = curlGet(url);
  if (!html || html.length < 100) throw new Error('Empty response');
  return cheerio.load(html);
}

function unescapeHtml(str) {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

async function fetchAjax(method, params) {
  const url = `${BASE}/Components.asmx/${method}`;

  // Try JSON POST (ASP.NET ScriptService pattern)
  try {
    const body = JSON.stringify(params);
    const data = curlPost(url, body, 'application/json; charset=utf-8');
    const parsed = JSON.parse(data);
    const d = parsed?.d || parsed;
    if (d?.HtmlData) return cheerio.load(d.HtmlData);
    if (typeof d === 'string' && d.includes('<')) return cheerio.load(d);
  } catch (e) { /* fall through to GET */ }

  // Fallback: GET with query params → XML response
  try {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const data = curlGet(`${url}?${qs}`);
    const m = data.match(/<HtmlData>([\s\S]*)<\/HtmlData>/);
    if (m) return cheerio.load(unescapeHtml(m[1]));
  } catch (e) { /* fall through */ }

  return null;
}

// ══════════════════════════════════════════════════════
// PHASE 1 — STANDINGS + TEAM IDs
// ══════════════════════════════════════════════════════
async function scrapeStandings(leagueId, sid) {
  const label = seasonLabel(sid);
  const league = leagueName(leagueId);
  console.log(`  [standings] ${label} ${league}`);

  // Try AJAX endpoint first
  let $ = await fetchAjax('LeagueTable', {
    league_id: leagueId, season_id: String(sid),
    box: '-1', round_id: '-1', componentTitle: '',
  });

  // Fallback: fetch full page and parse
  if (!$ || !$('a.table_row').length) {
    try {
      $ = await fetchPage(`/leagues/league/?league_id=${leagueId}&season_id=${sid}`);
    } catch (e) {
      console.log(`    → page fetch failed: ${e.message}`);
      return [];
    }
  }

  const teams = [];
  $('a.table_row.link_url').each((_, el) => {
    const $row = $(el);
    const href = $row.attr('href') || '';
    const teamIdMatch = href.match(/team_id=(\d+)/);
    if (!teamIdMatch) return;

    const cols = $row.find('.table_col');
    const pos = parseInt(cols.filter('.place').text().trim(), 10);
    const $nameCol = cols.filter('.team_name').clone(); $nameCol.find('.sr-only').remove();
    const name = cleanName($nameCol.text().trim());
    const goalsText = cols.filter('.goals-col').text().trim();

    // Parse remaining cols by position (after pos + name)
    const numCols = [];
    cols.each((i, c) => {
      if ($(c).hasClass('place') || $(c).hasClass('team_name') || $(c).hasClass('goals-col')) return;
      const $c = $(c).clone(); $c.find('.sr-only').remove();
      const t = $c.text().trim();
      const n = parseInt(t, 10);
      if (!isNaN(n)) numCols.push(n);
    });

    // Goals format: "against-for" (e.g., "30-78")
    let goalsFor = 0, goalsAgainst = 0;
    const gm = goalsText.match(/(\d+)\s*-\s*(\d+)/);
    if (gm) { goalsAgainst = +gm[1]; goalsFor = +gm[2]; }

    // numCols should be: played, wins, draws, losses, points
    const [played = 0, wins = 0, draws = 0, losses = 0, points = 0] = numCols;

    teams.push({
      pos: pos || teams.length + 1,
      name: name || 'Unknown',
      teamSourceId: teamIdMatch[1],
      played, wins, draws, losses,
      goalsFor, goalsAgainst, points,
    });
  });

  if (!teams.length) {
    console.log('    → no standings data found');
    return [];
  }

  console.log(`    → ${teams.length} teams found`);

  // Save to DB
  for (const t of teams) {
    // Upsert ScrapedTeam
    await prisma.scrapedTeam.upsert({
      where: { source_sourceId_season: { source: SOURCE, sourceId: t.teamSourceId, season: label } },
      update: { nameHe: t.name, leagueNameHe: league, scrapedAt: new Date() },
      create: { source: SOURCE, sourceId: t.teamSourceId, season: label, nameHe: t.name, leagueNameHe: league },
    });

    // Upsert ScrapedStanding
    await prisma.scrapedStanding.upsert({
      where: { source_season_leagueNameHe_position: { source: SOURCE, season: label, leagueNameHe: league, position: t.pos } },
      update: { teamNameHe: t.name, played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst, points: t.points, scrapedAt: new Date() },
      create: { source: SOURCE, season: label, leagueNameHe: league, position: t.pos, teamNameHe: t.name, played: t.played, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst, points: t.points },
    });
  }

  return teams;
}

// ══════════════════════════════════════════════════════
// PHASE 2 — DISCOVER GAME IDs VIA ASMX ROUND-BY-ROUND
// ══════════════════════════════════════════════════════
async function discoverGameIds(leagueId, sid) {
  const label = seasonLabel(sid);
  console.log(`  [games] Discovering game IDs for ${label}...`);

  // First, get box config from the league page (use both section data and select options)
  let boxes = [];
  try {
    const $ = await fetchPage(`/leagues/league/?league_id=${leagueId}&season_id=${sid}`);

    // Extract min/max round per box from the select options
    const boxRanges = {};
    $('#ddlBoxes option').each((_, el) => {
      const val = $(el).attr('value');
      const minR = $(el).attr('data-min-round');
      const maxR = $(el).attr('data-max-round');
      if (val && minR) boxRanges[val] = { minRound: +minR, maxRound: +maxR };
    });

    // Map section data-table-index to box select values
    // box=10 → select value 1 (savav 1) + 2 (savav 2)
    // box=30 → select value 5 (playoff elyon)
    // box=20 → select value 3 (playoff tachton)
    const boxSelectMap = { '10': ['1', '2'], '30': ['5'], '20': ['3'] };

    $('section.league-game-table, section[data-table-type="games"]').each((_, el) => {
      const idx = $(el).attr('data-table-index');
      const maxRound = $(el).attr('data-table-round');
      const title = $(el).attr('data-table-title') || '';
      if (!idx || !maxRound) return;

      // Determine min round from select options
      const selectKeys = boxSelectMap[idx] || [];
      let minRound = 999;
      for (const k of selectKeys) {
        if (boxRanges[k]) { minRound = Math.min(minRound, boxRanges[k].minRound); }
      }
      if (minRound === 999) minRound = 1;

      boxes.push({ box: idx, minRound, maxRound: +maxRound, title });
    });
  } catch (e) {
    console.log(`    → league page failed, using default boxes`);
  }

  // Fallback: common box structure
  if (!boxes.length) {
    boxes = [
      { box: '10', minRound: 1, maxRound: 26, title: 'רשימת משחקים' },
      { box: '30', minRound: 27, maxRound: 36, title: 'פלייאוף עליון' },
      { box: '20', minRound: 27, maxRound: 33, title: 'פלייאוף תחתון' },
    ];
  }

  const gameMap = new Map();

  for (const { box, minRound, maxRound, title } of boxes) {
    const startRound = minRound || 1;
    let emptyCount = 0;

    for (let round = startRound; round <= maxRound + 2; round++) {
      await sleep(DELAY / 2); // Shorter delay for API calls

      const $ = await fetchAjax('LeagueGamesList', {
        league_id: leagueId, season_id: String(sid),
        box, round_id: String(round), componentTitle: title,
      });

      if (!$ || !$('a[href*="game_id="]').length) {
        emptyCount++;
        if (emptyCount >= 3) break;
        continue;
      }
      emptyCount = 0;

      $('a[href*="game_id="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const gm = href.match(/game_id=(\d+)/);
        if (!gm) return;
        const gameId = gm[1];
        if (gameMap.has(gameId)) return;

        const dateText = $(el).find('.game-date').text().trim();
        const resultText = $(el).find('.result').text().trim();
        const venue = $(el).find('.table_col.align_content').eq(2).text().replace(/^\s*מגרש\s*/, '').trim();
        const teamNames = [];
        $(el).find('.team-name-text').each((_, tn) => {
          teamNames.push($(tn).text().replace(/&nbsp;/g, ' ').replace(/\s*-\s*$/, '').trim());
        });

        const homeTeamId = $(el).attr('data-team1') || '';
        const awayTeamId = $(el).attr('data-team2') || '';

        gameMap.set(gameId, { gameId, dateText, resultText, teamNames, venue, homeTeamId, awayTeamId, round: String(round) });
      });
    }

    if (gameMap.size) console.log(`    → ${title}: ${gameMap.size} games so far`);
  }

  console.log(`    → ${gameMap.size} unique games total`);

  // Save basic match records
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
      update: { homeTeamName: home, awayTeamName: away, homeScore, awayScore, venue: info.venue || undefined, round: info.round, scrapedAt: new Date() },
      create: {
        source: SOURCE, sourceId: gameId, season: label,
        homeTeamName: home, awayTeamName: away,
        homeScore, awayScore, round: info.round,
        dateStr: info.dateText, dateTime,
        venue: info.venue || null,
        status: homeScore !== null ? 'completed' : 'scheduled',
      },
    });
  }

  return [...gameMap.keys()];
}

// ══════════════════════════════════════════════════════
// PHASE 3 — GAME DETAILS (lineups, events, referees)
// ══════════════════════════════════════════════════════
async function scrapeGameDetails(gameId, sid) {
  let $;
  try {
    $ = await fetchPage(`/leagues/games/game/?season_id=${sid}&game_id=${gameId}`);
  } catch (e) {
    console.log(`    → game ${gameId} fetch failed: ${e.message}`);
    return;
  }

  // ── Score & metadata ──
  // Clone and remove sr-only elements to get clean score text
  const $total = $('#gTimeHolder .total').clone(); $total.find('.sr-only').remove();
  const $half = $('#gTimeHolder .result-half').clone(); $half.find('.sr-only').remove();
  const dateText = $('#gTimeHolder .date').text().trim();
  const totalText = $total.text().trim();
  const halfText = $half.text().trim();
  const venueText = $('#gTimeHolder a.place').text().trim();

  // Parse extra time / penalty scores from full holder text
  const holderText = $('#gTimeHolder').text().replace(/\s+/g, ' ');
  const etMatch = holderText.match(/הארכה\s*:\s*.*?(\d+)\s*:\s*.*?(\d+)/);
  let extraTimeHome = null, extraTimeAway = null;
  if (etMatch) { extraTimeHome = +etMatch[1]; extraTimeAway = +etMatch[2]; }
  const penMatch = holderText.match(/פנדלים\s*:\s*.*?(\d+)\s*:\s*.*?(\d+)/);
  let penaltyHome = null, penaltyAway = null;
  if (penMatch) { penaltyHome = +penMatch[1]; penaltyAway = +penMatch[2]; }

  let homeScore = null, awayScore = null;
  let homeScoreRegular = null, awayScoreRegular = null;
  const sm = totalText.match(/(\d+)\s*:\s*(\d+)/);
  if (sm) { homeScore = +sm[1]; awayScore = +sm[2]; }
  // Use extra time as final score if available, save regular time separately
  if (extraTimeHome !== null) {
    homeScoreRegular = homeScore;
    awayScoreRegular = awayScore;
    homeScore = extraTimeHome;
    awayScore = extraTimeAway;
  }

  let homeHalf = null, awayHalf = null;
  const hm = halfText.match(/(\d+)\s*:\s*(\d+)/);
  if (hm) { homeHalf = +hm[1]; awayHalf = +hm[2]; }

  let dateTime = null;
  const dm = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*(\d{2}):(\d{2})/);
  if (dm) dateTime = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T${dm[4]}:${dm[5]}:00`);

  // Teams
  const homeTeamName = $('.team-home a span').first().text().trim() || '';
  const awayTeamName = $('.team-guest a span').first().text().trim() || '';
  const homeTeamHref = $('.team-home a').first().attr('href') || '';
  const awayTeamHref = $('.team-guest a').first().attr('href') || '';

  // League + round from title
  const titleText = $('section.game-details .title h1').text().replace(/פרטי המשחק/g, '').trim();
  const roundMatch = titleText.match(/מחזור\s+(\d+)/);
  const round = roundMatch ? roundMatch[1] : null;
  // Framework detection from title
  let framework = 'league';
  if (titleText.includes('גביע המדינה')) framework = 'state_cup';
  else if (titleText.includes('טוטו') || titleText.includes('גביע הטוטו')) framework = 'toto_cup';

  // Coaches
  let coachHome = '', coachAway = '';
  const coachSections = [];
  let foundCoachTitle = false;
  $('.players-cont .title h2').each((_, el) => {
    if ($(el).text().includes('מאמן')) foundCoachTitle = true;
  });
  if (foundCoachTitle) {
    // Coach names are after the "מאמן" title
    $('a[href*="coach_id"] b.name, a[href*="coach_id"] .name b').each((i, el) => {
      if (i === 0) coachHome = $(el).text().trim();
      if (i === 1) coachAway = $(el).text().trim();
    });
  }

  // Referees — parse into separate roles
  const referees = [];
  const refParsed = { main: null, assist1: null, assist2: null, fourth: null, var1: null, var2: null };
  $('.judge a.player, .judge .player').each((_, el) => {
    const name = $(el).find('b.name').text().trim() || $(el).find('.name').text().trim();
    const role = $(el).find('.position').text().trim();
    if (!name) return;
    referees.push(`${name} (${role})`);
    if (role.includes('שופט ראשי') || role.includes('שופטת ראשית')) refParsed.main = name;
    else if (role.includes('עוזר שופט 1') || role.includes('עוזרת שופט 1')) refParsed.assist1 = name;
    else if (role.includes('עוזר שופט 2') || role.includes('עוזרת שופט 2')) refParsed.assist2 = name;
    else if (role.includes('רביעי') || role.includes('רביעית')) refParsed.fourth = name;
    else if (role.includes('רחבה 1') || role.includes('VAR')) refParsed.var1 = name;
    else if (role.includes('רחבה 2')) refParsed.var2 = name;
  });

  // Update ScrapedMatch
  const label = seasonLabel(sid);
  const refData = {
    referee: referees.join(', ') || undefined,
    refereeMain: refParsed.main || undefined,
    refereeAssist1: refParsed.assist1 || undefined,
    refereeAssist2: refParsed.assist2 || undefined,
    refereeFourth: refParsed.fourth || undefined,
    refereeVar1: refParsed.var1 || undefined,
    refereeVar2: refParsed.var2 || undefined,
  };
  const matchRecord = await prisma.scrapedMatch.upsert({
    where: { source_sourceId: { source: SOURCE, sourceId: gameId } },
    update: {
      homeTeamName: homeTeamName || undefined,
      awayTeamName: awayTeamName || undefined,
      homeScore, awayScore, homeScoreRegular: homeScoreRegular, awayScoreRegular: awayScoreRegular, homeHalfScore: homeHalf, awayHalfScore: awayHalf, homePenalty: penaltyHome, awayPenalty: penaltyAway,
      dateStr: dateText || undefined, dateTime: dateTime || undefined,
      venue: venueText || undefined,
      ...refData,
      round: round || undefined,
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
      homeScore, awayScore, homeScoreRegular: homeScoreRegular, awayScoreRegular: awayScoreRegular, homeHalfScore: homeHalf, awayHalfScore: awayHalf, homePenalty: penaltyHome, awayPenalty: penaltyAway,
      dateStr: dateText, dateTime,
      venue: venueText,
      ...refData,
      round, framework,
      coachHome, coachAway,
      status: homeScore !== null ? 'completed' : 'scheduled',
    },
  });

  // ── Lineups ──
  const lineupEntries = [];

  function parseLineupSection(selector, teamSide, role) {
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

  parseLineupSection('.players-cont .home.Active', 'home', 'starter');
  parseLineupSection('.players-cont .guest.Active', 'away', 'starter');
  parseLineupSection('.players-cont .home.Replacement', 'home', 'sub');
  parseLineupSection('.players-cont .guest.Replacement', 'away', 'sub');
  parseLineupSection('.players-cont .home.Bench', 'home', 'bench');
  parseLineupSection('.players-cont .guest.Bench', 'away', 'bench');

  // Delete old lineups for this match and insert new
  await prisma.scrapedMatchLineup.deleteMany({ where: { source: SOURCE, matchSourceId: gameId } });
  for (const entry of lineupEntries) {
    try { await prisma.scrapedMatchLineup.create({ data: { ...entry, matchId: matchRecord.id } }); } catch (_) {}
  }

  // ── Events (from timeline) ──
  const events = [];
  $('#gameMoves .timeline .node').each((_, el) => {
    const $node = $(el);
    const classes = $node.attr('class') || '';
    if (classes.includes('number')) return; // Skip period markers (0, 45, 90)

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

    // Player name + number
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

  // Delete old events for this match and insert new
  await prisma.scrapedMatchEvent.deleteMany({ where: { source: SOURCE, matchSourceId: gameId } });
  for (const ev of events) {
    try { await prisma.scrapedMatchEvent.create({ data: { ...ev, matchId: matchRecord.id } }); } catch (_) {}
  }

  const lineupCount = lineupEntries.length;
  const eventCount = events.length;
  return { lineupCount, eventCount };
}

// ══════════════════════════════════════════════════════
// PHASE 4 — PLAYER STATISTICS (AJAX endpoint)
// ══════════════════════════════════════════════════════
async function scrapePlayerStats(teamSourceId, teamName, sid) {
  const label = seasonLabel(sid);

  // Try AJAX endpoint
  let $ = await fetchAjax('GetTeamPlayersStatisticsList', {
    teamId: teamSourceId, seasonId: String(sid), isFemale: 'False',
  });

  if (!$ || !$('a.table_row').length) {
    // Try form-encoded POST via curl
    try {
      const body = `team_id=${teamSourceId}&season_id=${sid}&language=-1&isFemale=false&orderBy=GamesCount&asc=false`;
      const data = curlPost(`${BASE}/Components.asmx/TeamPlayersStatistics`, body, 'application/x-www-form-urlencoded');
      const m = data.match(/<HtmlData>([\s\S]*)<\/HtmlData>/);
      if (m) $ = cheerio.load(unescapeHtml(m[1]));
      else {
        try { const p = JSON.parse(data); if (p?.d?.HtmlData) $ = cheerio.load(p.d.HtmlData); } catch (_) {}
      }
    } catch (e) { /* ignore */ }
  }

  if (!$ || !$('a.table_row').length) {
    console.log(`    → no player stats for team ${teamName}`);
    return 0;
  }

  // Get or create ScrapedTeam
  const scrapedTeam = await prisma.scrapedTeam.upsert({
    where: { source_sourceId_season: { source: SOURCE, sourceId: teamSourceId, season: label } },
    update: { scrapedAt: new Date() },
    create: { source: SOURCE, sourceId: teamSourceId, season: label, nameHe: teamName },
  });

  let count = 0;
  const rows = $('a.table_row.link_url').toArray();

  for (const el of rows) {
    const $row = $(el);
    const href = $row.attr('href') || '';
    const pidMatch = href.match(/player_id=(\d+)/);
    if (!pidMatch) continue;
    const playerSourceId = pidMatch[1];

    const cols = $row.find('.table_col');
    const values = [];
    cols.each((_, c) => {
      const text = $(c).clone().children('.sr-only').remove().end().text().trim();
      values.push(text);
    });

    // Columns: PlayerName, GamesCount, Goals, YellowCardsLeague, YellowCardsToto, RedCards, Opened, Substitute, OutOfGame, TotalMin
    const playerName = cleanName(values[0] || '');
    const appearances = parseInt(values[1], 10) || 0;
    const goals = parseInt(values[2], 10) || 0;
    const yellowCards = parseInt(values[3], 10) || 0;
    const yellowCardsToto = parseInt(values[4], 10) || 0;
    const redCards = parseInt(values[5], 10) || 0;
    const starts = parseInt(values[6], 10) || 0;
    const subsIn = parseInt(values[7], 10) || 0;
    const subsOut = parseInt(values[8], 10) || 0;
    const minutesPlayed = parseInt(values[9], 10) || 0;

    if (!playerName) continue;

    // Upsert ScrapedPlayer
    const player = await prisma.scrapedPlayer.upsert({
      where: { source_sourceId_teamId: { source: SOURCE, sourceId: playerSourceId, teamId: scrapedTeam.id } },
      update: { nameHe: playerName, scrapedAt: new Date() },
      create: { source: SOURCE, sourceId: playerSourceId, nameHe: playerName, teamId: scrapedTeam.id },
    });

    // Upsert ScrapedPlayerSeason
    await prisma.scrapedPlayerSeason.upsert({
      where: { source_season_playerId: { source: SOURCE, season: label, playerId: player.id } },
      update: { teamNameHe: teamName, appearances, goals, yellowCards, yellowCardsToto, redCards, starts, subsIn, subsOut, minutesPlayed, scrapedAt: new Date() },
      create: { source: SOURCE, season: label, playerId: player.id, teamNameHe: teamName, appearances, goals, yellowCards, yellowCardsToto, redCards, starts, subsIn, subsOut, minutesPlayed },
    });
    count++;
  }

  return count;
}

// ══════════════════════════════════════════════════════
// PHASE 5 — PLAYER DETAILS (birth date, nationality, photo)
// ══════════════════════════════════════════════════════
async function scrapePlayerDetails(playerSourceId, sid) {
  let $;
  try {
    $ = await fetchPage(`/players/player/?player_id=${playerSourceId}&season_id=${sid}`);
  } catch (e) {
    return null;
  }

  const name = $('h1.new-player-card_title').text().trim() || '';
  const photoSrc = $('figure.new-player-card_img-container img').attr('src') || '';
  const photoUrl = photoSrc && !photoSrc.includes('avatar_player') ? photoSrc : null;

  let birthDate = null, nationality = null;
  $('ul.new-player-card_data-list li').each((_, el) => {
    const label = $(el).find('strong').text().trim();
    const value = $(el).text().replace(label, '').trim();
    if (label.includes('תאריך לידה')) birthDate = value;
    if (label.includes('אזרחות')) nationality = value;
  });

  return { name, photoUrl, birthDate, nationality };
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════
async function main() {
  const modes = MODE === 'all' ? ['standings', 'games', 'details', 'stats', 'players'] : [MODE];
  const sids = seasonIds();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   IFA Full Scraper — football.org.il     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Mode: ${modes.join(' → ')} | League: ${LEAGUE} (${leagueName(LEAGUE)})`);
  console.log(`Seasons: ${sids.map(s => seasonLabel(s)).join(', ')}`);
  console.log(`Delay: ${DELAY}ms\n`);

  const totals = { standings: 0, games: 0, details: 0, stats: 0, players: 0 };

  for (const sid of sids) {
    const label = seasonLabel(sid);
    console.log(`\n━━━ ${label} ━━━`);

    let teams = [];

    // ── Standings ──
    if (modes.includes('standings') || modes.includes('games') || modes.includes('stats')) {
      // Need teams for games discovery and stats
      teams = await scrapeStandings(LEAGUE, sid);
      totals.standings += teams.length;
      await sleep(DELAY);
    }

    // If we need teams but didn't scrape standings, load from DB
    if (!teams.length && (modes.includes('games') || modes.includes('stats') || modes.includes('players'))) {
      const dbTeams = await prisma.scrapedTeam.findMany({
        where: { source: SOURCE, season: label, leagueNameHe: leagueName(LEAGUE) },
      });
      teams = dbTeams.map(t => ({ name: t.nameHe, teamSourceId: t.sourceId }));
      if (teams.length) console.log(`  [db] Loaded ${teams.length} teams from DB`);
    }

    // ── Game discovery ──
    let gameIds = [];
    if (modes.includes('games')) {
      gameIds = await discoverGameIds(LEAGUE, sid);
      totals.games += gameIds.length;
      await sleep(DELAY);
    }

    // If we need game details but didn't discover, load from DB
    if (modes.includes('details') && !gameIds.length) {
      const dbMatches = await prisma.scrapedMatch.findMany({
        where: { source: SOURCE, season: label },
        select: { sourceId: true },
      });
      gameIds = dbMatches.map(m => m.sourceId).filter(Boolean);
      if (gameIds.length) console.log(`  [db] Loaded ${gameIds.length} game IDs from DB`);
    }

    // ── Game details ──
    if (modes.includes('details') && gameIds.length) {
      console.log(`  [details] Scraping ${gameIds.length} games...`);
      let done = 0;
      for (const gid of gameIds) {
        await sleep(DELAY);
        const result = await scrapeGameDetails(gid, sid);
        done++;
        if (result) {
          totals.details++;
          if (done % 20 === 0 || done === gameIds.length) {
            console.log(`    → ${done}/${gameIds.length} (lineups: ${result.lineupCount}, events: ${result.eventCount})`);
          }
        }
      }
    }

    // ── Player stats ──
    if (modes.includes('stats') && teams.length) {
      console.log(`  [stats] Scraping player stats for ${teams.length} teams...`);
      for (const team of teams) {
        await sleep(DELAY);
        const count = await scrapePlayerStats(team.teamSourceId, team.name, sid);
        totals.stats += count;
        console.log(`    → ${team.name}: ${count} players`);
      }
    }

    // ── Player details ──
    if (modes.includes('players') && teams.length) {
      // Get all players for this season from DB
      const scrapedTeams = await prisma.scrapedTeam.findMany({
        where: { source: SOURCE, season: label },
        include: { players: { where: { source: SOURCE } } },
      });
      const allPlayers = scrapedTeams.flatMap(t => t.players);
      console.log(`  [players] Scraping details for ${allPlayers.length} players...`);

      let done = 0;
      for (const p of allPlayers) {
        // Skip if already has details
        if (p.birthDate || p.nationality) { done++; continue; }
        await sleep(DELAY);
        const details = await scrapePlayerDetails(p.sourceId, sid);
        done++;
        if (details) {
          await prisma.scrapedPlayer.update({
            where: { id: p.id },
            data: {
              photoUrl: details.photoUrl || p.photoUrl || undefined,
              birthDate: details.birthDate || undefined,
              nationality: details.nationality || undefined,
              scrapedAt: new Date(),
            },
          });
          totals.players++;
        }
        if (done % 50 === 0 || done === allPlayers.length) {
          console.log(`    → ${done}/${allPlayers.length}`);
        }
      }
    }
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              Summary                     ║');
  console.log('╚══════════════════════════════════════════╝');
  if (totals.standings) console.log(`  Standings: ${totals.standings} team rows`);
  if (totals.games) console.log(`  Games discovered: ${totals.games}`);
  if (totals.details) console.log(`  Game details scraped: ${totals.details}`);
  if (totals.stats) console.log(`  Player stats: ${totals.stats}`);
  if (totals.players) console.log(`  Player details: ${totals.players}`);

  const dbCounts = await Promise.all([
    prisma.scrapedStanding.count({ where: { source: SOURCE } }),
    prisma.scrapedMatch.count({ where: { source: SOURCE } }),
    prisma.scrapedPlayer.count({ where: { source: SOURCE } }),
    prisma.scrapedMatchEvent.count({ where: { source: SOURCE } }),
    prisma.scrapedMatchLineup.count({ where: { source: SOURCE } }),
  ]);
  console.log(`\n  DB totals (IFA): standings=${dbCounts[0]}, matches=${dbCounts[1]}, players=${dbCounts[2]}, events=${dbCounts[3]}, lineups=${dbCounts[4]}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  prisma.$disconnect();
  process.exit(1);
});
