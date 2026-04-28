import { EventType, FetchJobStatus, GameLineupRole, GameStatus, LineupParticipantType, ActivityEntityType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import {
  FOOTYSTATS_LEAGUE_LABELS,
  FOOTYSTATS_SEASON_IDS,
  FootyStatsLeague,
  FootyStatsRateLimitError,
  isFootyStatsRateLimitError,
  fsGetAllLeagueMatches,
  fsGetAllLeaguePlayers,
  fsGetLeagueReferees,
  fsGetLeagueSeason,
  fsGetLeagueTeams,
  fsGetMatchDetail,
  fsGoalTypeToEventNote,
  fsCardToEventType,
  fsUnixToDate,
  type FSMatch,
  type FSPlayer,
  type FSReferee,
  type FSTeam,
} from '@/lib/footystats';

// ── Types ─────────────────────────────────────────────────────────────────────

type FetchBody = {
  league?: FootyStatsLeague;         // legacy
  leagueKey?: string;                // any league key, including discovered ones
  seasonYear?: number;
  footyStatsSeasonId?: number;       // direct override — bypasses hardcoded map
  resources?: string[];
};

type JobStep = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  syncedCount?: number;
  fetchedCount?: number;
  note?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  teams: 'קבוצות',
  fixtures: 'משחקים',
  matchEvents: 'אירועי משחק + סטטיסטיקה',
  players: 'שחקנים',
  standings: 'טבלת ליגה',
  odds: 'יחסים',
  referees: 'שופטים',
};

// FootyStats only has real Israeli event data from the 2025 season onward
const EVENTS_AVAILABLE_FROM_YEAR = 2025;

// Name translations — English FootyStats names → Hebrew HBStats names
const FS_TEAM_NAME_HE: Record<string, string> = {
  "Hapoel Be'er Sheva FC": 'הפועל באר שבע',
  "Hapoel Beer Sheva FC": 'הפועל באר שבע',
  'Maccabi Tel Aviv FC': 'מכבי תל אביב',
  'Maccabi Haifa FC': 'מכבי חיפה',
  "Beitar Jerusalem FC": 'בית"ר ירושלים',
  'Hapoel Haifa FC': 'הפועל חיפה',
  'Maccabi Netanya FC': 'מכבי נתניה',
  'Bnei Sakhnin FC': 'בני סכנין',
  'Hapoel Jerusalem FC': 'הפועל ירושלים',
  'Maccabi Petah Tikva FC': 'מכבי פתח תקווה',
  'Hapoel Tel Aviv FC': 'הפועל תל אביב',
  'MS Ashdod FC': 'מ.ס. אשדוד',
  'Hapoel Hadera FC': 'הפועל חדרה',
  'Maccabi Bnei Raina FC': 'מכבי בני ריינה',
  'Ironi Tiberias FC': 'עירוני טבריה',
  'Hapoel Petah Tikva FC': 'הפועל פתח תקווה',
  'Bnei Yehuda Tel Aviv FC': 'בני יהודה',
  'Bnei Yehuda FC': 'בני יהודה',
  'Hapoel Kfar Saba FC': 'הפועל כפר סבא',
  "Hapoel Ra'anana FC": 'הפועל רעננה',
  'Hapoel Acre FC': 'הפועל עכו',
  'Ironi Kiryat Shmona FC': 'עירוני קריית שמונה',
  'Hapoel Ironi Kiryat Shmona FC': 'עירוני קריית שמונה',
  'Ihoud Bnei Sakhnin FC': 'בני סכנין',
  'FC Ashdod': 'מ.ס. אשדוד',
  'Hapoel Bnei Ashdod FC': 'הפועל בני אשדוד',
  'Hapoel Ramat Gan FC': 'הפועל רמת גן',
  'Sektzia Nes Tziona FC': 'סקציה נס ציונה',
  'Hapoel Nof HaGalil FC': 'הפועל נוף הגליל',
  'Hapoel Rishon LeZion FC': 'הפועל ראשון לציון',
  'Hapoel Katamon FC': 'הפועל קטמון ירושלים',
  'Hapoel Katamon Jerusalem FC': 'הפועל קטמון ירושלים',
  'Maccabi Umm al-Fahm FC': 'מכבי אום אל פאחם',
  'Ihud Bnei Shefaram FC': 'איחוד בני שפרעם',
};

