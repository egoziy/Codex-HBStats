// FootyStats API client — https://api.football-data-api.com
// Rate limit: 1800 requests/hour → safe interval: 2500ms

const BASE_URL = 'https://api.football-data-api.com';
const MIN_REQUEST_INTERVAL_MS = 2500;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;

let lastRequestAt = 0;
let requestQueue = Promise.resolve();

// ── Season ID maps ────────────────────────────────────────────────────────────
// FootyStats season_id → HBStats season.year (startingYear)
// 16353 is the IPL regular-season-only comp; 16363 is the full season with playoffs.

export const FOOTYSTATS_SEASON_IDS: Record<string, Record<number, number>> = {
  ipl: {
    2013: 531, 2014: 530, 2015: 529, 2016: 528, 2017: 527,
    2018: 1568, 2019: 2283, 2020: 4695, 2021: 6040, 2022: 7448,
    2023: 9564, 2024: 12377, 2025: 16363,
  },
  leumit: {
    2013: 536, 2014: 535, 2015: 534, 2016: 533, 2017: 532,
    2018: 1751, 2019: 2722, 2020: 4694, 2021: 6028, 2022: 7451,
    2023: 9566, 2024: 12406, 2025: 16356,
  },
  stateCup: {
    2019: 4427, 2020: 5227, 2021: 6574, 2022: 8445,
    2023: 11018, 2024: 13730, 2025: 15971,
  },
  ligatAlWomen: {
    2019: 3604, 2020: 5287, 2021: 6763, 2022: 8081,
    2023: 10153, 2024: 13208, 2025: 15515,
  },
  totoCupAl: {
    2019: 3605, 2020: 4609, 2021: 6193, 2022: 8449,
    2023: 9568, 2024: 12374, 2025: 15109,
  },
  totoCupLeumit: {
    2021: 6483, 2022: 7456, 2023: 9563, 2024: 12375, 2025: 15534,
  },
  superCup: {
    2021: 5954, 2022: 7670, 2023: 9608, 2024: 12373, 2025: 14807,
  },
  u19Cup: {
    2020: 5933, 2021: 6761, 2022: 8572, 2023: 11027, 2024: 13614, 2025: 16594,
  },
  u19Elite: {
    2021: 6436, 2022: 8714, 2023: 10056, 2024: 13231, 2025: 15554,
  },
  playOffs2nd: {
    2020: 5871, 2021: 8555, 2022: 9495, 2023: 12041, 2024: 14753, 2025: 16968,
  },
  playOffs3rd: {
    2022: 9494, 2023: 11954,
  },
  stateCupWomen: {
    2022: 12267, 2023: 12268, 2024: 14041, 2025: 16595,
  },
};

// Leagues where match event data (goals/cards/lineups) is available from FootyStats
export const FOOTYSTATS_EVENTS_AVAILABLE_FROM: Record<string, number> = {
  ipl: 2025,
  leumit: 2025,
};

export type FootyStatsLeague =
  | 'ipl' | 'leumit' | 'stateCup'
  | 'ligatAlWomen' | 'totoCupAl' | 'totoCupLeumit'
  | 'superCup' | 'u19Cup' | 'u19Elite'
  | 'playOffs2nd' | 'playOffs3rd' | 'stateCupWomen';

