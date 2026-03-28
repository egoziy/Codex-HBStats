export type SupportedCompetition = {
  id: string;
  nameEn: string;
  nameHe: string;
  kind: 'LEAGUE' | 'CUP';
  region: 'ISRAEL' | 'EUROPE';
  notes?: string;
};

export const SUPPORTED_COMPETITIONS: SupportedCompetition[] = [
  {
    id: '383',
    nameEn: "Ligat Ha'al",
    nameHe: 'ליגת העל (כולל פלייאוף)',
    kind: 'LEAGUE',
    region: 'ISRAEL',
    notes: 'הפלייאוף העליון והתחתון כלולים במסגרת המחזורים של ליגת העל.',
  },
  {
    id: '382',
    nameEn: 'Liga Leumit',
    nameHe: 'הליגה הלאומית',
    kind: 'LEAGUE',
    region: 'ISRAEL',
  },
  {
    id: '496',
    nameEn: 'Liga Alef',
    nameHe: 'ליגה א׳',
    kind: 'LEAGUE',
    region: 'ISRAEL',
  },
  {
    id: '384',
    nameEn: 'State Cup',
    nameHe: 'גביע המדינה',
    kind: 'CUP',
    region: 'ISRAEL',
  },
  {
    id: '385',
    nameEn: 'Toto Cup Ligat Al',
    nameHe: 'גביע הטוטו',
    kind: 'CUP',
    region: 'ISRAEL',
  },
  {
    id: '659',
    nameEn: 'Super Cup',
    nameHe: 'אלוף האלופים',
    kind: 'CUP',
    region: 'ISRAEL',
  },
  {
    id: '2',
    nameEn: 'UEFA Champions League',
    nameHe: 'ליגת האלופות',
    kind: 'CUP',
    region: 'EUROPE',
    notes: 'כולל מוקדמות, פלייאוף ושלב בתים/ליגה לפי סבב המשחק ב-API.',
  },
  {
    id: '3',
    nameEn: 'UEFA Europa League',
    nameHe: 'הליגה האירופית',
    kind: 'CUP',
    region: 'EUROPE',
    notes: 'כולל מוקדמות, פלייאוף ושלב בתים/ליגה לפי סבב המשחק ב-API.',
  },
  {
    id: '848',
    nameEn: 'UEFA Europa Conference League',
    nameHe: 'קונפרנס ליג',
    kind: 'CUP',
    region: 'EUROPE',
    notes: 'כולל מוקדמות, פלייאוף ושלב ליגה לפי סבב המשחק ב-API.',
  },
];

export function getCompetitionById(id: string) {
  return SUPPORTED_COMPETITIONS.find((competition) => competition.id === id) || null;
}
