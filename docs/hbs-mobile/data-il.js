// Real Israeli Premier League (ליגת העל) data — 2025/26 season.
// Numbers reflect the screenshots of the live HBS Stats site.
// Team identity colors are placeholders — swap to real crests when handing off.

// abbr is a short 1-3 Hebrew-letter monogram for the placeholder badge.
const IL_TEAM_DEFS = [
  ['HBS', 'הפועל באר שבע',         'באר',  '#C8102E', '#FFFFFF'],
  ['BJR', 'בית"ר ירושלים',         'בית',  '#FFD500', '#0F0F0F'],
  ['MTA', 'מכבי תל אביב',          'מכבי', '#F4D03F', '#0A4A21'],
  ['HTA', 'הפועל תל אביב',         'הפועל', '#C8102E', '#FFFFFF'],
  ['MHA', 'מכבי חיפה',             'חיפה', '#0E7C36', '#FFFFFF'],
  ['HPT', 'הפועל פתח תקווה',       'פ"ת',  '#A82C2C', '#FFFFFF'],
  ['MNT', 'מכבי נתניה',            'נתניה', '#1F3A8A', '#FBBF24'],
  ['IKS', 'עירוני קריית שמונה',    'ק"ש',  '#C8102E', '#0F0F0F'],
  ['BSK', 'בני סכנין',              'סכ',   '#A21824', '#FFFFFF'],
  ['ITB', 'עירוני טבריה',          'טבריה', '#1E40AF', '#FFFFFF'],
  ['HHA', 'הפועל חיפה',            'ח"פ',  '#C8102E', '#0A0A0A'],
  ['HKJ', 'הפועל קטמון ירושלים',   'קטמון', '#B91C1C', '#FFFFFF'],
  ['MSA', 'מ.ס. אשדוד',             'אש',  '#FB923C', '#0A0A0A'],
  ['MBR', 'מכבי בני ריינה',         'ריינה', '#0F4C5C', '#FBBF24'],
];

const IL_TEAMS = Object.fromEntries(
  IL_TEAM_DEFS.map(([abbr, name, mono, bg, fg]) => [abbr, { abbr, name, mono, bg, fg }])
);

// Standings rows: [pos, abbr, P, W, D, L, GF, GA, form (newest first, Hebrew letters)]
// Hebrew letters: נ=win, ת=draw, ה=loss
const IL_ROWS = [
  [ 1, 'HBS', 33, 22, 7, 4, 71, 31, 'נננתנ'],
  [ 2, 'BJR', 33, 21, 8, 4, 75, 38, 'ננתננ'],
  [ 3, 'MTA', 31, 17, 8, 6, 64, 38, 'ננהננ'],
  [ 4, 'HTA', 32, 18, 7, 7, 53, 28, 'תננתנ'],
  [ 5, 'MHA', 32, 13, 9, 10, 56, 40, 'נתננה'],
  [ 6, 'HPT', 33, 9, 10, 14, 45, 54, 'הההתנ'],
  [ 7, 'MNT', 31, 13, 5, 13, 54, 61, 'הננתה'],
  [ 8, 'IKS', 31, 10, 7, 14, 44, 50, 'תננתה'],
  [ 9, 'BSK', 31, 8, 10, 13, 28, 42, 'הההתנ'],
  [10, 'ITB', 31, 10, 8, 13, 42, 56, 'התננת'],
  [11, 'HHA', 31, 7, 9, 15, 35, 50, 'התתהנ'],
  [12, 'HKJ', 31, 6, 10, 15, 25, 41, 'התננה'],
  [13, 'MSA', 31, 5, 10, 16, 35, 59, 'תהההת'],
  [14, 'MBR', 31, 6, 4, 21, 25, 64, 'נננתת'],
];

const IL_STANDINGS = IL_ROWS.map(([pos, abbr, p, w, d, l, gf, ga, form]) => {
  const team = IL_TEAMS[abbr];
  const pts = w * 3 + d;
  const gd = gf - ga;
  return { pos, ...team, p, w, d, l, gf, ga, gd, pts, form, next: null };
});

// Each team's next opponent (matchday)
const NEXT_OPP = {
  HBS: 'MTA', BJR: 'MHA', MTA: 'HBS', HTA: 'HPT', MHA: 'BJR', HPT: 'HTA',
  MNT: 'IKS', IKS: 'MNT', BSK: 'ITB', ITB: 'BSK', HHA: 'MSA', HKJ: 'MBR',
  MSA: 'HHA', MBR: 'HKJ',
};
IL_STANDINGS.forEach((r) => { r.next = NEXT_OPP[r.abbr]; });

// Movement vs last week — for trend arrows
const IL_MOVES = { HBS:1,BJR:2,MTA:4,HTA:3,MHA:5,HPT:7,MNT:6,IKS:9,BSK:8,ITB:11,HHA:10,HKJ:13,MSA:12,MBR:14 };
IL_STANDINGS.forEach((r) => { r.prev = IL_MOVES[r.abbr]; r.move = r.prev - r.pos; });

