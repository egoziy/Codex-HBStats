type PlayerNameLike = {
  firstNameHe?: string | null;
  lastNameHe?: string | null;
  nameHe?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  nameEn?: string | null;
};

function normalizePart(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function joinNameParts(...parts: Array<string | null | undefined>) {
  const normalized = parts.map(normalizePart).filter((part): part is string => Boolean(part));
  return normalized.length ? normalized.join(' ') : null;
}

export function formatPlayerName(
  player: PlayerNameLike | null | undefined,
  fallbackHebrew?: string | null,
  fallbackEnglish?: string | null
) {
  const hebrewName = normalizePart(player?.nameHe) || normalizePart(fallbackHebrew);
  if (hebrewName) return hebrewName;

  const hebrewFullName = joinNameParts(player?.firstNameHe, player?.lastNameHe);
  if (hebrewFullName) return hebrewFullName;

  const englishFullName = joinNameParts(player?.firstNameEn, player?.lastNameEn);
  if (englishFullName) return englishFullName;

  return normalizePart(player?.nameEn) || normalizePart(fallbackEnglish) || '-';
}

const POSITION_LABELS: Record<string, string> = {
  G: 'שוער',
  GK: 'שוער',
  GOALKEEPER: 'שוער',
  D: 'מגן',
  DEFENDER: 'מגן',
  M: 'קשר',
  MIDFIELDER: 'קשר',
  F: 'חלוץ',
  FW: 'חלוץ',
  FORWARD: 'חלוץ',
  ATTACKER: 'חלוץ',
  'LEFT BACK': 'מגן שמאלי',
  'RIGHT BACK': 'מגן ימני',
  'CENTER BACK': 'בלם',
  'CENTRE BACK': 'בלם',
  'CENTER MIDFIELD': 'קשר מרכזי',
  'CENTRE MIDFIELD': 'קשר מרכזי',
  'ATTACKING MIDFIELD': 'קשר התקפי',
  'DEFENSIVE MIDFIELD': 'קשר אחורי',
  SUBSTITUTE: 'מחליף',
  COACH: 'מאמן',
};

export function formatPlayerPosition(position: string | null | undefined) {
  const normalized = position?.trim();
  if (!normalized) return 'ללא עמדה';

  const direct = POSITION_LABELS[normalized.toUpperCase()];
  if (direct) return direct;

  return POSITION_LABELS[normalized.toUpperCase().replace(/\s+/g, ' ')] || normalized;
}
