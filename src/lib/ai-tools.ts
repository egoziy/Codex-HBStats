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
    description: 'Get match events for a player — goals, yellow cards, red cards, substitutions. Returns event type, minute, and match details.',
    parameters: {
      type: 'object' as const,
      properties: {
        playerId: { type: 'string', description: 'Player ID' },
        seasonYear: { type: 'number', description: 'Optional season year filter' },
        eventType: {
          type: 'string',
          description: 'Filter by event type',
          enum: ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION_IN', 'SUBSTITUTION_OUT', 'OWN_GOAL', 'PENALTY_GOAL'],
        },
      },
      required: ['playerId'],
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
      team: { select: { nameHe: true, nameEn: true } },
      playerStats: {
        select: { goals: true, assists: true, yellowCards: true, redCards: true, gamesPlayed: true, minutesPlayed: true },
        take: 1,
        orderBy: { season: { year: 'desc' } },
      },
    },
    take: 10,
  });

  return players.map((p) => ({
    id: p.id,
    nameHe: p.nameHe,
    nameEn: p.nameEn,
    position: p.position,
    team: p.team?.nameHe || p.team?.nameEn,
    stats: p.playerStats[0] || null,
  }));
}

export async function getPlayerEvents(args: { playerId: string; seasonYear?: number; eventType?: string }) {
  const where: any = { playerId: args.playerId };
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
          homeTeam: { select: { nameHe: true } },
          awayTeam: { select: { nameHe: true } },
          competition: { select: { nameHe: true } },
        },
      },
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
    competition: e.game.competition?.nameHe || '',
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
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
