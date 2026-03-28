type EventLike = {
  minute: number;
  extraMinute: number | null;
  type: string;
  playerId: string | null;
  relatedPlayerId: string | null;
  teamId: string | null;
};

type LineupEntryLike = {
  playerId: string | null;
  role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
  teamId: string;
};

type GameStatsLike = {
  homeTeamPossession: number | null;
  awayTeamPossession: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeShotsTotal: number | null;
  awayShotsTotal: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
  homeOffsides: number | null;
  awayOffsides: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
} | null;

type GameLike = {
  id: string;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  events: EventLike[];
  lineupEntries: LineupEntryLike[];
  gameStats: GameStatsLike;
};

export const MINUTE_BUCKETS = [
  { key: '0-15', label: "0 - 15'", start: 0, end: 15 },
  { key: '15-30', label: "15 - 30'", start: 15, end: 30 },
  { key: '30-45', label: "30 - 45'", start: 30, end: 45 },
  { key: '45-60', label: "45 - 60'", start: 45, end: 60 },
  { key: '60-75', label: "60 - 75'", start: 60, end: 75 },
  { key: '75-90', label: "75 - 90'", start: 75, end: 90 },
] as const;

export type MinuteBucketKey = (typeof MINUTE_BUCKETS)[number]['key'];

export type BucketSummary = {
  key: MinuteBucketKey;
  label: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

function createEmptyBuckets(): Record<MinuteBucketKey, BucketSummary> {
  return Object.fromEntries(
    MINUTE_BUCKETS.map((bucket) => [
      bucket.key,
      {
        key: bucket.key,
        label: bucket.label,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      },
    ])
  ) as Record<MinuteBucketKey, BucketSummary>;
}

function eventMinute(event: Pick<EventLike, 'minute' | 'extraMinute'>) {
  return event.minute + Math.max(event.extraMinute || 0, 0);
}

function clampGameMinute(minute: number) {
  if (!Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(90, minute));
}

function addMinutesToBuckets(
  buckets: Record<MinuteBucketKey, BucketSummary>,
  startMinute: number,
  endMinute: number
) {
  const start = clampGameMinute(startMinute);
  const end = clampGameMinute(endMinute);
  if (end <= start) return;

  for (const bucket of MINUTE_BUCKETS) {
    const overlapStart = Math.max(start, bucket.start);
    const overlapEnd = Math.min(end, bucket.end);
    if (overlapEnd > overlapStart) {
      buckets[bucket.key].minutesPlayed += overlapEnd - overlapStart;
    }
  }
}

function getBucketKeyByMinute(minute: number): MinuteBucketKey {
  if (minute < 15) return '0-15';
  if (minute < 30) return '15-30';
  if (minute < 45) return '30-45';
  if (minute < 60) return '45-60';
  if (minute < 75) return '60-75';
  return '75-90';
}

function inferPlayedWindow(playerId: string, game: GameLike) {
  const playerLineups = game.lineupEntries.filter((entry) => entry.playerId === playerId);
  const isStarter = playerLineups.some((entry) => entry.role === 'STARTER');
  const onBench = playerLineups.some((entry) => entry.role === 'SUBSTITUTE');
  const substitutionIn = game.events
    .filter(
      (event) =>
        (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') &&
        event.relatedPlayerId === playerId
    )
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];
  const substitutedOff = game.events
    .filter(
      (event) =>
        (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') &&
        event.playerId === playerId
    )
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];

  if (!isStarter && !substitutionIn) {
    return {
      starts: 0,
      benchAppearances: onBench ? 1 : 0,
      substituteAppearances: 0,
      timesSubbedOff: 0,
      minutesPlayed: 0,
      startMinute: null as number | null,
      endMinute: null as number | null,
    };
  }

  const startMinute = isStarter ? 0 : clampGameMinute(eventMinute(substitutionIn!));
  const endMinute = substitutedOff ? clampGameMinute(eventMinute(substitutedOff)) : 90;

  return {
    starts: isStarter ? 1 : 0,
    benchAppearances: onBench ? 1 : 0,
    substituteAppearances: !isStarter && substitutionIn ? 1 : 0,
    timesSubbedOff: substitutedOff ? 1 : 0,
    minutesPlayed: Math.max(0, endMinute - startMinute),
    startMinute,
    endMinute,
  };
}

export function derivePlayerDeepStats(playerId: string, games: GameLike[]) {
  const buckets = createEmptyBuckets();
  let goals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;
  let starts = 0;
  let gamesPlayed = 0;
  let minutesPlayed = 0;
  let substituteAppearances = 0;
  let benchAppearances = 0;
  let timesSubbedOff = 0;

  for (const game of games) {
    const window = inferPlayedWindow(playerId, game);
    if (window.starts || window.substituteAppearances) {
      gamesPlayed += 1;
    }
    starts += window.starts;
    substituteAppearances += window.substituteAppearances;
    benchAppearances += window.benchAppearances;
    timesSubbedOff += window.timesSubbedOff;
    minutesPlayed += window.minutesPlayed;

    if (window.startMinute !== null && window.endMinute !== null) {
      addMinutesToBuckets(buckets, window.startMinute, window.endMinute);
    }

    for (const event of game.events) {
      const bucket = buckets[getBucketKeyByMinute(eventMinute(event))];

      if (event.playerId === playerId) {
        if (event.type === 'GOAL' || event.type === 'PENALTY_GOAL') {
          goals += 1;
          bucket.goals += 1;
        }
        if (event.type === 'YELLOW_CARD') {
          yellowCards += 1;
          bucket.yellowCards += 1;
        }
        if (event.type === 'RED_CARD') {
          redCards += 1;
          bucket.redCards += 1;
        }
      }

      if (
        event.relatedPlayerId === playerId &&
        (event.type === 'GOAL' || event.type === 'PENALTY_GOAL')
      ) {
        assists += 1;
        bucket.assists += 1;
      }
    }
  }

  return {
    goals,
    assists,
    yellowCards,
    redCards,
    starts,
    gamesPlayed,
    minutesPlayed,
    substituteAppearances,
    benchAppearances,
    timesSubbedOff,
    bucketSummaries: MINUTE_BUCKETS.map((bucket) => buckets[bucket.key]),
  };
}

export function deriveTeamDeepStats(teamId: string, games: GameLike[]) {
  const buckets = createEmptyBuckets();
  let matchesPlayed = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let yellowCards = 0;
  let redCards = 0;
  let shotsOnTarget = 0;
  let shotsTotal = 0;
  let corners = 0;
  let fouls = 0;
  let offsides = 0;
  let possessionSamples = 0;
  let possessionTotal = 0;

  for (const game of games) {
    const isHome = game.homeTeamId === teamId;
    const isAway = game.awayTeamId === teamId;
    if (!isHome && !isAway) continue;

    if (game.status === 'COMPLETED' || game.status === 'ONGOING') {
      matchesPlayed += 1;
      const teamGoals = isHome ? game.homeScore ?? 0 : game.awayScore ?? 0;
      const conceded = isHome ? game.awayScore ?? 0 : game.homeScore ?? 0;
      goalsFor += teamGoals;
      goalsAgainst += conceded;
      if (teamGoals > conceded) wins += 1;
      if (teamGoals === conceded) draws += 1;
      if (teamGoals < conceded) losses += 1;
      if (conceded === 0) cleanSheets += 1;
    }

    for (const event of game.events) {
      if (event.teamId !== teamId) continue;
      const bucket = buckets[getBucketKeyByMinute(eventMinute(event))];
      if (event.type === 'GOAL' || event.type === 'PENALTY_GOAL') bucket.goals += 1;
      if (event.type === 'YELLOW_CARD') {
        yellowCards += 1;
        bucket.yellowCards += 1;
      }
      if (event.type === 'RED_CARD') {
        redCards += 1;
        bucket.redCards += 1;
      }
    }

    const stats = game.gameStats;
    if (stats) {
      shotsOnTarget += isHome ? stats.homeShotsOnTarget ?? 0 : stats.awayShotsOnTarget ?? 0;
      shotsTotal += isHome ? stats.homeShotsTotal ?? 0 : stats.awayShotsTotal ?? 0;
      corners += isHome ? stats.homeCorners ?? 0 : stats.awayCorners ?? 0;
      fouls += isHome ? stats.homeFouls ?? 0 : stats.awayFouls ?? 0;
      offsides += isHome ? stats.homeOffsides ?? 0 : stats.awayOffsides ?? 0;
      const possession = isHome ? stats.homeTeamPossession : stats.awayTeamPossession;
      if (typeof possession === 'number') {
        possessionSamples += 1;
        possessionTotal += possession;
      }
    }
  }

  return {
    matchesPlayed,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    cleanSheets,
    yellowCards,
    redCards,
    shotsOnTarget,
    shotsTotal,
    corners,
    fouls,
    offsides,
    averagePossession: possessionSamples ? possessionTotal / possessionSamples : 0,
    bucketSummaries: MINUTE_BUCKETS.map((bucket) => buckets[bucket.key]),
  };
}
