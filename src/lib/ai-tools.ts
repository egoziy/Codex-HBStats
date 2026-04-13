import prisma from '@/lib/prisma';

// ─── Tool Definitions (for AI provider) ───

export const toolDefinitions = [
  {
    name: 'searchPlayers',
    description: 'Search for players by name (Hebrew or English). Returns player id, name, team, position, season.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name to search (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Optional season year to filter (e.g. 2025)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPlayerEvents',
    description: 'Get match events for a player — goals, yellow cards, red cards, substitutions. Can search by player name (recommended) or player ID. Searching by name finds events across all seasons and teams automatically.',
    parameters: {
      type: 'object' as const,
      properties: {
        playerName: { type: 'string', description: 'Player name (Hebrew or English) — recommended, searches across all seasons' },
        playerId: { type: 'string', description: 'Specific player ID (use playerName instead when possible)' },
        seasonYear: { type: 'number', description: 'Optional season year filter' },
        eventType: {
          type: 'string',
          description: 'Filter by event type',
          enum: ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION_IN', 'SUBSTITUTION_OUT', 'OWN_GOAL', 'PENALTY_GOAL'],
        },
      },
    },
  },
  {
    name: 'searchGames',
    description: 'Search for games by team name, season, or date range. Returns match date, teams, scores, competition.',
    parameters: {
      type: 'object' as const,
      properties: {
        teamName: { type: 'string', description: 'Team name (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Season year' },
        dateFrom: { type: 'string', description: 'Start date (ISO format, e.g. 2025-08-01)' },
        dateTo: { type: 'string', description: 'End date (ISO format)' },
      },
    },
  },
  {
    name: 'getStandings',
    description: 'Get league standings table for a season. Returns position, team, played, wins, draws, losses, goals for/against, points.',
    parameters: {
      type: 'object' as const,
      properties: {
        seasonYear: { type: 'number', description: 'Season year (e.g. 2025)' },
        competitionId: { type: 'string', description: 'Optional competition ID (defaults to Israeli Premier League)' },
      },
      required: ['seasonYear'],
    },
  },
  {
    name: 'getLeaderboard',
    description: 'Get leaderboard — top scorers, assists, yellow cards, red cards, substitutions in/out.',
    parameters: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Leaderboard category',
          enum: ['TOP_SCORERS', 'TOP_ASSISTS', 'TOP_YELLOW_CARDS', 'TOP_RED_CARDS', 'TOP_SUBSTITUTED_IN', 'TOP_SUBSTITUTED_OUT'],
        },
        seasonYear: { type: 'number', description: 'Season year' },
      },
      required: ['category'],
    },
  },
  {
    name: 'getPlayerCareerStats',
    description: 'Get a player career statistics across all seasons — goals, assists, yellow/red cards, games played, minutes per season. Use this for questions about overall career stats or season-by-season breakdown.',
    parameters: {
      type: 'object' as const,
      properties: {
        playerName: { type: 'string', description: 'Player name (Hebrew or English)' },
        playerId: { type: 'string', description: 'Specific player ID' },
      },
    },
  },
  {
    name: 'getTeamInfo',
    description: 'Get team information — squad, coach, stadium, season stats, recent form. Use for questions about a specific team.',
    parameters: {
      type: 'object' as const,
      properties: {
        teamName: { type: 'string', description: 'Team name (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Season year (defaults to latest)' },
      },
      required: ['teamName'],
    },
  },
  {
    name: 'getHeadToHead',
    description: 'Get head-to-head history between two teams — past results, wins, draws, losses.',
    parameters: {
      type: 'object' as const,
      properties: {
        team1: { type: 'string', description: 'First team name (Hebrew or English)' },
        team2: { type: 'string', description: 'Second team name (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Optional season year filter' },
      },
      required: ['team1', 'team2'],
    },
  },
  {
    name: 'getGameDetails',
    description: 'Get full details of a specific game — lineups, all events (goals, cards, substitutions), statistics, referee. Use when a user asks about a specific match.',
    parameters: {
      type: 'object' as const,
      properties: {
        gameId: { type: 'string', description: 'Game ID from searchGames results' },
      },
      required: ['gameId'],
    },
  },
];

// ─── Tool Implementations ───