function fsNameHe(nameEn: string): string {
  return FS_TEAM_NAME_HE[nameEn] || nameEn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeasonLabel(year: number) {
  return `${year}/${String(year + 1).slice(-2)}`;
}

async function getOrCreateSeason(year: number) {
  return prisma.season.upsert({
    where: { year },
    update: {},
    create: {
      year,
      name: formatSeasonLabel(year),
      startDate: new Date(`${year}-07-01`),
      endDate: new Date(`${year + 1}-06-30`),
    },
  });
}

function updateStep(steps: JobStep[], key: string, updates: Partial<JobStep>): JobStep[] {
  return steps.map((s) => (s.key === key ? { ...s, ...updates } : s));
}

async function saveProgress(
  jobId: string,
  steps: JobStep[],
  percent: number
) {
  await prisma.fetchJob.update({
    where: { id: jobId },
    data: { progressPercent: percent, stepsJson: steps as any },
  });
}

// ── Team sync ─────────────────────────────────────────────────────────────────

async function syncTeams(
  fsTeams: FSTeam[],
  seasonId: string,
  competitionId: string
): Promise<{ synced: number; teamMap: Map<number, string> }> {
  const teamMap = new Map<number, string>(); // footyStatsId → DB team id

  for (const fst of fsTeams) {
    const nameEn = fst.english_name || fst.name;
    const nameHe = fsNameHe(fst.name);

    // 1. Match by footyStatsId (re-sync case)
    let existing = await prisma.team.findFirst({
      where: { footyStatsId: fst.id },
      select: { id: true },
    });

    // 2. Match by Hebrew name (IFA/Walla teams don't carry footyStatsId yet)
    if (!existing) {
      existing = await prisma.team.findFirst({
        where: { nameHe, seasonId },
        select: { id: true },
      });
    }

    if (existing) {
      await prisma.team.update({
        where: { id: existing.id },
        data: {
          footyStatsId: fst.id,
          logoUrl: fst.image || undefined,
          stadiumEn: fst.stadium_name || undefined,
        },
      });
      teamMap.set(fst.id, existing.id);
    } else {
      // 3. Create new (unknown team not in IFA data)
      const team = await prisma.team.upsert({
        where: { nameEn_seasonId: { nameEn, seasonId } },
        update: { footyStatsId: fst.id, logoUrl: fst.image || undefined, stadiumEn: fst.stadium_name || undefined },
        create: { nameEn, nameHe, seasonId, footyStatsId: fst.id, logoUrl: fst.image || undefined, stadiumEn: fst.stadium_name || undefined },
      });
      teamMap.set(fst.id, team.id);
    }
  }

  return { synced: fsTeams.length, teamMap };
}

// ── Fixture sync ──────────────────────────────────────────────────────────────

function fsStatusToGameStatus(status: string): GameStatus {
  const s = status.toLowerCase();
  if (s === 'complete') return GameStatus.COMPLETED;
  if (s === 'live' || s === 'in progress') return GameStatus.ONGOING;
  if (s === 'canceled' || s === 'suspended') return GameStatus.CANCELLED;
  return GameStatus.SCHEDULED;
}

async function syncFixtures(
  matches: FSMatch[],
  seasonId: string,
  competitionId: string,
  teamMap: Map<number, string>
): Promise<{ synced: number; gameMap: Map<number, string> }> {
  const gameMap = new Map<number, string>(); // footyStatsId → DB game id
  let synced = 0;

  for (const m of matches) {
    const homeTeamId = teamMap.get(m.homeID);
    const awayTeamId = teamMap.get(m.awayID);
    if (!homeTeamId || !awayTeamId) continue;

    const dateTime = fsUnixToDate(m.date_unix);
    const status = fsStatusToGameStatus(m.status);
    const roundName = m.game_week > 0 ? `מחזור ${m.game_week}` : undefined;

    try {
      // 1. Try existing game by footyStatsId
      let game = await prisma.game.findFirst({
        where: { footyStatsId: m.id },
        select: { id: true },
      });

      // 2. Fall back: same day + same teams (handles IFA/Walla games without footyStatsId)
      if (!game) {
        const dayStart = new Date(dateTime);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dateTime);
        dayEnd.setUTCHours(23, 59, 59, 999);

        game = await prisma.game.findFirst({
          where: {
            homeTeamId,
            awayTeamId,
            seasonId,
            dateTime: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true },
        });
      }

      const updateData = {
        footyStatsId: m.id,
        homeScore: m.homeGoalCount ?? undefined,
        awayScore: m.awayGoalCount ?? undefined,
        status,
        dateTime,
        roundNameHe: roundName,
        roundNameEn: m.game_week > 0 ? `Round ${m.game_week}` : undefined,
      };

      if (game) {
        await prisma.game.update({ where: { id: game.id }, data: updateData });
      } else {
        game = await prisma.game.create({
          data: { ...updateData, homeTeamId, awayTeamId, seasonId, competitionId },
          select: { id: true },
        });
      }

      gameMap.set(m.id, game.id);
      synced++;
    } catch {
      const existing = await prisma.game.findFirst({
        where: { footyStatsId: m.id },
        select: { id: true },
      });
      if (existing) gameMap.set(m.id, existing.id);
    }
  }

  return { synced, gameMap };
}

// ── Match detail sync (events + stats + odds) ─────────────────────────────────

