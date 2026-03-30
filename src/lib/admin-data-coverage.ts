import { SUPPORTED_COMPETITIONS } from '@/lib/competitions';

type CoverageCompetitionSeason = {
  competitionId: string;
  standingsUpdatedAt: Date | string | null;
  fixturesUpdatedAt: Date | string | null;
  playersUpdatedAt: Date | string | null;
  competition: {
    id: string;
    apiFootballId: number | null;
    nameHe: string;
    nameEn: string;
    countryHe: string | null;
    countryEn: string | null;
    type?: 'LEAGUE' | 'CUP' | 'EUROPE';
  };
};

type CoverageTeam = {
  id: string;
  apiFootballId: number | null;
  venueId: string | null;
  nameHe: string;
  nameEn: string;
  _count: {
    players: number;
  };
};

type CoverageGame = {
  id: string;
  competitionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string | null;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  dateTime: Date | string;
  updatedAt: Date | string;
};

type CoverageStanding = {
  id: string;
  competitionId: string | null;
  teamId: string;
  updatedAt: Date | string;
};

type CoveragePlayerStat = {
  id: string;
  competitionId: string | null;
  updatedAt: Date | string;
  player: {
    id: string;
    teamId: string;
  };
};

type CoverageTeamStat = {
  id: string;
  competitionId: string | null;
  teamId: string;
  updatedAt: Date | string;
};

type CoverageLeaderboardEntry = {
  id: string;
  competitionId: string | null;
  teamId: string | null;
  updatedAt: Date | string;
};

type CoveragePrediction = {
  id: string;
  competitionId: string | null;
  updatedAt: Date | string;
  game: {
    homeTeamId: string;
    awayTeamId: string;
    status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
    dateTime: Date | string;
  };
};

type CoverageHeadToHead = CoveragePrediction;

type CoverageOdds = {
  id: string;
  competitionId: string | null;
  updatedAt: Date | string;
  oddsUpdatedAt: Date | string | null;
  game: {
    homeTeamId: string;
    awayTeamId: string;
    status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
    dateTime: Date | string;
  };
};

type CoverageLiveSnapshot = {
  id: string;
  competitionId: string | null;
  snapshotAt: Date | string;
  feedScope: string;
  gameId: string | null;
  homeTeamApiFootballId: number | null;
  awayTeamApiFootballId: number | null;
};

type CoverageFetchJob = {
  id: string;
  competitionId: string | null;
  teamId: string | null;
  createdAt: Date | string;
  finishedAt: Date | string | null;
  stepsJson: unknown;
};

export type AdminCoverageTeamRow = {
  key: string;
  teamId: string;
  teamNameHe: string;
  teamNameEn: string;
  rosterPlayersCount: number;
  playersCount: number;
  gamesCount: number;
  standingsCount: number;
  predictionsCount: number;
  h2hCount: number;
  oddsCount: number;
  liveCount: number;
  totalCount: number;
  lastFetchAt: string | null;
  status: 'EMPTY' | 'STALE' | 'FRESH' | 'DONE';
  statusLabel: string;
  statusNote: string;
};

export type AdminCoverageRow = {
  key: string;
  seasonId: string;
  seasonLabel: string;
  seasonYear: number;
  countryLabel: string;
  competitionApiId: number | null;
  competitionNameHe: string;
  competitionNameEn: string;
  teamsCount: number;
  venuesCount: number;
  playersCount: number;
  gamesCount: number;
  standingsCount: number;
  predictionsCount: number;
  h2hCount: number;
  oddsCount: number;
  liveCount: number;
  totalCount: number;
  lastFetchAt: string | null;
  lastCoverageUpdateAt: string | null;
  status: 'EMPTY' | 'STALE' | 'FRESH' | 'DONE';
  statusLabel: string;
  statusNote: string;
  teamRows: AdminCoverageTeamRow[];
  latestStepSummary: Array<{
    key: string;
    label: string;
    syncedCount: number;
  }>;
};