// Zone for IL: top 6 = upper playoff, bottom 8 = lower playoff.
// Within those: top-of-top = European spots, bottom-of-bottom = relegation.
function ilZone(pos) {
  if (pos === 1) return 'champ';        // champion
  if (pos <= 2) return 'cl';            // Champions League qualifying
  if (pos <= 4) return 'el';            // Europa
  if (pos <= 6) return 'upper';         // upper playoff
  if (pos >= 13) return 'rel';          // relegation playoff
  return 'lower';                       // lower playoff
}

// Fixtures — matchday 34 (Sat 16 May 2026 area)
const IL_FIXTURES = [
  { day: 'היום',     date: 'שבת · 16 במאי', matches: [
    { home: 'HBS', away: 'MTA', time: '20:00', status: 'live', mins: 67, hs: 2, as: 1, comp: 'פלייאוף עליון · מחזור 35' },
    { home: 'BJR', away: 'MHA', time: '17:30', status: 'live', mins: 33, hs: 1, as: 0, comp: 'פלייאוף עליון · מחזור 35' },
    { home: 'HTA', away: 'HPT', time: '21:00', status: 'upcoming', comp: 'פלייאוף עליון · מחזור 35' },
  ]},
  { day: 'מחר',      date: 'ראשון · 17 במאי', matches: [
    { home: 'MNT', away: 'IKS', time: '17:00', status: 'upcoming', comp: 'פלייאוף תחתון · מחזור 35' },
    { home: 'BSK', away: 'ITB', time: '19:30', status: 'upcoming', comp: 'פלייאוף תחתון · מחזור 35' },
    { home: 'HHA', away: 'MSA', time: '20:30', status: 'upcoming', comp: 'פלייאוף תחתון · מחזור 35' },
  ]},
  { day: 'שני',      date: 'שני · 18 במאי', matches: [
    { home: 'HKJ', away: 'MBR', time: '20:00', status: 'upcoming', comp: 'פלייאוף תחתון · מחזור 35' },
  ]},
  { day: 'סוף השבוע שעבר', date: 'שבת · 9 במאי', matches: [
    { home: 'HBS', away: 'BJR', status: 'ft', hs: 1, as: 1, comp: 'פלייאוף עליון · מחזור 33' },
    { home: 'MTA', away: 'HTA', status: 'ft', hs: 2, as: 1, comp: 'פלייאוף עליון · מחזור 33' },
    { home: 'MHA', away: 'HPT', status: 'ft', hs: 3, as: 0, comp: 'פלייאוף עליון · מחזור 33' },
    { home: 'MNT', away: 'BSK', status: 'ft', hs: 0, as: 0, comp: 'פלייאוף תחתון · מחזור 33' },
    { home: 'IKS', away: 'HHA', status: 'ft', hs: 1, as: 2, comp: 'פלייאוף תחתון · מחזור 33' },
  ]},
];

// Top scorers — from real screenshot data
const IL_SCORERS = [
  { rank: 1, name: 'אדרין אוגריז',        team: 'IKS', goals: 16, assists: 4,  apps: 30, mins: 2670 },
  { rank: 2, name: 'דור פרץ',              team: 'MTA', goals: 15, assists: 6,  apps: 28, mins: 2380 },
  { rank: 3, name: 'דן ביטון',             team: 'HBS', goals: 15, assists: 3,  apps: 24, mins: 2126 },
  { rank: 4, name: 'ירדן שועה',            team: 'BJR', goals: 15, assists: 8,  apps: 31, mins: 2640 },
  { rank: 5, name: 'עומר אצילי',           team: 'BJR', goals: 14, assists: 11, apps: 29, mins: 2480 },
  { rank: 6, name: 'איגור זלאטנוביץ',     team: 'HBS', goals: 14, assists: 5,  apps: 31, mins: 2435 },
  { rank: 7, name: 'הריברטו בורגס',       team: 'MNT', goals: 10, assists: 2,  apps: 27, mins: 2210 },
  { rank: 8, name: 'קינגס קנגוואה',        team: 'HBS', goals: 11, assists: 7,  apps: 31, mins: 2576 },
];

// Top assisters
const IL_ASSISTERS = [
  { rank: 1, name: 'רועי רביבו',           team: 'MTA', goals: 4,  assists: 12, apps: 30, mins: 2540 },
  { rank: 2, name: 'הריברטו בורגס',       team: 'MNT', goals: 10, assists: 10, apps: 27, mins: 2210 },
  { rank: 3, name: 'קינגס קנגוואה',        team: 'HBS', goals: 11, assists: 7,  apps: 31, mins: 2576 },
  { rank: 4, name: 'אליאל פרץ',            team: 'HBS', goals: 6,  assists: 7,  apps: 32, mins: 2438 },
  { rank: 5, name: 'עומר אצילי',           team: 'BJR', goals: 14, assists: 11, apps: 29, mins: 2480 },
];

// Suspended players ("מורחקים")
const IL_SUSPENDED = [
  { name: 'ירדן כהן',       team: 'BJR', reason: '5 כרטיסים צהובים — הרחקה' },
  { name: 'בקרי קונט',      team: 'MNT', reason: 'כרטיס אדום בפלייאוף תחתון · מחזור 33' },
  { name: 'בילאל שהן',      team: 'IKS', reason: '9 כרטיסים צהובים — הרחקה' },
];