async function syncMatchDetail(
  fsMatch: FSMatch,
  gameId: string,
  seasonId: string,
  competitionId: string,
  teamMap: Map<number, string>,
  playerCache: Map<number, string> // footyStatsId → DB player id
): Promise<void> {
  // Upsert game statistics (xG, possession, shots, corners)
  await prisma.gameStatistics.upsert({
    where: { gameId },
    update: {
      homeTeamPossession: fsMatch.team_a_possession ?? undefined,
      awayTeamPossession: fsMatch.team_b_possession ?? undefined,
      homeShotsOnTarget: fsMatch.team_a_shotsOnTarget ?? undefined,
      awayShotsOnTarget: fsMatch.team_b_shotsOnTarget ?? undefined,
      homeShotsTotal: fsMatch.team_a_shots ?? undefined,
      awayShotsTotal: fsMatch.team_b_shots ?? undefined,
      homeCorners: fsMatch.team_a_corners ?? undefined,
      awayCorners: fsMatch.team_b_corners ?? undefined,
      homeFouls: fsMatch.team_a_fouls ?? undefined,
      awayFouls: fsMatch.team_b_fouls ?? undefined,
      homeOffsides: fsMatch.team_a_offsides ?? undefined,
      awayOffsides: fsMatch.team_b_offsides ?? undefined,
      homeYellowCards: fsMatch.team_a_yellow_cards ?? undefined,
      awayYellowCards: fsMatch.team_b_yellow_cards ?? undefined,
      homeRedCards: fsMatch.team_a_red_cards ?? undefined,
      awayRedCards: fsMatch.team_b_red_cards ?? undefined,
      homeXg: fsMatch.team_a_xg ?? undefined,
      awayXg: fsMatch.team_b_xg ?? undefined,
    },
    create: {
      gameId,
      homeTeamPossession: fsMatch.team_a_possession ?? undefined,
      awayTeamPossession: fsMatch.team_b_possession ?? undefined,
      homeShotsOnTarget: fsMatch.team_a_shotsOnTarget ?? undefined,
      awayShotsOnTarget: fsMatch.team_b_shotsOnTarget ?? undefined,
      homeShotsTotal: fsMatch.team_a_shots ?? undefined,
      awayShotsTotal: fsMatch.team_b_shots ?? undefined,
      homeCorners: fsMatch.team_a_corners ?? undefined,
      awayCorners: fsMatch.team_b_corners ?? undefined,
      homeFouls: fsMatch.team_a_fouls ?? undefined,
      awayFouls: fsMatch.team_b_fouls ?? undefined,
      homeOffsides: fsMatch.team_a_offsides ?? undefined,
      awayOffsides: fsMatch.team_b_offsides ?? undefined,
      homeYellowCards: fsMatch.team_a_yellow_cards ?? undefined,
      awayYellowCards: fsMatch.team_b_yellow_cards ?? undefined,
      homeRedCards: fsMatch.team_a_red_cards ?? undefined,
      awayRedCards: fsMatch.team_b_red_cards ?? undefined,
      homeXg: fsMatch.team_a_xg ?? undefined,
      awayXg: fsMatch.team_b_xg ?? undefined,
    },
  });

  // Write pre-match odds (1x2 + O/U 2.5 + BTTS)
  // Use delete+create to avoid Prisma upsert issues with null marketApiId in compound unique key
  const oddsRows: {
    gameId: string; seasonId: string; competitionId: string;
    bookmakerApiId: number; bookmakerName: string;
    marketName: string; selectionValue: string; odd: string;
  }[] = [];

  const oddsMarkets = [
    { market: 'Match Winner', selections: [{ v: '1', odd: fsMatch.odds_ft_1 }, { v: 'X', odd: fsMatch.odds_ft_x }, { v: '2', odd: fsMatch.odds_ft_2 }] },
    { market: 'Goals Over/Under 2.5', selections: [{ v: 'Over 2.5', odd: fsMatch.odds_ft_over25 }, { v: 'Under 2.5', odd: fsMatch.odds_ft_under25 }] },
    { market: 'Both Teams Score', selections: [{ v: 'Yes', odd: fsMatch.odds_btts_yes }, { v: 'No', odd: fsMatch.odds_btts_no }] },
  ];

  for (const market of oddsMarkets) {
    for (const sel of market.selections) {
      if (!sel.odd) continue;
      oddsRows.push({ gameId, seasonId, competitionId, bookmakerApiId: 0, bookmakerName: 'FootyStats', marketName: market.market, selectionValue: `${market.market}:${sel.v}`, odd: String(sel.odd) });
    }
  }

  if (oddsRows.length > 0) {
    await prisma.gameOddsValue.deleteMany({ where: { gameId, bookmakerApiId: 0 } });
    await prisma.gameOddsValue.createMany({ data: oddsRows });
  }
}

// ── Match events + lineups sync ───────────────────────────────────────────────