type CoverageSeason = {
  id: string;
  name: string;
  year: number;
  startDate: Date | string;
  endDate: Date | string;
  competitions: CoverageCompetitionSeason[];
  teams: CoverageTeam[];
  games: CoverageGame[];
  standings: CoverageStanding[];
  playerStats: CoveragePlayerStat[];
  teamStats: CoverageTeamStat[];
  leaderboardEntries: CoverageLeaderboardEntry[];
  predictions: CoveragePrediction[];
  headToHeadEntries: CoverageHeadToHead[];
  oddsValues: CoverageOdds[];
  liveSnapshots: CoverageLiveSnapshot[];
  fetchJobs: CoverageFetchJob[];
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLatestDate(values: Array<Date | string | null | undefined>) {
  return values
    .map(asDate)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function getStatusMeta({
  hasAnyData,
  seasonEnded,
  competitionFinished,
  hasUpcomingOrLive,
  lastFetchAt,
  latestCoverageUpdateAt,
}: {
  hasAnyData: boolean;
  seasonEnded: boolean;
  competitionFinished: boolean;
  hasUpcomingOrLive: boolean;
  lastFetchAt: Date | null;
  latestCoverageUpdateAt: Date | null;
}) {
  if (!hasAnyData) {
    return {
      status: 'EMPTY' as const,
      statusLabel: 'אפשר למשוך',
      statusNote: 'לא נמצאו נתונים שמורים עבור החתך הזה.',
    };
  }

  if ((seasonEnded || competitionFinished) && !hasUpcomingOrLive) {
    return {
      status: 'DONE' as const,
      statusLabel: 'אין מה למשוך',
      statusNote: seasonEnded
        ? 'העונה הסתיימה ואין כרגע משחקים עתידיים או חיים בחתך הזה.'
        : 'המפעל הזה כבר הסתיים ואין כרגע מה לעדכן.',
    };
  }

  const freshnessBase = getLatestDate([lastFetchAt, latestCoverageUpdateAt]);
  const hoursSinceFreshnessBase = freshnessBase
    ? (Date.now() - freshnessBase.getTime()) / (1000 * 60 * 60)
    : Number.POSITIVE_INFINITY;

  if (hasUpcomingOrLive && hoursSinceFreshnessBase >= 6) {
    return {
      status: 'STALE' as const,
      statusLabel: 'יש מה לעדכן',
      statusNote: 'יש משחקים עתידיים או חיים, והנתונים לא רועננו בשעות האחרונות.',
    };
  }

  if (!seasonEnded && hoursSinceFreshnessBase >= 72) {
    return {
      status: 'STALE' as const,
      statusLabel: 'יש מה לעדכן',
      statusNote: 'העונה פעילה והנתונים לא רועננו בימים האחרונים.',
    };
  }

  return {
    status: 'FRESH' as const,
    statusLabel: 'מעודכן',
    statusNote: 'יש נתונים שמורים, ונראה שהחתך הזה כבר מעודכן יחסית.',
  };
}

function parseLatestStepSummary(stepsJson: unknown) {
  if (!Array.isArray(stepsJson)) return [];

  return stepsJson
    .map((step) => {
      if (!step || typeof step !== 'object') return null;
      const record = step as Record<string, unknown>;
      const syncedCount = typeof record.syncedCount === 'number' ? record.syncedCount : 0;
      const key = typeof record.key === 'string' ? record.key : '';
      const label = typeof record.label === 'string' ? record.label : key;
      if (!key || syncedCount <= 0) return null;
      return { key, label, syncedCount };
    })
    .filter((step): step is { key: string; label: string; syncedCount: number } => Boolean(step))
    .slice(0, 6);
}

export function buildAdminCoverageRows(seasons: CoverageSeason[]): AdminCoverageRow[] {
  return seasons.flatMap((season) => {
    const seasonEnded = asDate(season.endDate)?.getTime()
      ? asDate(season.endDate)!.getTime() < Date.now()
      : false;

    const seasonCompetitionSources = [
      ...SUPPORTED_COMPETITIONS.map((competition) => ({
        apiFootballId: Number(competition.id),
        nameHe: competition.nameHe,
        nameEn: competition.nameEn,
        countryHe: competition.region === 'ISRAEL' ? 'ישראל' : 'אירופה',
        countryEn: competition.region === 'ISRAEL' ? 'Israel' : 'Europe',
      })),
      ...season.competitions
        .filter((competitionSeason) =>
          !SUPPORTED_COMPETITIONS.some(
            (competition) => competitionSeason.competition.apiFootballId === Number(competition.id)
          )
        )
        .map((competitionSeason) => ({
          apiFootballId: competitionSeason.competition.apiFootballId,
          nameHe: competitionSeason.competition.nameHe,
          nameEn: competitionSeason.competition.nameEn,
          countryHe: competitionSeason.competition.countryHe,
          countryEn: competitionSeason.competition.countryEn,
        })),
    ].filter((competition, index, array) => {
      return (
        array.findIndex(
          (candidate) =>
            candidate.apiFootballId === competition.apiFootballId &&
            candidate.nameEn === competition.nameEn
        ) === index
      );
    });

    return seasonCompetitionSources.map((source) => {
      const competitionSeason = season.competitions.find(
        (entry) => entry.competition.apiFootballId === source.apiFootballId
      );
      const competitionId = competitionSeason?.competitionId || null;
      const scopedGames = competitionId
        ? season.games.filter((game) => game.competitionId === competitionId)
        : [];
      const scopedStandings = competitionId
        ? season.standings.filter((standing) => standing.competitionId === competitionId)
        : [];
      const scopedPlayerStats = competitionId
        ? season.playerStats.filter((stat) => stat.competitionId === competitionId)
        : [];
      const scopedTeamStats = competitionId
        ? season.teamStats.filter((stat) => stat.competitionId === competitionId)
        : [];
      const scopedLeaderboardEntries = competitionId
        ? season.leaderboardEntries.filter((entry) => entry.competitionId === competitionId)
        : [];
      const scopedPredictions = competitionId
        ? season.predictions.filter((entry) => entry.competitionId === competitionId)
        : [];
      const scopedHeadToHead = competitionId
        ? season.headToHeadEntries.filter((entry) => entry.competitionId === competitionId)
        : [];
      const scopedOdds = competitionId
        ? season.oddsValues.filter((entry) => entry.competitionId === competitionId)
        : [];
      const scopedLive = competitionId
        ? season.liveSnapshots.filter(
            (entry) => entry.competitionId === competitionId && entry.feedScope === 'LOCAL'
          )
        : [];
      const scopedJobs = competitionId
        ? season.fetchJobs
            .filter((job) => job.competitionId === competitionId)
            .sort(
              (a, b) =>
                (asDate(b.finishedAt)?.getTime() || asDate(b.createdAt)?.getTime() || 0) -
                (asDate(a.finishedAt)?.getTime() || asDate(a.createdAt)?.getTime() || 0)
            )
        : [];

      const primaryTeamIds = new Set<string>();
      scopedGames.forEach((game) => {
        primaryTeamIds.add(game.homeTeamId);
        primaryTeamIds.add(game.awayTeamId);
      });
      scopedStandings.forEach((standing) => primaryTeamIds.add(standing.teamId));

      const fallbackTeamIds = new Set<string>();
      scopedTeamStats.forEach((stat) => fallbackTeamIds.add(stat.teamId));
      scopedPlayerStats.forEach((stat) => fallbackTeamIds.add(stat.player.teamId));
      scopedLeaderboardEntries.forEach((entry) => {
        if (entry.teamId) fallbackTeamIds.add(entry.teamId);
      });

      const teamIds = primaryTeamIds.size > 0 ? primaryTeamIds : fallbackTeamIds;

      const teamsInScope = season.teams.filter((team) => teamIds.has(team.id));
      const venueIdsInScope = new Set(
        [
          ...teamsInScope.map((team) => team.venueId),
          ...scopedGames.map((game) => game.venueId),
        ].filter((venueId): venueId is string => Boolean(venueId))
      );
      const uniquePlayerIds = new Set(scopedPlayerStats.map((stat) => stat.player.id));
      const latestFetchAt = getLatestDate(
        scopedJobs.map((job) => job.finishedAt || job.createdAt)
      );
      const latestCoverageUpdateAt = getLatestDate([
        competitionSeason?.fixturesUpdatedAt,
        competitionSeason?.standingsUpdatedAt,
        competitionSeason?.playersUpdatedAt,
        ...scopedGames.map((game) => game.updatedAt),
        ...scopedStandings.map((standing) => standing.updatedAt),
        ...scopedPlayerStats.map((stat) => stat.updatedAt),
        ...scopedTeamStats.map((stat) => stat.updatedAt),
        ...scopedLeaderboardEntries.map((entry) => entry.updatedAt),
        ...scopedPredictions.map((entry) => entry.updatedAt),
        ...scopedHeadToHead.map((entry) => entry.updatedAt),
        ...scopedOdds.map((entry) => entry.oddsUpdatedAt || entry.updatedAt),
        ...scopedLive.map((entry) => entry.snapshotAt),
      ]);
      const hasUpcomingOrLive = scopedGames.some((game) => {
        if (game.status === 'ONGOING') return true;
        if (game.status !== 'SCHEDULED') return false;
        const gameDate = asDate(game.dateTime);
        return Boolean(gameDate && gameDate.getTime() >= Date.now() - 3 * 60 * 60 * 1000);
      });
      const latestKnownGameDate = getLatestDate(scopedGames.map((game) => game.dateTime));
      const competitionFinished = Boolean(
        competitionSeason?.competition.type === 'CUP' &&
          scopedGames.length > 0 &&
          !hasUpcomingOrLive &&
          latestKnownGameDate &&
          latestKnownGameDate.getTime() < Date.now() - 12 * 60 * 60 * 1000
      );

      const totalCount =
        teamsInScope.length +
        venueIdsInScope.size +
        uniquePlayerIds.size +
        scopedGames.length +
        scopedStandings.length +
        scopedPredictions.length +
        scopedHeadToHead.length +
        scopedOdds.length +
        scopedLive.length;

      const statusMeta = getStatusMeta({
        hasAnyData: totalCount > 0,
        seasonEnded,
        competitionFinished,
        hasUpcomingOrLive,
        lastFetchAt: latestFetchAt,
        latestCoverageUpdateAt,
      });

      const teamRows: AdminCoverageTeamRow[] = teamsInScope
        .map((team) => {
          const teamGames = scopedGames.filter(
            (game) => game.homeTeamId === team.id || game.awayTeamId === team.id
          );
          const teamPlayerStats = scopedPlayerStats.filter((stat) => stat.player.teamId === team.id);
          const teamStandings = scopedStandings.filter((standing) => standing.teamId === team.id);
          const teamPredictions = scopedPredictions.filter(
            (entry) => entry.game.homeTeamId === team.id || entry.game.awayTeamId === team.id
          );
          const teamH2H = scopedHeadToHead.filter(
            (entry) => entry.game.homeTeamId === team.id || entry.game.awayTeamId === team.id
          );
          const teamOdds = scopedOdds.filter(
            (entry) => entry.game.homeTeamId === team.id || entry.game.awayTeamId === team.id
          );
          const teamLive = scopedLive.filter(
            (entry) =>
              entry.homeTeamApiFootballId === team.apiFootballId ||
              entry.awayTeamApiFootballId === team.apiFootballId ||
              (entry.gameId ? teamGames.some((game) => game.id === entry.gameId) : false)
          );
          const latestTeamFetchAt = getLatestDate(
            scopedJobs
              .filter((job) => job.teamId === team.id)
              .map((job) => job.finishedAt || job.createdAt)
          ) || latestFetchAt;
          const latestTeamUpdateAt = getLatestDate([
            ...teamGames.map((game) => game.updatedAt),
            ...teamPlayerStats.map((stat) => stat.updatedAt),
            ...teamStandings.map((standing) => standing.updatedAt),
            ...teamPredictions.map((entry) => entry.updatedAt),
            ...teamH2H.map((entry) => entry.updatedAt),
            ...teamOdds.map((entry) => entry.oddsUpdatedAt || entry.updatedAt),
            ...teamLive.map((entry) => entry.snapshotAt),
          ]);
          const teamHasUpcomingOrLive = teamGames.some((game) => {
            if (game.status === 'ONGOING') return true;
            if (game.status !== 'SCHEDULED') return false;
            const gameDate = asDate(game.dateTime);
            return Boolean(gameDate && gameDate.getTime() >= Date.now() - 3 * 60 * 60 * 1000);
          });
          const teamTotalCount =
            (team.venueId ? 1 : 0) +
            new Set(teamPlayerStats.map((stat) => stat.player.id)).size +
            teamGames.length +
            teamStandings.length +
            teamPredictions.length +
            teamH2H.length +
            teamOdds.length +
            teamLive.length;
          const teamStatusMeta = getStatusMeta({
            hasAnyData: teamTotalCount > 0 || team._count.players > 0,
            seasonEnded,
            competitionFinished,
            hasUpcomingOrLive: teamHasUpcomingOrLive,
            lastFetchAt: latestTeamFetchAt,
            latestCoverageUpdateAt: latestTeamUpdateAt,
          });

          return {
            key: `${season.id}-${source.apiFootballId || source.nameEn}-${team.id}`,
            teamId: team.id,
            teamNameHe: team.nameHe,
            teamNameEn: team.nameEn,
            rosterPlayersCount: team._count.players,
            playersCount: new Set(teamPlayerStats.map((stat) => stat.player.id)).size,
            gamesCount: teamGames.length,
            standingsCount: teamStandings.length,
            predictionsCount: teamPredictions.length,
            h2hCount: teamH2H.length,
            oddsCount: teamOdds.length,
            liveCount: teamLive.length,
            totalCount: teamTotalCount,
            lastFetchAt: latestTeamFetchAt?.toISOString() || null,
            status: teamStatusMeta.status,
            statusLabel: teamStatusMeta.statusLabel,
            statusNote: teamStatusMeta.statusNote,
          };
        })
        .sort((a, b) => (a.teamNameHe || a.teamNameEn).localeCompare(b.teamNameHe || b.teamNameEn, 'he'));

      return {
        key: `${season.id}-${source.apiFootballId || source.nameEn}`,
        seasonId: season.id,
        seasonLabel: season.name,
        seasonYear: season.year,
        countryLabel: source.countryHe || source.countryEn || 'ללא מדינה',
        competitionApiId: competitionSeason?.competition.apiFootballId ?? source.apiFootballId ?? null,
        competitionNameHe: competitionSeason?.competition.nameHe || source.nameHe,
        competitionNameEn: competitionSeason?.competition.nameEn || source.nameEn,
        teamsCount: teamsInScope.length,
        venuesCount: venueIdsInScope.size,
        playersCount: uniquePlayerIds.size,
        gamesCount: scopedGames.length,
        standingsCount: scopedStandings.length,
        predictionsCount: scopedPredictions.length,
        h2hCount: scopedHeadToHead.length,
        oddsCount: scopedOdds.length,
        liveCount: scopedLive.length,
        totalCount,
        lastFetchAt: latestFetchAt?.toISOString() || null,
        lastCoverageUpdateAt: latestCoverageUpdateAt?.toISOString() || null,
        status: statusMeta.status,
        statusLabel: statusMeta.statusLabel,
        statusNote: statusMeta.statusNote,
        teamRows,
        latestStepSummary: parseLatestStepSummary(scopedJobs[0]?.stepsJson),
      };
    });
  });
}
