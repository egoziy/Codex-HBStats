import { getCompetitionById } from '@/lib/competitions';

export function getCompetitionDisplayName(competition?: {
  apiFootballId?: number | null;
  nameHe?: string | null;
  nameEn?: string | null;
}) {
  if (!competition) return 'ללא מסגרת';

  const mapped = competition.apiFootballId ? getCompetitionById(String(competition.apiFootballId)) : null;
  if (mapped) return mapped.nameHe;

  if (competition.nameHe && !competition.nameHe.includes('?')) {
    return competition.nameHe;
  }

  return competition.nameEn || competition.nameHe || 'ללא מסגרת';
}

export function getGameScoreDisplay(game: {
  homeScore: number | null;
  awayScore: number | null;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
}) {
  if (game.status === 'COMPLETED' || game.status === 'ONGOING') {
    return `${game.homeScore ?? 0} - ${game.awayScore ?? 0}`;
  }

  if (game.status === 'CANCELLED') {
    return 'בוטל';
  }

  return 'טרם שוחק';
}