async function syncMatchEvents(
  fsMatchId: number,
  gameId: string,
  teamMap: Map<number, string>,
  homeTeamFsId: number,
  awayTeamFsId: number,
  playerCache: Map<number, string>
): Promise<number> {
  const detail = await fsGetMatchDetail(fsMatchId);
  if (!detail) return 0;

  const homeTeamId = teamMap.get(homeTeamFsId);
  const awayTeamId = teamMap.get(awayTeamFsId);

  let eventCount = 0;

  // Delete existing events for this game to avoid duplicates on re-sync
  await prisma.gameEvent.deleteMany({ where: { gameId } });

  const allGoals = [
    ...(detail.team_a_goal_details || []).map((g) => ({ ...g, teamId: homeTeamId })),
    ...(detail.team_b_goal_details || []).map((g) => ({ ...g, teamId: awayTeamId })),
  ].sort((a, b) => Number(a.time) - Number(b.time));

  for (const g of allGoals) {
    const isOwnGoal = g.type?.toLowerCase().includes('own goal');
    const isPenalty = g.type?.toLowerCase().includes('penalty');
    const eventType: EventType = isOwnGoal
      ? EventType.OWN_GOAL
      : isPenalty
        ? EventType.PENALTY_GOAL
        : EventType.GOAL;

    const playerId = playerCache.get(g.player_id) ?? null;
    const assistPlayerId = g.assist_player_id && g.assist_player_id !== -1
      ? (playerCache.get(g.assist_player_id) ?? null)
      : null;

    await prisma.gameEvent.create({
      data: {
        gameId,
        minute: Number(g.time) || 0,
        extraMinute: g.extra ? Number(g.extra) : undefined,
        type: eventType,
        team: homeTeamId === g.teamId ? 'home' : 'away',
        teamId: g.teamId ?? undefined,
        playerId: playerId ?? undefined,
        relatedPlayerId: assistPlayerId ?? undefined,
        participantName: null,
        notesEn: fsGoalTypeToEventNote(g.type),
        sortOrder: eventCount,
      },
    });
    eventCount++;
  }

  // Cards
  const allCards = [
    ...(detail.team_a_card_details || []).map((c) => ({ ...c, teamId: homeTeamId })),
    ...(detail.team_b_card_details || []).map((c) => ({ ...c, teamId: awayTeamId })),
  ].sort((a, b) => Number(a.time) - Number(b.time));

  for (const c of allCards) {
    const cardType = fsCardToEventType(c.card);
    const playerId = playerCache.get(c.player_id) ?? null;

    await prisma.gameEvent.create({
      data: {
        gameId,
        minute: Number(c.time) || 0,
        type: cardType as EventType,
        team: homeTeamId === c.teamId ? 'home' : 'away',
        teamId: c.teamId ?? undefined,
        playerId: playerId ?? undefined,
        sortOrder: eventCount,
      },
    });
    eventCount++;
  }

  // Substitutions
  const subs = detail.substitutions;
  if (subs) {
    const homeSubs = subs.home || [];
    const awaySubs = subs.away || [];

    for (const sub of [...homeSubs.map((s) => ({ ...s, isHome: true })), ...awaySubs.map((s) => ({ ...s, isHome: false }))]) {
      const playerInId = playerCache.get(sub.player_in_id) ?? null;
      const playerOutId = playerCache.get(sub.player_out_id) ?? null;
      const tId = sub.isHome ? homeTeamId : awayTeamId;

      // SUBSTITUTION_IN
      await prisma.gameEvent.create({
        data: {
          gameId,
          minute: Number(sub.time) || 0,
          type: EventType.SUBSTITUTION_IN,
          team: sub.isHome ? 'home' : 'away',
          teamId: tId ?? undefined,
          playerId: playerInId ?? undefined,
          relatedPlayerId: playerOutId ?? undefined,
          sortOrder: eventCount,
        },
      });
      eventCount++;

      // SUBSTITUTION_OUT
      await prisma.gameEvent.create({
        data: {
          gameId,
          minute: Number(sub.time) || 0,
          type: EventType.SUBSTITUTION_OUT,
          team: sub.isHome ? 'home' : 'away',
          teamId: tId ?? undefined,
          playerId: playerOutId ?? undefined,
          relatedPlayerId: playerInId ?? undefined,
          sortOrder: eventCount,
        },
      });
      eventCount++;
    }
  }

  // Lineups
  const lineup = detail.lineup;
  if (lineup) {
    await prisma.gameLineupEntry.deleteMany({ where: { gameId } });

    const sides: Array<{ side: FSTeam | null; fsTeamId: number; dbTeamId: string | undefined; key: 'home' | 'away' }> = [
      { side: null, fsTeamId: homeTeamFsId, dbTeamId: homeTeamId, key: 'home' },
      { side: null, fsTeamId: awayTeamFsId, dbTeamId: awayTeamId, key: 'away' },
    ];

    for (const { key, dbTeamId } of sides) {
      if (!dbTeamId) continue;
      const lineSide = lineup[key];
      if (!lineSide) continue;

      for (const p of lineSide.starting_eleven || []) {
        const playerId = playerCache.get(p.player_id) ?? null;
        await prisma.gameLineupEntry.create({
          data: {
            gameId,
            teamId: dbTeamId,
            role: GameLineupRole.STARTER,
            participantType: LineupParticipantType.PLAYER,
            playerId: playerId ?? undefined,
            jerseyNumber: p.shirt_number ?? undefined,
            positionName: p.position ?? undefined,
          },
        });
      }

      for (const p of lineSide.substitutes || []) {
        const playerId = playerCache.get(p.player_id) ?? null;
        await prisma.gameLineupEntry.create({
          data: {
            gameId,
            teamId: dbTeamId,
            role: GameLineupRole.SUBSTITUTE,
            participantType: LineupParticipantType.PLAYER,
            playerId: playerId ?? undefined,
            jerseyNumber: p.shirt_number ?? undefined,
            positionName: p.position ?? undefined,
          },
        });
      }
    }
  }

  return eventCount;
}

