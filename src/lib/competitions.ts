export type SupportedCompetition = {
  id: string;
  nameEn: string;
  nameHe: string;
  kind: 'LEAGUE' | 'CUP';
  notes?: string;
};

export const SUPPORTED_COMPETITIONS: SupportedCompetition[] = [
  {
    id: '383',
    nameEn: "Ligat Ha'al",
    nameHe: 'ליגת העל (כולל פלייאוף)',
    kind: 'LEAGUE',
    notes: 'הפלייאוף העליון והתחתון כלולים במסגרת המחזורים של ליגת העל.',
  },
  {
    id: '382',
    nameEn: 'Liga Leumit',
    nameHe: 'הליגה הלאומית',
    kind: 'LEAGUE',
  },
  {
    id: '496',
    nameEn: 'Liga Alef',
    nameHe: 'ליגה א׳',
    kind: 'LEAGUE',
  },
  {
    id: '384',
    nameEn: 'State Cup',
    nameHe: 'גביע המדינה',
    kind: 'CUP',
  },
  {
    id: '385',
    nameEn: 'Toto Cup Ligat Al',
    nameHe: 'גביע הטוטו',
    kind: 'CUP',
  },
  {
    id: '659',
    nameEn: 'Super Cup',
    nameHe: 'אלוף האלופים',
    kind: 'CUP',
  },
];

export function getCompetitionById(id: string) {
  return SUPPORTED_COMPETITIONS.find((competition) => competition.id === id) || null;
}
