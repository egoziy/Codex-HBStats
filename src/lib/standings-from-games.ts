import { sortStandings } from './standings';

type TeamName = {
  id: string;
  nameHe: string;
  nameEn: string;
  logoUrl: string | null;
};

type GameForStandings = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  roundNameEn?: string | null;
};

type DerivedStandingRow = {
  id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
  teamId: string;
  team: TeamName;
  groupNameEn?: string;
};

/**
 * Build a league table directly from completed games. Inspects each game's
 * `roundNameEn` and, when 'Championship Group' / 'Relegation Group' rounds
 * are present, splits teams into the two playoff groups — championship teams
 * fill positions 1..N regardless of point totals (Israeli league convention).
 *
 * Used by /standings and /statistics when the stored Standing rows are
 * end-of-regular-season snapshots that don't carry the playoff group info.
 */
export function buildStandingsFromGames(teams: TeamName[], games: GameForStandings[]) {
  const rows = new Map<string, DerivedStandingRow>();
  const teamPlayoffGroup = new Map<string, 'championship' | 'relegation' | null>();

  for (const team of teams) {
    rows.set(team.id, {
      id: `derived-${team.id}`,
      position: 999,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      pointsAdjustment: 0,
      pointsAdjustmentNoteHe: null,
      teamId: team.id,
      team,
    });
    teamPlayoffGroup.set(team.id, null);
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;
    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) continue;

    const round = game.roundNameEn || '';
    if (/championship/i.test(round)) {
      teamPlayoffGroup.set(game.homeTeamId, 'championship');
      teamPlayoffGroup.set(game.awayTeamId, 'championship');
    } else if (/relegation/i.test(round)) {
      teamPlayoffGroup.set(game.homeTeamId, 'relegation');
      teamPlayoffGroup.set(game.awayTeamId, 'relegation');
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      continue;
    }
    if (game.homeScore < game.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      continue;
    }
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }

  const allRows = [...rows.values()];
  const champRows = allRows.filter((r) => teamPlayoffGroup.get(r.teamId) === 'championship');
  const relRows = allRows.filter((r) => teamPlayoffGroup.get(r.teamId) === 'relegation');

  if (champRows.length > 0 && relRows.length > 0) {
    let pos = 1;
    return [
      ...sortStandings(champRows.map((r) => ({ ...r, groupNameEn: 'Championship Group' }))).map((r) => ({ ...r, position: pos++ })),
      ...sortStandings(relRows.map((r) => ({ ...r, groupNameEn: 'Relegation Group' }))).map((r) => ({ ...r, position: pos++ })),
    ];
  }

  let fallbackPosition = 1;
  return sortStandings(allRows.map((row) => ({ ...row, position: fallbackPosition++ })));
}

/**
 * Returns true if the stored Standing.played values are behind the highest
 * round number visible in completed games — indicating playoff games have
 * been played but the Standing snapshot is end-of-regular-season.
 */
export function shouldDeriveStandings(
  storedStandings: Array<{ played: number; groupNameEn?: string | null }>,
  completedGames: Array<{ roundNameEn?: string | null }>,
): boolean {
  if (storedStandings.length === 0) return true;
  const hasPlayoffGroupInfo = storedStandings.some(
    (s) => /championship/i.test(s.groupNameEn || '') || /relegation/i.test(s.groupNameEn || ''),
  );
  if (hasPlayoffGroupInfo) return false; // stored standings already reflect playoff
  const maxRoundInStandings = Math.max(0, ...storedStandings.map((s) => s.played));
  const maxRoundInGames = completedGames.reduce((max, g) => {
    const m = g.roundNameEn?.match(/(\d+)\s*$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return maxRoundInGames > maxRoundInStandings;
}