// ── Player sync ───────────────────────────────────────────────────────────────

async function syncPlayers(
  fsPlayers: FSPlayer[],
  seasonId: string,
  competitionId: string,
  teamMap: Map<number, string>
): Promise<{ synced: number; playerCache: Map<number, string> }> {
  const playerCache = new Map<number, string>(); // footyStatsId → DB player id
  let synced = 0;

  for (const fp of fsPlayers) {
    const dbTeamId = teamMap.get(fp.club_team_id);
    if (!dbTeamId) continue;

    const nameEn = fp.full_name || fp.known_as;
    if (!nameEn) continue;

    // Try to find existing player by footyStatsId first, then by name+team
    let player = await prisma.player.findFirst({
      where: { footyStatsId: fp.id },
      select: { id: true },
    });

    if (!player) {
      player = await prisma.player.findFirst({
        where: {
          OR: [
            { nameEn, teamId: dbTeamId },
            {
              firstNameEn: fp.first_name || undefined,
              lastNameEn: fp.last_name || undefined,
              teamId: dbTeamId,
            },
          ],
        },
        select: { id: true },
      });
    }

    if (player) {
      // Update footyStatsId + physical data if missing
      await prisma.player.update({
        where: { id: player.id },
        data: {
          footyStatsId: fp.id,
          height: fp.height && fp.height > 0 ? `${fp.height}` : undefined,
          weight: fp.weight && fp.weight > 0 ? `${fp.weight}` : undefined,
          birthDate: fp.birthday ? new Date(fp.birthday * 1000) : undefined,
          nationalityEn: fp.nationality || undefined,
          position: fp.position || undefined,
        },
      });
    } else {
      // Create new player record
      player = await prisma.player.create({
        data: {
          nameEn,
          nameHe: nameEn,
          teamId: dbTeamId,
          footyStatsId: fp.id,
          firstNameEn: fp.first_name || undefined,
          lastNameEn: fp.last_name || undefined,
          height: fp.height && fp.height > 0 ? `${fp.height}` : undefined,
          weight: fp.weight && fp.weight > 0 ? `${fp.weight}` : undefined,
          birthDate: fp.birthday ? new Date(fp.birthday * 1000) : undefined,
          nationalityEn: fp.nationality || undefined,
          position: fp.position || undefined,
        },
        select: { id: true },
      });
    }

    playerCache.set(fp.id, player.id);

    // Upsert player statistics for this season
    if (fp.appearances_overall !== null && fp.appearances_overall !== undefined) {
      await prisma.playerStatistics.upsert({
        where: {
          playerId_seasonId_competitionId: {
            playerId: player.id,
            seasonId,
            competitionId,
          },
        },
        update: {
          gamesPlayed: fp.appearances_overall ?? 0,
          minutesPlayed: fp.minutes_played_overall ?? 0,
          goals: fp.goals_overall ?? 0,
          assists: fp.assists_overall ?? 0,
          yellowCards: fp.yellow_cards_overall ?? 0,
          redCards: fp.red_cards_overall ?? 0,
          goalsPer90: fp.goals_per_90_overall ?? undefined,
          assistsPer90: fp.assists_per_90_overall ?? undefined,
          minPerGoal: fp.min_per_goal_overall ?? undefined,
          cardsPer90: fp.cards_per_90_overall ?? undefined,
        },
        create: {
          playerId: player.id,
          seasonId,
          competitionId,
          gamesPlayed: fp.appearances_overall ?? 0,
          minutesPlayed: fp.minutes_played_overall ?? 0,
          goals: fp.goals_overall ?? 0,
          assists: fp.assists_overall ?? 0,
          yellowCards: fp.yellow_cards_overall ?? 0,
          redCards: fp.red_cards_overall ?? 0,
          goalsPer90: fp.goals_per_90_overall ?? undefined,
          assistsPer90: fp.assists_per_90_overall ?? undefined,
          minPerGoal: fp.min_per_goal_overall ?? undefined,
          cardsPer90: fp.cards_per_90_overall ?? undefined,
        },
      });
    }

    synced++;
  }

  return { synced, playerCache };
}

