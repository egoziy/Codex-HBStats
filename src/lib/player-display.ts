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
  const hebrewFullName = joinNameParts(player?.firstNameHe, player?.lastNameHe);
  if (hebrewFullName) return hebrewFullName;

  const hebrewName = normalizePart(player?.nameHe) || normalizePart(fallbackHebrew);
  if (hebrewName) return hebrewName;

  const englishFullName = joinNameParts(player?.firstNameEn, player?.lastNameEn);
  if (englishFullName) return englishFullName;

  return normalizePart(player?.nameEn) || normalizePart(fallbackEnglish) || '-';
}
