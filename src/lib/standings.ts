type StandingBase = {
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
};

export type StandingWithDerived<T extends StandingBase> = T & {
  adjustedPoints: number;
  goalDifference: number;
  displayPosition: number;
};

export function getAdjustedPoints(standing: Pick<StandingBase, 'points' | 'pointsAdjustment'>) {
  return standing.points + standing.pointsAdjustment;
}

export function sortStandings<T extends StandingBase>(rows: T[]): StandingWithDerived<T>[] {
  return [...rows]
    .sort((a, b) => {
      const adjustedDifference = getAdjustedPoints(b) - getAdjustedPoints(a);
      if (adjustedDifference !== 0) return adjustedDifference;

      const goalDifferenceDelta = b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
      if (goalDifferenceDelta !== 0) return goalDifferenceDelta;

      const goalsForDelta = b.goalsFor - a.goalsFor;
      if (goalsForDelta !== 0) return goalsForDelta;

      return a.position - b.position;
    })
    .map((row, index) => ({
      ...row,
      adjustedPoints: getAdjustedPoints(row),
      goalDifference: row.goalsFor - row.goalsAgainst,
      displayPosition: index + 1,
    }));
}