// ── Standings sync ────────────────────────────────────────────────────────────

async function syncStandings(
  fsTeams: FSTeam[],
  seasonId: string,
  competitionId: string,
  teamMap: Map<number, string>
): Promise<number> {
  let synced = 0;

  // Sort by leaguePosition_overall ascending
  const sorted = [...fsTeams].sort((a, b) => {
    const posA = a.stats?.leaguePosition_overall ?? 999;
    const posB = b.stats?.leaguePosition_overall ?? 999;
    return posA - posB;
  });

  for (let i = 0; i < sorted.length; i++) {
    const fst = sorted[i];
    const dbTeamId = teamMap.get(fst.id);
    if (!dbTeamId) continue;

    const s = fst.stats || {};
    const position = (s.leaguePosition_overall as number) || i + 1;
    const played = (s.seasonMatchesPlayed_overall as number) || 0;
    const wins = (s.seasonWinsNum_overall as number) || 0;
    const draws = (s.seasonDrawsNum_overall as number) || 0;
    const losses = (s.seasonLossesNum_overall as number) || 0;
    const goalsFor = (s.seasonScoredNum_overall as number) || 0;
    const goalsAgainst = (s.seasonConcededNum_overall as number) || 0;
    const goalsDiff = (s.seasonGoalDifference_overall as number) || goalsFor - goalsAgainst;
    const points = wins * 3 + draws;

    await prisma.standing.upsert({
      where: { seasonId_teamId: { seasonId, teamId: dbTeamId } },
      update: {
        position,
        played,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalsDiff,
        points,
        competitionId,
      },
      create: {
        seasonId,
        teamId: dbTeamId,
        competitionId,
        position,
        played,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalsDiff,
        points,
      },
    });
    synced++;
  }

  return synced;
}

// ── Referees sync ─────────────────────────────────────────────────────────────