export const FOOTYSTATS_LEAGUE_LABELS: Record<FootyStatsLeague, { nameHe: string; nameEn: string; category: 'league' | 'cup' }> = {
  ipl:            { nameHe: 'ליגת העל',               nameEn: 'Israeli Premier League',   category: 'league' },
  leumit:         { nameHe: 'הליגה הלאומית',           nameEn: 'Liga Leumit',              category: 'league' },
  ligatAlWomen:   { nameHe: 'ליגת העל נשים',           nameEn: 'Ligat Al Women',           category: 'league' },
  u19Elite:       { nameHe: "ליגת עילית נוער U19",     nameEn: 'U19 Elite Division',       category: 'league' },
  stateCup:       { nameHe: 'גביע המדינה',             nameEn: 'State Cup',                category: 'cup'    },
  totoCupAl:      { nameHe: 'גביע הטוטו ליגת העל',    nameEn: 'Toto Cup Ligat Al',        category: 'cup'    },
  totoCupLeumit:  { nameHe: 'גביע הטוטו ליגה לאומית', nameEn: 'Toto Cup Ligat Leumit',    category: 'cup'    },
  superCup:       { nameHe: 'גביע העל',               nameEn: 'Super Cup',                category: 'cup'    },
  u19Cup:         { nameHe: "גביע נוער U19",           nameEn: 'U19 Cup',                  category: 'cup'    },
  stateCupWomen:  { nameHe: 'גביע המדינה נשים',        nameEn: 'State Cup Women',          category: 'cup'    },
  playOffs2nd:    { nameHe: "פלייאוף ליגה לאומית",    nameEn: 'Play Offs 2nd Division',   category: 'cup'    },
  playOffs3rd:    { nameHe: "פלייאוף ליגה א'",        nameEn: 'Play Offs 3rd Division',   category: 'cup'    },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type FSTeam = {
  id: number;
  name: string;
  english_name: string;
  full_name: string;
  image: string;
  table_position: number;
  stadium_name: string | null;
  stadium_address: string | null;
  stats: Record<string, number | null>;
};

export type FSMatch = {
  id: number;
  homeID: number;
  awayID: number;
  home_name: string;
  away_name: string;
  date_unix: number;
  game_week: number;
  revised_game_week: number;
  status: string; // 'complete' | 'incomplete' | 'suspended' | 'live' | 'canceled'
  homeGoalCount: number | null;
  awayGoalCount: number | null;
  team_a_corners: number | null;
  team_b_corners: number | null;
  team_a_yellow_cards: number | null;
  team_b_yellow_cards: number | null;
  team_a_red_cards: number | null;
  team_b_red_cards: number | null;
  team_a_shotsOnTarget: number | null;
  team_b_shotsOnTarget: number | null;
  team_a_shots: number | null;
  team_b_shots: number | null;
  team_a_fouls: number | null;
  team_b_fouls: number | null;
  team_a_possession: number | null;
  team_b_possession: number | null;
  team_a_offsides: number | null;
  team_b_offsides: number | null;
  team_a_xg: number | null;
  team_b_xg: number | null;
  total_xg: number | null;
  competition_id: number;
  // Odds
  odds_ft_1: number | null;
  odds_ft_x: number | null;
  odds_ft_2: number | null;
  odds_ft_over25: number | null;
  odds_ft_under25: number | null;
  odds_btts_yes: number | null;
  odds_btts_no: number | null;
};

export type FSMatchDetail = FSMatch & {
  team_a_goal_details: FSGoalEvent[] | null;
  team_b_goal_details: FSGoalEvent[] | null;
  team_a_card_details: FSCardEvent[] | null;
  team_b_card_details: FSCardEvent[] | null;
  lineup: {
    home: FSLineupSide;
    away: FSLineupSide;
  } | null;
  substitutions: {
    home: FSSubstitution[];
    away: FSSubstitution[];
  } | null;
};

export type FSGoalEvent = {
  player_id: number;
  time: string;
  extra: string | null;
  assist_player_id: number | null;
  type: string; // 'Right foot shot' | 'Left foot shot' | 'Header' | 'Own goal' | 'Penalty'
};

export type FSCardEvent = {
  player_id: number;
  time: string;
  card: string; // 'yellow card' | 'red card' | 'yellow/red card'
  extra?: string | null;
};

export type FSLineupSide = {
  starting_eleven: FSLineupPlayer[];
  substitutes: FSLineupPlayer[];
};

export type FSLineupPlayer = {
  player_id: number;
  shirt_number: number | null;
  position: string | null;
};

export type FSSubstitution = {
  player_in_id: number;
  player_out_id: number;
  time: string;
};

export type FSPlayer = {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  known_as: string;
  age: number | null;
  height: number | null;
  weight: number | null;
  birthday: number | null;
  nationality: string | null;
  position: string | null;
  club_team_id: number;
  url: string;
  minutes_played_overall: number | null;
  minutes_played_home: number | null;
  minutes_played_away: number | null;
  appearances_overall: number | null;
  appearances_home: number | null;
  appearances_away: number | null;
  goals_overall: number | null;
  goals_home: number | null;
  goals_away: number | null;
  assists_overall: number | null;
  assists_home: number | null;
  assists_away: number | null;
  yellow_cards_overall: number | null;
  red_cards_overall: number | null;
  goals_per_90_overall: number | null;
  assists_per_90_overall: number | null;
  min_per_goal_overall: number | null;
  cards_per_90_overall: number | null;
  goals_involved_per_90_overall: number | null;
  rank_in_league_top_attackers: number | null;
  rank_in_league_top_midfielders: number | null;
  rank_in_league_top_defenders: number | null;
  rank_in_club_top_scorer: number | null;
  penalty_goals: number | null;
  clean_sheets_overall: number | null;
};

export type FSReferee = {
  id: number;
  full_name: string;
  nationality: string | null;
  total_matches: number | null;
  total_yellow_cards: number | null;
  total_red_cards: number | null;
  home_wins: number | null;
  away_wins: number | null;
  draws: number | null;
  avg_yellow_cards_per_game: number | null;
  avg_red_cards_per_game: number | null;
};

// ── Rate-limited HTTP client ──────────────────────────────────────────────────

export class FootyStatsRateLimitError extends Error {
  code = 'FOOTYSTATS_RATE_LIMIT';
  statusCode = 429;
  constructor(message: string) {
    super(message);
    this.name = 'FootyStatsRateLimitError';
  }
}

export function isFootyStatsRateLimitError(err: unknown): err is FootyStatsRateLimitError {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as any).code === 'FOOTYSTATS_RATE_LIMIT');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleRequest() {
  const queueTurn = requestQueue.catch(() => undefined);
  let releaseQueue: () => void = () => undefined;
  requestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await queueTurn;
  const waitMs = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
  return () => releaseQueue();
}