// Caution from suspension ("זהירות מהרחקה")
const IL_CAUTIONS = [
  { name: 'ברין קרבלי',     team: 'BJR', cards: 8 },
  { name: 'גריגורי מורוזוב', team: 'BJR', cards: 8 },
  { name: 'אחמד סלמן',      team: 'BSK', cards: 8 },
  { name: 'מרון גנטוס',     team: 'BSK', cards: 8 },
  { name: 'אלון אזוגי',     team: 'BSK', cards: 4 },
];

// News teasers ("חדשות")
const IL_NEWS = [
  { title: 'צדיק בסדום: ליאב נחמני על הסיפור של אתמול. עדות של חייל ביחידה מובחרת, אוהד הפועל', source: 'וסרמיליה', when: '13 במאי, 10:39' },
  { title: 'בהנהלת הפועל ת"א העבירו כ-3,000 כרטיסים למשחק בשישי. בנוסף העבירו מסרים שיוכלו ל…', source: 'וסרמיליה', when: '13 במאי, 9:58' },
  { title: 'היעד הבא: בלומפילד 🃟 מכירת הכרטיסים תתבצע באופן הבא: 1️⃣ בעלי מנויי חוץ זכאים', source: 'וסרמיליה', when: '13 במאי, 9:51' },
  { title: '7 גמרים מאחורינו. נותרו עוד 4 גמרים – 360 דקות בלבד של מלחמה על הדשא ובייצוגים', source: 'וסרמיליה', when: '13 במאי, 8:40' },
];

// One detailed match — HBS vs BJR
const IL_MATCH_DETAIL = {
  home: 'HBS', away: 'BJR',
  hs: 1, as: 1,
  status: 'ft',
  date: '12 במאי, 2026 · 20:30',
  comp: 'פלייאוף עליון · מחזור 33',
  ref: 'ספיר ברמן',
  stats: {
    possession: [49, 51],
    shotsOnTarget: [4, 1],
    shots: [14, 6],
    cards: [1, 1],
    subs: [5, 3],
    corners: [3, 1],
    xg: [1.4, 0.9],
  },
  homeForm: 'נננתנ',
  awayForm: 'ננתננ',
  events: [
    { type: 'goal', team: 'home', mins: 23, player: 'דן ביטון', assist: 'קינגס קנגוואה' },
    { type: 'yellow', team: 'away', mins: 37, player: 'ברין קרבלי' },
    { type: 'goal', team: 'away', mins: 58, player: 'עומר אצילי', assist: 'ירדן שועה' },
    { type: 'sub', team: 'home', mins: 71, on: 'הלדר לופס', off: 'מתן בלטקסה' },
    { type: 'yellow', team: 'home', mins: 84, player: 'גיא מזרחי' },
  ],
};

// One player detail — Igor Zlatanovic (HBS striker #66)
const IL_PLAYER_DETAIL = {
  name: 'איגור זלאטנוביץ',
  team: 'HBS', shirt: 66, pos: 'חלוץ', nat: 'סרביה',
  age: 27, height: 185,
  goals: 14, assists: 5, apps: 34, starts: 30, mins: 2525,
  shots: 35, keyPasses: 18, dribblesWon: 5, dribblesTried: 11,
  passes: 298, passPct: 78, won: 12, lost: 2,
  yellows: 4, foulsCommitted: 31, foulsSuffered: 17,
  cards: [
    { date: '09.02.26', text: 'בית מול בית"ר ירושלים', min: 90, kind: 'yellow' },
    { date: '02.12.25', text: 'חוץ מול הפועל פתח תקווה', min: 37, kind: 'yellow' },
    { date: '03.11.25', text: 'חוץ מול בית"ר ירושלים', min: 4, kind: 'yellow' },
    { date: '13.07.25', text: 'חוץ מול מכבי תל אביב', min: 70, kind: 'yellow' },
  ],
};

// Live match ticker — for the header marquee
const IL_TICKER = [
  { home: 'HBS', away: 'MTA', hs: 2, as: 1, status: 'live', mins: 67 },
  { home: 'BJR', away: 'MHA', hs: 1, as: 0, status: 'live', mins: 33 },
  { home: 'HTA', away: 'HPT', status: 'soon', time: '21:00' },
  { home: 'MNT', away: 'IKS', status: 'soon', time: '17:00 מחר' },
];

window.IL = {
  TEAMS: IL_TEAMS,
  STANDINGS: IL_STANDINGS,
  FIXTURES: IL_FIXTURES,
  SCORERS: IL_SCORERS,
  ASSISTERS: IL_ASSISTERS,
  SUSPENDED: IL_SUSPENDED,
  CAUTIONS: IL_CAUTIONS,
  NEWS: IL_NEWS,
  MATCH_DETAIL: IL_MATCH_DETAIL,
  PLAYER_DETAIL: IL_PLAYER_DETAIL,
  TICKER: IL_TICKER,
  zone: ilZone,
};