async function syncReferees(fsReferees: FSReferee[]): Promise<number> {
  let synced = 0;

  for (const ref of fsReferees) {
    if (!ref.full_name) continue;

    // Try to find existing referee by footyStatsId, then fall back to name match
    const existing = ref.id
      ? await prisma.referee.findFirst({ where: { footyStatsId: ref.id } })
      : null;

    if (existing) {
      synced++;
      continue;
    }

    // Normalize name: "Last, First" → "First Last" for matching
    const nameEn = ref.full_name.trim();

    const byName = await prisma.referee.findFirst({
      where: { nameEn: { equals: nameEn, mode: 'insensitive' } },
    });

    if (byName) {
      // Link footyStatsId to existing referee
      await prisma.referee.update({
        where: { id: byName.id },
        data: { footyStatsId: ref.id },
      });
    } else {
      // Create new referee record (no Hebrew name — that comes from IFA)
      await prisma.referee.create({
        data: { nameEn, footyStatsId: ref.id },
      });
    }
    synced++;
  }

  return synced;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה.' }, { status: 403 });
  }

  const body = (await request.json()) as FetchBody;
  const leagueKey = body.leagueKey || body.league || 'ipl';
  const seasonYear = Number(body.seasonYear || 2025);
  const resources: string[] = Array.isArray(body.resources)
    ? body.resources
    : ['teams', 'fixtures', 'players', 'standings'];

  // Accept direct season ID (discovered leagues) or look up from hardcoded map
  const footyStatsSeasonId =
    body.footyStatsSeasonId ||
    FOOTYSTATS_SEASON_IDS[leagueKey as FootyStatsLeague]?.[seasonYear];

  if (!footyStatsSeasonId) {
    return NextResponse.json(
      { error: `אין מזהה FootyStats לליגה "${leagueKey}" עונת ${seasonYear}` },
      { status: 400 }
    );
  }

  // Known leagues have Hebrew labels; discovered ones use their key as fallback
  const knownLabel = FOOTYSTATS_LEAGUE_LABELS[leagueKey as FootyStatsLeague];
  const leagueLabel = knownLabel ?? { nameHe: leagueKey, nameEn: leagueKey };
  const seasonLabel = formatSeasonLabel(seasonYear);
  const eventsAvailable = seasonYear >= EVENTS_AVAILABLE_FROM_YEAR;

  const initialSteps: JobStep[] = resources.map((key) => ({
    key,
    label: RESOURCE_LABELS[key] || key,
    status: 'pending',
    syncedCount: 0,
    ...(key === 'matchEvents' && !eventsAvailable
      ? { note: `אירועים זמינים מ-${EVENTS_AVAILABLE_FROM_YEAR} ואילך בלבד` }
      : {}),
  }));

  const job = await prisma.fetchJob.create({
    data: {
      labelHe: `FootyStats — ${leagueLabel.nameHe} עונת ${seasonLabel}`,
      status: FetchJobStatus.RUNNING,
      requestPayload: body as any,
      progressPercent: 5,
      stepsJson: initialSteps as any,
      initiatedById: viewer.id,
    },
  });

  let steps = [...initialSteps];

  try {
    const season = await getOrCreateSeason(seasonYear);

    // Resolve or create Competition record.
    // Known leagues use their api-football IDs; discovered leagues use a negative
    // placeholder derived from the footyStats season ID so it stays unique.
    const knownApiId: Record<string, number> = { ipl: 383, leumit: 382, stateCup: 384 };
    const apiFootballId = knownApiId[leagueKey] ?? -footyStatsSeasonId;

    const competition = await prisma.competition.upsert({
      where: { apiFootballId },
      update: { nameHe: leagueLabel.nameHe, nameEn: leagueLabel.nameEn },
      create: {
        apiFootballId,
        nameHe: leagueLabel.nameHe,
        nameEn: leagueLabel.nameEn,
      },
    });

    // Store FootyStats season ID on the CompetitionSeason join
    await prisma.competitionSeason.upsert({
      where: { competitionId_seasonId: { competitionId: competition.id, seasonId: season.id } },
      update: { footyStatsSeasonId: footyStatsSeasonId },
      create: { competitionId: competition.id, seasonId: season.id, footyStatsSeasonId: footyStatsSeasonId },
    });

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: { seasonId: season.id, competitionId: competition.id, progressPercent: 10 },
    });

    // ── Step 1: Teams ───────────────────────────────────────────────────────
    let teamMap = new Map<number, string>();
    let fsTeams: FSTeam[] = [];

    if (resources.includes('teams') || resources.includes('fixtures') || resources.includes('matchEvents') || resources.includes('standings')) {
      steps = updateStep(steps, 'teams', { status: 'running' });
      await saveProgress(job.id, steps, 15);

      fsTeams = await fsGetLeagueTeams(footyStatsSeasonId);
      const teamResult = await syncTeams(fsTeams, season.id, competition.id);
      teamMap = teamResult.teamMap;

      steps = updateStep(steps, 'teams', { status: 'done', syncedCount: teamResult.synced, fetchedCount: fsTeams.length });
      await saveProgress(job.id, steps, 25);
    }

    // ── Step 2: Fixtures ────────────────────────────────────────────────────
    let allMatches: FSMatch[] = [];
    let gameMap = new Map<number, string>();

    if (resources.includes('fixtures') || resources.includes('matchEvents')) {
      steps = updateStep(steps, 'fixtures', { status: 'running' });
      await saveProgress(job.id, steps, 28);

      allMatches = await fsGetAllLeagueMatches(footyStatsSeasonId);
      const fixtureResult = await syncFixtures(allMatches, season.id, competition.id, teamMap);
      gameMap = fixtureResult.gameMap;

      steps = updateStep(steps, 'fixtures', { status: 'done', syncedCount: fixtureResult.synced, fetchedCount: allMatches.length });
      await saveProgress(job.id, steps, 45);
    }

    // ── Step 3: Match Events + Stats + Odds ─────────────────────────────────
    let eventsSynced = 0;

    if (resources.includes('matchEvents')) {
      steps = updateStep(steps, 'matchEvents', { status: 'running' });
      await saveProgress(job.id, steps, 46);

      if (!eventsAvailable) {
        steps = updateStep(steps, 'matchEvents', { status: 'done', syncedCount: 0, note: `לא זמין לפני עונת ${EVENTS_AVAILABLE_FROM_YEAR}` });
      } else {
        // Build player cache first (need footyStats player IDs → DB player IDs)
        // We'll build this lazily from the players that exist in DB with footyStatsId
        const existingPlayers = await prisma.player.findMany({
          where: { footyStatsId: { not: null }, team: { seasonId: season.id } },
          select: { id: true, footyStatsId: true },
        });
        const playerCache = new Map<number, string>();
        for (const p of existingPlayers) {
          if (p.footyStatsId) playerCache.set(p.footyStatsId, p.id);
        }

        const completedMatches = allMatches.filter((m) => m.status === 'complete');
        let processed = 0;

        for (const m of completedMatches) {
          const gameId = gameMap.get(m.id);
          if (!gameId) continue;

          try {
            // Sync stats from bulk match data (no extra API call needed for stats)
            await syncMatchDetail(m, gameId, season.id, competition.id, teamMap, playerCache);

            // Sync events + lineups (requires separate /match API call)
            await syncMatchEvents(m.id, gameId, teamMap, m.homeID, m.awayID, playerCache);
            eventsSynced++;
          } catch (err) {
            // Don't fail the whole job for one bad match
            console.error(`FootyStats: failed to sync events for match ${m.id}:`, err);
          }

          processed++;
          if (processed % 10 === 0) {
            const pct = 46 + Math.round((processed / completedMatches.length) * 30);
            steps = updateStep(steps, 'matchEvents', { syncedCount: eventsSynced });
            await saveProgress(job.id, steps, pct);
          }
        }

        steps = updateStep(steps, 'matchEvents', { status: 'done', syncedCount: eventsSynced, fetchedCount: completedMatches.length });
      }
      await saveProgress(job.id, steps, 76);
    }

    // ── Step 4: Players ─────────────────────────────────────────────────────
    let playersSynced = 0;
    let playerCache = new Map<number, string>();

    if (resources.includes('players')) {
      steps = updateStep(steps, 'players', { status: 'running' });
      await saveProgress(job.id, steps, 77);

      const fsPlayers = await fsGetAllLeaguePlayers(footyStatsSeasonId);
      const playersResult = await syncPlayers(fsPlayers, season.id, competition.id, teamMap);
      playersSynced = playersResult.synced;
      playerCache = playersResult.playerCache;

      steps = updateStep(steps, 'players', { status: 'done', syncedCount: playersSynced, fetchedCount: fsPlayers.length });
      await saveProgress(job.id, steps, 88);
    }

    // ── Step 5: Standings ────────────────────────────────────────────────────
    let standingsSynced = 0;

    if (resources.includes('standings')) {
      steps = updateStep(steps, 'standings', { status: 'running' });
      await saveProgress(job.id, steps, 89);

      // Re-fetch teams if we didn't already (they contain the standings stats)
      if (!fsTeams.length) {
        fsTeams = await fsGetLeagueTeams(footyStatsSeasonId);
        const teamResult = await syncTeams(fsTeams, season.id, competition.id);
        teamMap = teamResult.teamMap;
      }

      standingsSynced = await syncStandings(fsTeams, season.id, competition.id, teamMap);
      steps = updateStep(steps, 'standings', { status: 'done', syncedCount: standingsSynced });
      await saveProgress(job.id, steps, 95);
    }

    // ── Step 6: Odds (from already-fetched match data) ───────────────────────
    let oddsSynced = 0;

    if (resources.includes('odds') && allMatches.length > 0) {
      steps = updateStep(steps, 'odds', { status: 'running' });
      await saveProgress(job.id, steps, 95);

      for (const m of allMatches) {
        const gameId = gameMap.get(m.id);
        if (!gameId || !m.odds_ft_1) continue;

        try {
          await syncMatchDetail(m, gameId, season.id, competition.id, teamMap, playerCache);
          oddsSynced++;
        } catch {
          // ignore individual failures
        }
      }

      steps = updateStep(steps, 'odds', { status: 'done', syncedCount: oddsSynced });
      await saveProgress(job.id, steps, 98);
    }

    // ── Step 7: Referees ────────────────────────────────────────────────────
    let refereesSynced = 0;

    if (resources.includes('referees')) {
      steps = updateStep(steps, 'referees', { status: 'running' });
      await saveProgress(job.id, steps, 98);

      const fsReferees = await fsGetLeagueReferees(footyStatsSeasonId);
      refereesSynced = await syncReferees(fsReferees);

      steps = updateStep(steps, 'referees', { status: 'done', syncedCount: refereesSynced, fetchedCount: fsReferees.length });
      await saveProgress(job.id, steps, 99);
    }

    // ── Complete ─────────────────────────────────────────────────────────────
    const resultPayload = {
      league: leagueLabel.nameHe,
      season: seasonLabel,
      footyStatsSeasonId,
      teamsSynced: teamMap.size,
      fixturesSynced: gameMap.size,
      eventsSynced,
      playersSynced,
      standingsSynced,
      oddsSynced,
      refereesSynced,
    };

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        status: FetchJobStatus.COMPLETED,
        progressPercent: 100,
        finishedAt: new Date(),
        resultJson: resultPayload as any,
        stepsJson: steps as any,
      },
    });

    await logActivity({
      entityType: ActivityEntityType.FETCH_JOB,
      entityId: job.id,
      actionHe: `FootyStats: ${leagueLabel.nameHe} עונת ${seasonLabel} — הושלם`,
      userId: viewer.id,
      details: resultPayload,
    });

    return NextResponse.json({ success: true, jobId: job.id, ...resultPayload, steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = isFootyStatsRateLimitError(error) ? 429 : 500;

    await prisma.fetchJob.update({
      where: { id: job.id },
      data: {
        status: FetchJobStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
        stepsJson: steps as any,
      },
    });

    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