async function performFetch(path: string, attempt = 0): Promise<any> {
  const key = process.env.FOOTYSTATS_API_KEY;
  if (!key) throw new Error('FOOTYSTATS_API_KEY is missing.');

  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}key=${key}`;

  const releaseQueue = await scheduleRequest();

  try {
    const res = await fetch(url, { cache: 'no-store' });

    if (res.status === 429) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        return performFetch(path, attempt + 1);
      }
      throw new FootyStatsRateLimitError('FootyStats rate limit exceeded.');
    }

    const payload = await res.json();

    if (payload?.success === false && /limit/i.test(payload?.message || '')) {
      throw new FootyStatsRateLimitError(payload.message || 'Rate limit.');
    }

    if (!res.ok) throw new Error(`FootyStats error ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);

    return payload;
  } finally {
    releaseQueue();
  }
}

export type FSLeagueEntry = {
  name: string;
  image?: string;
  country: string;
  // season is an array; year is encoded as 20172018 (→ start year 2017) or plain 2019
  season: Array<{ id: number; year: number; country: string }>;
};

// ── Public API wrappers ───────────────────────────────────────────────────────

export async function fsGetLeagueTeams(seasonId: number): Promise<FSTeam[]> {
  const payload = await performFetch(`/league-teams?season_id=${seasonId}`);
  return payload?.data || [];
}

export async function fsGetLeagueMatches(seasonId: number, page = 1): Promise<FSMatch[]> {
  const payload = await performFetch(`/league-matches?season_id=${seasonId}&page=${page}`);
  return payload?.data || [];
}

export async function fsGetAllLeagueMatches(seasonId: number): Promise<FSMatch[]> {
  const allMatches: FSMatch[] = [];
  let page = 1;
  while (true) {
    const batch = await fsGetLeagueMatches(seasonId, page);
    allMatches.push(...batch);
    if (batch.length < 150) break; // FootyStats default page size ≤ 150
    page++;
  }
  return allMatches;
}

export async function fsGetMatchDetail(matchId: number): Promise<FSMatchDetail | null> {
  const payload = await performFetch(`/match?match_id=${matchId}`);
  return payload?.data || null;
}

export async function fsGetLeaguePlayers(seasonId: number, page = 1): Promise<FSPlayer[]> {
  const payload = await performFetch(`/league-players?season_id=${seasonId}&page=${page}`);
  return payload?.data || [];
}

export async function fsGetAllLeaguePlayers(seasonId: number): Promise<FSPlayer[]> {
  const allPlayers: FSPlayer[] = [];
  let page = 1;
  while (true) {
    const batch = await fsGetLeaguePlayers(seasonId, page);
    allPlayers.push(...batch);
    if (batch.length < 200) break; // page size ≤ 200
    page++;
  }
  return allPlayers;
}

export async function fsGetTodayMatches(): Promise<FSMatch[]> {
  const payload = await performFetch('/today-matches');
  return payload?.data || [];
}

export async function fsGetLeagueSeason(seasonId: number): Promise<any | null> {
  const payload = await performFetch(`/league-season?season_id=${seasonId}`);
  const d = payload?.data;
  return Array.isArray(d) ? (d[0] ?? null) : (d ?? null);
}

export async function fsGetLeagueReferees(seasonId: number): Promise<FSReferee[]> {
  const payload = await performFetch(`/league-referees?season_id=${seasonId}`);
  return payload?.data || [];
}

export async function fsGetLeagueList(): Promise<FSLeagueEntry[]> {
  const payload = await performFetch('/league-list?chosen_leagues_only=false');
  return payload?.data || [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fsGoalTypeToEventNote(type: string | null | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('own goal')) return 'Own Goal';
  if (t.includes('penalty')) return 'Penalty';
  return null;
}

export function fsCardToEventType(card: string): 'YELLOW_CARD' | 'RED_CARD' | 'YELLOW_RED_CARD' {
  const c = card.toLowerCase();
  if (c.includes('yellow/red') || c.includes('second yellow')) return 'YELLOW_RED_CARD';
  if (c.includes('red')) return 'RED_CARD';
  return 'YELLOW_CARD';
}

export function fsUnixToDate(unix: number): Date {
  return new Date(unix * 1000);
}