export async function searchPlayers(args: { name: string; seasonYear?: number }) {
  const where: any = {
    OR: [
      { nameHe: { contains: args.name, mode: 'insensitive' } },
      { nameEn: { contains: args.name, mode: 'insensitive' } },
      { firstNameHe: { contains: args.name, mode: 'insensitive' } },
      { lastNameHe: { contains: args.name, mode: 'insensitive' } },
    ],
  };
  if (args.seasonYear) {
    where.team = { season: { year: args.seasonYear } };
  }

  const players = await prisma.player.findMany({
    where,
    include: {
      team: { select: { nameHe: true, nameEn: true, season: { select: { year: true } } } },
      playerStats: {
        select: { goals: true, assists: true, yellowCards: true, redCards: true, gamesPlayed: true, minutesPlayed: true },
        take: 1,
        orderBy: { season: { year: 'desc' } },
      },
    },
    orderBy: { team: { season: { year: 'desc' } } },
    take: 15,
  });

  return players.map((p) => ({
    id: p.id,
    nameHe: p.nameHe,
    nameEn: p.nameEn,
    position: p.position,
    team: p.team?.nameHe || p.team?.nameEn,
    seasonYear: p.team?.season?.year,
    stats: p.playerStats[0] || null,
  }));
}

export async function getPlayerEvents(args: { playerName?: string; playerId?: string; seasonYear?: number; eventType?: string }) {
  // Resolve player IDs — by name (across all seasons) or by single ID
  let playerIds: string[] = [];

  if (args.playerName) {
    const players = await prisma.player.findMany({
      where: {
        OR: [
          { nameHe: { contains: args.playerName, mode: 'insensitive' } },
          { nameEn: { contains: args.playerName, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    playerIds = players.map((p) => p.id);
  } else if (args.playerId) {
    playerIds = [args.playerId];
  }

  if (playerIds.length === 0) {
    return [];
  }

  const where: any = { playerId: { in: playerIds } };
  if (args.eventType) {
    where.type = args.eventType;
  }
  if (args.seasonYear) {
    where.game = { season: { year: args.seasonYear } };
  }

  const events = await prisma.gameEvent.findMany({
    where,
    include: {
      game: {
        select: {
          dateTime: true,
          homeScore: true,
          awayScore: true,
          roundNameHe: true,
          homeTeam: { select: { nameHe: true } },
          awayTeam: { select: { nameHe: true } },
          competition: { select: { nameHe: true } },
          season: { select: { year: true } },
        },
      },
      player: { select: { nameHe: true, team: { select: { nameHe: true } } } },
    },
    orderBy: { game: { dateTime: 'desc' } },
    take: 50,
  });

  return events.map((e) => ({
    type: e.type,
    minute: e.minute,
    extraMinute: e.extraMinute,
    date: e.game.dateTime.toISOString().split('T')[0],
    match: `${e.game.homeTeam.nameHe} ${e.game.homeScore ?? '?'}-${e.game.awayScore ?? '?'} ${e.game.awayTeam.nameHe}`,
    round: e.game.roundNameHe || '',
    competition: e.game.competition?.nameHe || '',
    season: e.game.season?.year,
    playerTeam: e.player?.team?.nameHe || '',
  }));
}

export async function searchGames(args: { teamName?: string; seasonYear?: number; dateFrom?: string; dateTo?: string }) {
  const where: any = {};

  if (args.teamName) {
    where.OR = [
      { homeTeam: { OR: [{ nameHe: { contains: args.teamName, mode: 'insensitive' } }, { nameEn: { contains: args.teamName, mode: 'insensitive' } }] } },
      { awayTeam: { OR: [{ nameHe: { contains: args.teamName, mode: 'insensitive' } }, { nameEn: { contains: args.teamName, mode: 'insensitive' } }] } },
    ];
  }
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }
  if (args.dateFrom || args.dateTo) {
    where.dateTime = {};
    if (args.dateFrom) where.dateTime.gte = new Date(args.dateFrom);
    if (args.dateTo) where.dateTime.lte = new Date(args.dateTo);
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      competition: { select: { nameHe: true } },
      season: { select: { year: true } },
    },
    orderBy: { dateTime: 'desc' },
    take: 20,
  });

  return games.map((g) => ({
    id: g.id,
    date: g.dateTime.toISOString().split('T')[0],
    homeTeam: g.homeTeam.nameHe,
    awayTeam: g.awayTeam.nameHe,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    competition: g.competition?.nameHe || '',
    season: g.season.year,
  }));
}

export async function getStandings(args: { seasonYear: number; competitionId?: string }) {
  const where: any = { season: { year: args.seasonYear } };
  if (args.competitionId) {
    where.competitionId = args.competitionId;
  }

  const standings = await prisma.standing.findMany({
    where,
    include: { team: { select: { nameHe: true } } },
    orderBy: { position: 'asc' },
    take: 30,
  });

  return standings.map((s) => ({
    position: s.position,
    team: s.team.nameHe,
    played: s.played,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalsDiff: s.goalsDiff,
    points: s.points,
  }));
}

export async function getLeaderboard(args: { category: string; seasonYear?: number }) {
  const where: any = { category: args.category as any };
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }

  const entries = await prisma.competitionLeaderboardEntry.findMany({
    where,
    include: {
      season: { select: { year: true } },
    },
    orderBy: { rank: 'asc' },
    take: 20,
  });

  return entries.map((e) => ({
    rank: e.rank,
    playerName: e.playerNameHe || e.playerNameEn,
    teamName: e.teamNameHe || e.teamNameEn,
    value: e.value,
    gamesPlayed: e.gamesPlayed,
    season: e.season.year,
  }));
}

// ─── New Tool Implementations ───

export async function getPlayerCareerStats(args: { playerName?: string; playerId?: string }) {
  let playerIds: string[] = [];

  if (args.playerName) {
    const players = await prisma.player.findMany({
      where: {
        OR: [
          { nameHe: { contains: args.playerName, mode: 'insensitive' } },
          { nameEn: { contains: args.playerName, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    playerIds = players.map((p) => p.id);
  } else if (args.playerId) {
    playerIds = [args.playerId];
  }

  if (!playerIds.length) return [];

  const stats = await prisma.playerStatistics.findMany({
    where: { playerId: { in: playerIds } },
    include: {
      player: { select: { nameHe: true, nameEn: true, position: true, birthDate: true } },
      season: { select: { year: true, name: true } },
      competition: { select: { nameHe: true } },
    },
    orderBy: { season: { year: 'desc' } },
  });

  const playerInfo = stats[0]?.player;
  return {
    nameHe: playerInfo?.nameHe,
    nameEn: playerInfo?.nameEn,
    position: playerInfo?.position,
    birthDate: playerInfo?.birthDate?.toISOString().split('T')[0],
    seasons: stats.map((s) => ({
      season: s.season?.year,
      seasonName: s.season?.name,
      competition: s.competition?.nameHe,
      goals: s.goals,
      assists: s.assists,
      yellowCards: s.yellowCards,
      redCards: s.redCards,
      gamesPlayed: s.gamesPlayed,
      minutesPlayed: s.minutesPlayed,
      starts: s.starts,
    })),
    totals: {
      goals: stats.reduce((sum, s) => sum + s.goals, 0),
      assists: stats.reduce((sum, s) => sum + s.assists, 0),
      yellowCards: stats.reduce((sum, s) => sum + s.yellowCards, 0),
      redCards: stats.reduce((sum, s) => sum + s.redCards, 0),
      gamesPlayed: stats.reduce((sum, s) => sum + s.gamesPlayed, 0),
      minutesPlayed: stats.reduce((sum, s) => sum + s.minutesPlayed, 0),
    },
  };
}

export async function getTeamInfo(args: { teamName: string; seasonYear?: number }) {
  const seasonFilter = args.seasonYear
    ? { season: { year: args.seasonYear } }
    : {};

  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { nameHe: { contains: args.teamName, mode: 'insensitive' } },
        { nameEn: { contains: args.teamName, mode: 'insensitive' } },
      ],
      ...seasonFilter,
    },
    include: {
      season: { select: { year: true } },
      standings: { select: { position: true, played: true, wins: true, draws: true, losses: true, goalsFor: true, goalsAgainst: true, points: true }, take: 1 },
      players: { select: { nameHe: true, position: true }, take: 30, orderBy: { nameHe: 'asc' } },
    },
    orderBy: { season: { year: 'desc' } },
    take: 1,
  });

  if (!teams.length) return { error: 'קבוצה לא נמצאה' };
  const t = teams[0];
  const standing = t.standings[0];

  return {
    nameHe: t.nameHe,
    nameEn: t.nameEn,
    season: t.season.year,
    coach: t.coachHe || t.coach,
    stadium: t.stadiumHe || t.stadiumEn,
    city: t.cityHe || t.cityEn,
    standing: standing ? {
      position: standing.position,
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      points: standing.points,
    } : null,
    squad: t.players.map((p) => ({ name: p.nameHe, position: p.position })),
  };
}

export async function getHeadToHead(args: { team1: string; team2: string; seasonYear?: number }) {
  const where: any = {
    OR: [
      {
        homeTeam: { OR: [{ nameHe: { contains: args.team1, mode: 'insensitive' } }, { nameEn: { contains: args.team1, mode: 'insensitive' } }] },
        awayTeam: { OR: [{ nameHe: { contains: args.team2, mode: 'insensitive' } }, { nameEn: { contains: args.team2, mode: 'insensitive' } }] },
      },
      {
        homeTeam: { OR: [{ nameHe: { contains: args.team2, mode: 'insensitive' } }, { nameEn: { contains: args.team2, mode: 'insensitive' } }] },
        awayTeam: { OR: [{ nameHe: { contains: args.team1, mode: 'insensitive' } }, { nameEn: { contains: args.team1, mode: 'insensitive' } }] },
      },
    ],
    status: 'COMPLETED',
  };
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      season: { select: { year: true } },
      competition: { select: { nameHe: true } },
    },
    orderBy: { dateTime: 'desc' },
    take: 20,
  });

  return {
    totalGames: games.length,
    games: games.map((g) => ({
      date: g.dateTime.toISOString().split('T')[0],
      homeTeam: g.homeTeam.nameHe,
      awayTeam: g.awayTeam.nameHe,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      season: g.season.year,
      competition: g.competition?.nameHe || '',
    })),
  };
}

export async function getGameDetails(args: { gameId: string }) {
  const game = await prisma.game.findUnique({
    where: { id: args.gameId },
    include: {
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      season: { select: { year: true } },
      competition: { select: { nameHe: true } },
      referee: { select: { nameHe: true, nameEn: true } },
      events: {
        include: { player: { select: { nameHe: true } }, relatedPlayer: { select: { nameHe: true } } },
        orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
      },
      lineupEntries: {
        select: { playerName: true, role: true, shirtNumber: true, position: true, team: { select: { nameHe: true } } },
        orderBy: [{ role: 'asc' }],
      },
      gameStats: true,
    },
  });

  if (!game) return { error: 'משחק לא נמצא' };

  return {
    date: game.dateTime.toISOString().split('T')[0],
    homeTeam: game.homeTeam.nameHe,
    awayTeam: game.awayTeam.nameHe,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    season: game.season.year,
    competition: game.competition?.nameHe,
    round: game.roundNameHe,
    referee: game.referee?.nameHe || game.refereeHe || game.refereeEn,
    venue: game.venueNameHe || game.venueNameEn,
    events: game.events.map((e) => ({
      type: e.type,
      minute: e.minute,
      extraMinute: e.extraMinute,
      player: e.player?.nameHe || e.participantName,
      relatedPlayer: e.relatedPlayer?.nameHe || e.relatedParticipantName,
    })),
    stats: game.gameStats ? {
      possession: `${game.gameStats.homePossession ?? '?'}% - ${game.gameStats.awayPossession ?? '?'}%`,
      shots: `${game.gameStats.homeShotsTotal ?? '?'} - ${game.gameStats.awayShotsTotal ?? '?'}`,
      corners: `${game.gameStats.homeCorners ?? '?'} - ${game.gameStats.awayCorners ?? '?'}`,
      fouls: `${game.gameStats.homeFouls ?? '?'} - ${game.gameStats.awayFouls ?? '?'}`,
    } : null,
  };
}

// ─── Tool Dispatcher ───

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'searchPlayers':
      return searchPlayers(args as any);
    case 'getPlayerEvents':
      return getPlayerEvents(args as any);
    case 'searchGames':
      return searchGames(args as any);
    case 'getStandings':
      return getStandings(args as any);
    case 'getLeaderboard':
      return getLeaderboard(args as any);
    case 'getPlayerCareerStats':
      return getPlayerCareerStats(args as any);
    case 'getTeamInfo':
      return getTeamInfo(args as any);
    case 'getHeadToHead':
      return getHeadToHead(args as any);
    case 'getGameDetails':
      return getGameDetails(args as any);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
