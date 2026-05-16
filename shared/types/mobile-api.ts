// shared/types/mobile-api.ts
// Single source of truth for HBStats mobile API JSON contracts.
// Both backend handlers and mobile clients import from here.

import type {
  SafeUser,
  TeamSummary,
  TeamHeader,
  PlayerSummary,
  MatchCard,
  MatchStatus,
  NewsCard,
  StandingRow,
} from './common';

// Re-export domain primitives so consumers can import everything from @shared/types/mobile-api.
export type {
  TeamSummary,
  TeamHeader,
  PlayerSummary,
  MatchCard,
  MatchStatus,
  NewsCard,
  StandingRow,
} from './common';

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// /auth/logout: no body, no response payload.
// /auth/logout-all: no body, no response payload.

// ---------- Errors ----------

export interface ApiError {
  error: string;
  code?: string;
}

// ---------- Home ----------

export interface LiveMatchCompact {
  id: string;
  minute: number | null;
  home: { name: string; score: number | null };
  away: { name: string; score: number | null };
}

export interface CompactStandingRow {
  rank: number;
  teamName: string;
  played: number;
  points: number;
}

// Stats tab — top scorers / assisters / yellow / red cards leaderboards.
export interface StatsLeaderEntry {
  rank: number;
  playerId: string | null;
  playerNameHe: string;
  playerNameEn: string | null;
  teamNameHe: string;
  teamNameEn: string | null;
  value: number;
  gamesPlayed: number | null;
  photoUrl: string | null;
}

export interface StatsCategories {
  topScorers: StatsLeaderEntry[];
  topAssists: StatsLeaderEntry[];
  topYellowCards: StatsLeaderEntry[];
  topRedCards: StatsLeaderEntry[];
}

export interface StatsPayload {
  season: { id: string; year: number; name: string } | null;
  competition: { id: string; nameHe: string; nameEn: string } | null;
  categories: StatsCategories;
}

// Standings tab — full Israeli Premier League table, optionally split into
// championship / relegation playoff groups.
export interface StandingsRow {
  position: number;
  teamId: string;
  teamNameHe: string;
  teamNameEn: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string;             // last 5 results, newest first ("נננתה")
  groupNameEn: string | null;
}

export interface StandingsGroup {
  label: string;            // "ליגת העל" or "קבוצת אליפות"/"קבוצת ירידה"
  rows: StandingsRow[];
}

export interface StandingsPayload {
  season: { id: string; year: number; name: string } | null;
  groups: StandingsGroup[];
}

export interface HomePayload {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  favoriteTeam: TeamSummary | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  compactStandings: CompactStandingRow[];
  liveStrip: LiveMatchCompact[];
  newsStrip: NewsCard[];
}

// ---------- Live ----------

export interface LiveMatchEvent {
  minute: number;
  type: 'goal' | 'yellow' | 'red' | 'sub' | 'penalty';
  player: string | null;
  team: 'home' | 'away';
}

export interface LiveMatchExpanded {
  id: string;
  minute: number | null;
  status: MatchStatus;
  home: { team: TeamSummary; score: number | null };
  away: { team: TeamSummary; score: number | null };
  eventCount: number;
  recentEvents: LiveMatchEvent[];
}

export interface LiveLeagueGroup {
  league: { id: string; nameHe: string; nameEn: string; logo: string | null };
  matches: LiveMatchExpanded[];
}

export interface LivePayload {
  groups: LiveLeagueGroup[];
  lastUpdated: string;
}

// ---------- Match ----------

export interface MatchEvent extends LiveMatchEvent {
  id: string;
  assistPlayer: string | null;
}

export interface LineupPlayer {
  player: PlayerSummary;
  isStarting: boolean;
  position: string | null;
}

export interface Lineup {
  formation: string | null;
  players: LineupPlayer[];
}

export interface MatchStats {
  possession: { home: number; away: number } | null;
  shots: { home: number; away: number } | null;
  shotsOnTarget: { home: number; away: number } | null;
  corners: { home: number; away: number } | null;
  fouls: { home: number; away: number } | null;
  yellowCards: { home: number; away: number } | null;
  redCards: { home: number; away: number } | null;
  offsides: { home: number; away: number } | null;
  xg: { home: number; away: number } | null;
}

export interface H2H {
  lastN: MatchCard[];
  wins: { home: number; away: number; draw: number };
}

export interface MatchPayload {
  match: {
    id: string;
    status: MatchStatus;
    minute: number | null;
    score: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null } | null;
    dates: { kickoff: string; finished: string | null };
    venue: { name: string; city: string | null } | null;
    referee: string | null;
  };
  homeTeam: TeamHeader;
  awayTeam: TeamHeader;
  events: MatchEvent[];
  lineups: { home: Lineup; away: Lineup };
  matchStats: MatchStats | null;
  h2h: H2H | null;
}

// ---------- Team ----------

export interface TeamSeasonStats {
  goalsScored: number;
  goalsAgainst: number;
  cleanSheets: number;
  averageGoalsScored: number;
  averageGoalsAgainst: number;
  topScorer: { player: PlayerSummary; goals: number } | null;
}

export interface TeamPayload {
  team: TeamHeader;
  coach: { name: string; since: string | null } | null;
  standingsContext: { rank: number; points: number; around: StandingRow[] } | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  recentForm: ('W' | 'D' | 'L')[];
  squad: { position: string; players: PlayerSummary[] }[];
  seasonStats: TeamSeasonStats;
}

// ---------- Player (basic, v1.0) ----------

export interface PlayerSeasonStats {
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  subbedIn: number;
  subbedOut: number;
}

export interface PlayerRecentMatch {
  matchId: string;
  opponent: string;
  date: string;
  role: 'started' | 'subbed_in' | 'unused' | 'subbed_out';
  contribution: { goals: number; assists: number; minutes: number };
}

export interface PlayerCareerEntry {
  season: string;          // "2023/2024"
  team: string | null;
  competition: string | null;
  rating: number | null;   // Flashscore average match rating
  apps: number | null;
  goals: number | null;
  assists: number | null;
  yellow: number | null;
  red: number | null;
}

export interface PlayerProfile {
  id: string;
  nameHe: string;
  nameEn: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  position: string | null;
  marketValue: string | null;     // e.g. "€1.2m" — sourced from Flashscore
  contractUntil: string | null;   // ISO date — sourced from Flashscore
}

export interface PlayerPayload {
  player: PlayerProfile;
  currentTeam: TeamSummary | null;
  currentSeasonStats: PlayerSeasonStats | null;
  recentMatches: PlayerRecentMatch[];
  career: PlayerCareerEntry[];
}

// ---------- Preferences ----------

export interface PreferencesPayload {
  favoriteTeamApiIds: number[];
  favoriteCompetitionApiIds: number[];
}
