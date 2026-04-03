import { getCompetitionById } from '@/lib/competitions';

const ROUND_TRANSLATIONS: Record<string, string> = {
  'Quarter-finals': 'רבע גמר',
  'Semi-finals': 'חצי גמר',
  Final: 'גמר',
  'Round of 16': 'שמינית גמר',
  'Round of 32': 'סיבוב 32 האחרונות',
  'Regular Season': 'מחזור',
};

const COMPETITION_TRANSLATIONS: Record<string, string> = {
  "Ligat Ha'al": 'ליגת העל',
};

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

  const fallbackName = competition.nameEn || competition.nameHe || '';
  return COMPETITION_TRANSLATIONS[fallbackName] || fallbackName || 'ללא מסגרת';
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

export function getRoundDisplayName(roundHe?: string | null, roundEn?: string | null) {
  const rawRound = (roundHe || roundEn || '').trim();
  if (!rawRound) return 'ללא מחזור';

  const regularSeasonMatch = rawRound.match(/^Regular Season\s*-\s*(\d+)$/i);
  if (regularSeasonMatch) {
    return `מחזור ${regularSeasonMatch[1]}`;
  }

  const championshipRoundMatch = rawRound.match(/^Championship Round\s*-\s*(\d+)$/i);
  if (championshipRoundMatch) {
    return `פלייאוף עליון - מחזור ${championshipRoundMatch[1]}`;
  }

  const relegationRoundMatch = rawRound.match(/^Relegation Round\s*-\s*(\d+)$/i);
  if (relegationRoundMatch) {
    return `פלייאוף תחתון - מחזור ${relegationRoundMatch[1]}`;
  }

  return ROUND_TRANSLATIONS[rawRound] || rawRound;
}
