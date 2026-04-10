const fs = require('fs');
const path = require('path');

const rows = [
  {
    resource: 'countries',
    endpoint: '/countries',
    apiFields: 'name, code, flag',
    localModels: 'CountryCatalog',
    localFields: 'nameEn, nameHe, code, flagUrl',
    status: 'stored',
    note: 'Full country catalog mapping used by the app.',
  },
  {
    resource: 'seasons',
    endpoint: '/leagues/seasons',
    apiFields: 'year',
    localModels: 'Season',
    localFields: 'year plus derived name/startDate/endDate',
    status: 'stored',
    note: 'The API only returns the year. We store that value locally and derive display dates.',
  },
  {
    resource: 'leagues',
    endpoint: '/leagues?country={country}&season={season}',
    apiFields: 'league.id, league.name, league.logo, league.type, country.name',
    localModels: 'Competition, CompetitionSeason',
    localFields: 'apiFootballId, nameEn, nameHe, logoUrl, type, countryEn, countryHe',
    status: 'stored',
    note: 'CompetitionSeason now also keeps the season-specific payload in JSON.',
  },
  {
    resource: 'competitions',
    endpoint: 'none in fetch route',
    apiFields: 'n/a',
    localModels: 'CompetitionSeason',
    localFields: 'completion marker only',
    status: 'local_only',
    note: 'This is an internal job step, not a separate API-Football service.',
  },
  {
    resource: 'teams',
    endpoint: '/teams?league={leagueId}&season={seasonYear}',
    apiFields: 'team.id, team.name, team.code, team.country, team.founded, team.logo',
    localModels: 'Team',
    localFields: 'apiFootballId, nameEn, nameHe, code, countryEn, countryHe, founded, logoUrl',
    status: 'stored',
    note: 'Core team identity is saved. Logo may be replaced by a locally stored copy.',
  },
  {
    resource: 'teams',
    endpoint: '/teams?league={leagueId}&season={seasonYear}',
    apiFields: 'venue.name, venue.city',
    localModels: 'Team',
    localFields: 'stadiumEn, stadiumHe, cityEn, cityHe, venueId',
    status: 'stored',
    note: 'Team rows keep a venue reference plus denormalized venue and city labels.',
  },
  {
    resource: 'teams',
    endpoint: '/teams?league={leagueId}&season={seasonYear}',
    apiFields: 'coach and richer team metadata',
    localModels: 'Team',
    localFields: 'coach/coaches via lineup sync, plus full team+venue payload in additionalInfo',
    status: 'stored',
    note: 'Team rows now also keep the full source payload locally in JSON.',
  },
  {
    resource: 'venues',
    endpoint: 'nested venue payloads from /teams and /fixtures',
    apiFields: 'id, name, address, city, country, capacity, surface, image',
    localModels: 'Venue',
    localFields: 'apiFootballId, nameEn, nameHe, addressEn, addressHe, cityEn, cityHe, countryEn, countryHe, capacity, surface, imageUrl',
    status: 'stored',
    note: 'Venue catalog is mapped well from both team and fixture payloads.',
  },
  {
    resource: 'players',
    endpoint: '/players?team={teamId}&season={seasonYear}&page={page}',
    apiFields: 'player.id, player.name, player.photo, games.number, games.position',
    localModels: 'Player',
    localFields: 'apiFootballId, nameEn, nameHe, photoUrl, jerseyNumber, position, teamId, canonicalPlayerId',
    status: 'stored',
    note: 'Only the subset needed for roster identity is written today.',
  },
  {
    resource: 'players',
    endpoint: '/players?team={teamId}&season={seasonYear}&page={page}',
    apiFields: 'player.firstname, player.lastname',
    localModels: 'Player',
    localFields: 'firstNameEn, firstNameHe, lastNameEn, lastNameHe',
    status: 'stored',
    note: 'These identity fields are now populated during player sync.',
  },
  {
    resource: 'players',
    endpoint: '/players?team={teamId}&season={seasonYear}&page={page}',
    apiFields: 'player.birth.date, player.birth.place, player.birth.country, player.nationality, player.age, player.height, player.weight, player.injured',
    localModels: 'Player',
    localFields: 'birthDate, birthPlaceEn/He, birthCountryEn/He, nationalityEn/He, age, height, weight, isInjured, additionalInfo',
    status: 'stored',
    note: 'Richer player profile data is now persisted locally.',
  },
  {
    resource: 'fixtures',
    endpoint: '/fixtures?league={leagueId}&season={seasonYear}',
    apiFields: 'fixture.id, fixture.date, fixture.referee, fixture.venue.name, league.round, goals.home, goals.away, fixture.status.short',
    localModels: 'Game',
    localFields: 'apiFootballId, externalRef, dateTime, refereeEn, refereeHe, refereeId, venueNameEn, venueNameHe, venueId, roundNameEn, roundNameHe, homeScore, awayScore, status',
    status: 'stored',
    note: 'Core fixture state is mapped to Game.',
  },
  {
    resource: 'fixtures',
    endpoint: '/fixtures?league={leagueId}&season={seasonYear}',
    apiFields: 'fixture.timestamp, timezone, periods, status.long, status.elapsed, score breakdown',
    localModels: 'Game',
    localFields: 'timestamp, timezone, statusShort, statusLong, elapsed, extra, additionalInfo',
    status: 'stored',
    note: 'Detailed fixture state is now stored directly plus the full fixture payload in JSON.',
  },
  {
    resource: 'fixtures',
    endpoint: '/fixtures?league={leagueId}&season={seasonYear}',
    apiFields: 'fixture.referee',
    localModels: 'Referee',
    localFields: 'nameEn, nameHe',
    status: 'stored',
    note: 'Referees are normalized into a separate catalog.',
  },
  {
    resource: 'standings',
    endpoint: '/standings?league={leagueId}&season={seasonYear}',
    apiFields: 'rank, all.played, all.win, all.draw, all.lose, all.goals.for, all.goals.against, points, form',
    localModels: 'Standing',
    localFields: 'position, played, wins, draws, losses, goalsFor, goalsAgainst, points, form, teamId, seasonId, competitionId',
    status: 'stored',
    note: 'Primary table standings are saved correctly.',
  },
  {
    resource: 'standings',
    endpoint: '/standings?league={leagueId}&season={seasonYear}',
    apiFields: 'goalsDiff, group, description, status, promotion/relegation metadata, deductions',
    localModels: 'Standing',
    localFields: 'goalsDiff, groupNameEn/He, descriptionEn/He, statusEn/He, additionalInfo',
    status: 'stored',
    note: 'Richer standing metadata is now stored, with the full row payload preserved in JSON.',
  },
  {
    resource: 'events',
    endpoint: '/fixtures/events?fixture={fixtureId}',
    apiFields: 'time.elapsed, time.extra, type, detail, team.name, player.name, assist.name',
    localModels: 'GameEvent',
    localFields: 'minute, extraMinute, type, notesEn, notesHe, icon, team, teamId, playerId, relatedPlayerId, gameId',
    status: 'stored',
    note: 'Assist names are linked through relatedPlayerId. Event rows are fully rebuilt per fixture refresh.',
  },
  {
    resource: 'statistics',
    endpoint: '/fixtures/statistics?fixture={fixtureId}',
    apiFields: 'Ball Possession, Shots on Goal, Total Shots, Corner Kicks, Fouls, Offsides, Yellow Cards, Red Cards',
    localModels: 'GameStatistics',
    localFields: 'home/away possession, shotsOnTarget, shotsTotal, corners, fouls, offsides, yellowCards, redCards',
    status: 'stored',
    note: 'Core stats remain mapped to columns, and the full payload is now preserved in JSON.',
  },
  {
    resource: 'statistics',
    endpoint: '/fixtures/statistics?fixture={fixtureId}',
    apiFields: 'other stat types such as shots off goal, blocked shots, goalkeeper saves, passes, pass accuracy, xG if present',
    localModels: 'GameStatistics',
    localFields: 'additionalInfo',
    status: 'stored',
    note: 'Variable statistic types are now available locally in JSON even when not exposed as dedicated columns.',
  },
  {
    resource: 'lineups',
    endpoint: '/fixtures/lineups?fixture={fixtureId}',
    apiFields: 'startXI[].player.*, substitutes[].player.*, formation, coach.name, coach.id',
    localModels: 'GameLineupEntry',
    localFields: 'apiFootballId, role, participantType, participantName, formation, positionName, positionGrid, jerseyNumber, gameId, teamId, playerId',
    status: 'stored',
    note: 'Both starters and substitutes are kept, plus a coach row per team.',
  },
  {
    resource: 'lineups',
    endpoint: '/fixtures/lineups?fixture={fixtureId}',
    apiFields: 'coach.id, coach.name, fixtureDate',
    localModels: 'TeamCoachAssignment',
    localFields: 'apiFootballCoachId, coachNameEn, coachNameHe, startDate, endDate, teamId, seasonId',
    status: 'stored',
    note: 'Coach assignments are derived from lineup snapshots over time.',
  },
  {
    resource: 'topScorers',
    endpoint: '/players/topscorers?league={leagueId}&season={seasonYear}',
    apiFields: 'player.id, player.name, statistics[0].team, statistics[0].goals.total, statistics[0].games.appearences',
    localModels: 'CompetitionLeaderboardEntry',
    localFields: 'category, rank, value, gamesPlayed, teamId, playerId, apiFootballPlayerId, playerNameEn, playerNameHe, teamNameEn, teamNameHe',
    status: 'stored',
    note: 'Only the leaderboard value and appearance count are stored.',
  },
  {
    resource: 'topScorers',
    endpoint: '/players/topscorers?league={leagueId}&season={seasonYear}',
    apiFields: 'extra scoring detail fields from statistics block',
    localModels: 'CompetitionLeaderboardEntry',
    localFields: 'additionalInfo',
    status: 'stored',
    note: 'Extra leaderboard detail now stays available locally in JSON.',
  },
  {
    resource: 'topAssists',
    endpoint: '/players/topassists?league={leagueId}&season={seasonYear}',
    apiFields: 'player.id, player.name, statistics[0].team, statistics[0].goals.assists, statistics[0].games.appearences',
    localModels: 'CompetitionLeaderboardEntry',
    localFields: 'category, rank, value, gamesPlayed, teamId, playerId, apiFootballPlayerId, playerNameEn, playerNameHe, teamNameEn, teamNameHe',
    status: 'stored',
    note: 'Same shape as top scorers, but value holds assists.',
  },
  {
    resource: 'injuries',
    endpoint: '/injuries?league={leagueId}&season={seasonYear}[&team={teamId}]',
    apiFields: 'fixture.id, fixture.date, team.id, team.name, player.id, player.name, player.type, player.reason',
    localModels: 'PlayerInjury',
    localFields: 'apiFootballPlayerId, apiFootballTeamId, apiFootballFixtureId, playerNameEn, playerNameHe, teamNameEn, teamNameHe, typeEn, typeHe, reasonEn, reasonHe, fixtureDate, seasonId, competitionId, teamId, playerId, gameId',
    status: 'stored',
    note: 'Injury rows are deleted and rebuilt for the selected scope.',
  },
  {
    resource: 'transfers',
    endpoint: '/transfers?team={teamId}',
    apiFields: 'player.id, player.name, transfers[].date, transfers[].type, transfers[].teams.out.*, transfers[].teams.in.*, update',
    localModels: 'PlayerTransfer',
    localFields: 'apiFootballPlayerId, playerNameEn, playerNameHe, transferDate, transferTypeEn, transferTypeHe, sourceTeamApiFootballId, sourceTeamNameEn, sourceTeamNameHe, sourceTeamLogoUrl, destinationTeamApiFootballId, destinationTeamNameEn, destinationTeamNameHe, destinationTeamLogoUrl, sourceUpdatedAt, seasonId, playerId',
    status: 'stored',
    note: 'Only transfers whose date overlaps the selected season are kept.',
  },
  {
    resource: 'trophies',
    endpoint: '/trophies?player={playerId}',
    apiFields: 'league, country, season, place',
    localModels: 'PlayerTrophy',
    localFields: 'apiFootballPlayerId, playerNameEn, playerNameHe, leagueNameEn, leagueNameHe, countryEn, countryHe, seasonLabel, placeEn, placeHe, seasonId, playerId',
    status: 'stored',
    note: 'Only trophies matching the selected season label are saved.',
  },
  {
    resource: 'sidelined',
    endpoint: '/sidelined?player={playerId}',
    apiFields: 'type, start, end',
    localModels: 'PlayerSidelinedEntry',
    localFields: 'apiFootballPlayerId, playerNameEn, playerNameHe, typeEn, typeHe, startDate, endDate, seasonId, playerId',
    status: 'stored',
    note: 'Entries are filtered to season overlap and deduplicated per player/type/startDate.',
  },
  {
    resource: 'predictions',
    endpoint: '/predictions?fixture={fixtureId}',
    apiFields: 'predictions.winner, predictions.advice, predictions.win_or_draw, predictions.under_over, predictions.goals, predictions.percent, comparison',
    localModels: 'GamePrediction',
    localFields: 'winnerTeamApiFootballId, winnerTeamNameEn, winnerTeamNameHe, winnerCommentEn, winnerCommentHe, adviceEn, adviceHe, winOrDraw, underOver, goalsHome, goalsAway, percentHome, percentDraw, percentAway, comparisonJson, rawJson',
    status: 'stored',
    note: 'Prediction summary is stored plus rawJson for future expansion.',
  },
  {
    resource: 'predictions',
    endpoint: '/predictions?fixture={fixtureId}',
    apiFields: 'same payload snapshot over time',
    localModels: 'GamePredictionSnapshot',
    localFields: 'same core fields as GamePrediction plus snapshotAt',
    status: 'stored',
    note: 'Historical prediction snapshots are also kept.',
  },
  {
    resource: 'h2h',
    endpoint: '/fixtures/headtohead?h2h={homeId}-{awayId}&last=5',
    apiFields: 'fixture.id, league.id, league.name, league.round, fixture.date, teams.home.*, teams.away.*, goals.*, winner',
    localModels: 'GameHeadToHeadEntry',
    localFields: 'apiFootballFixtureId, relatedCompetitionApiId, relatedCompetitionNameEn, relatedCompetitionNameHe, relatedRoundEn, relatedRoundHe, relatedDate, homeTeamApiFootballId, homeTeamNameEn, homeTeamNameHe, awayTeamApiFootballId, awayTeamNameEn, awayTeamNameHe, homeScore, awayScore, winnerTeamApiFootballId, rawJson',
    status: 'stored',
    note: 'This resource already keeps rawJson, so expansion here is low risk.',
  },
  {
    resource: 'odds',
    endpoint: '/odds?fixture={fixtureId}',
    apiFields: 'bookmakers[].id, bookmakers[].name, bets[].id, bets[].name, values[].value, values[].odd, update',
    localModels: 'GameOddsValue, GameOddsSnapshot',
    localFields: 'bookmakerApiId, bookmakerName, marketApiId, marketName, selectionValue, odd, oddsUpdatedAt, bookmakerId, betId, gameId, seasonId, competitionId',
    status: 'stored',
    note: 'Odds are normalized into current values plus historical snapshots.',
  },
  {
    resource: 'odds',
    endpoint: '/odds?fixture={fixtureId}',
    apiFields: 'bookmaker catalog',
    localModels: 'OddsBookmaker',
    localFields: 'apiFootballId, name',
    status: 'stored',
    note: 'Bookmakers are normalized for reuse.',
  },
  {
    resource: 'odds',
    endpoint: '/odds?fixture={fixtureId}',
    apiFields: 'bet market catalog',
    localModels: 'OddsBet',
    localFields: 'apiFootballId, nameEn, nameHe',
    status: 'stored',
    note: 'Bet markets are normalized for reuse.',
  },
  {
    resource: 'livescore',
    endpoint: '/fixtures?live=all',
    apiFields: 'fixture.id, league.*, fixture.status.*, fixture.date, teams.*, goals.*, events count',
    localModels: 'LiveGameSnapshot',
    localFields: 'apiFootballFixtureId, feedScope, leagueApiFootballId, leagueNameEn, leagueNameHe, roundEn, roundHe, statusShort, statusLong, elapsed, extra, snapshotAt, fixtureDate, homeTeamApiFootballId, homeTeamNameEn, homeTeamNameHe, awayTeamApiFootballId, awayTeamNameEn, awayTeamNameHe, homeScore, awayScore, eventCount, rawJson, gameId, seasonId, competitionId',
    status: 'stored',
    note: 'Local live feed stores both summary fields and rawJson.',
  },
  {
    resource: 'globalLivescore',
    endpoint: '/fixtures?live=all',
    apiFields: 'same live fixture payload used for homepage feed',
    localModels: 'LiveGameSnapshot',
    localFields: 'same fields as livescore with feedScope=GLOBAL_HOMEPAGE',
    status: 'stored',
    note: 'Global homepage live feed shares the same model.',
  },
  {
    resource: 'derived',
    endpoint: 'local derivation from standings + events + lineups + statistics + fixtures',
    apiFields: 'not a direct API resource',
    localModels: 'PlayerStatistics',
    localFields: 'goals, assists, yellowCards, redCards, gamesPlayed, minutesPlayed, starts, substituteAppearances, timesSubbedOff',
    status: 'derived',
    note: 'Player seasonal statistics are computed locally, not taken directly from the player API payload.',
  },
  {
    resource: 'derived',
    endpoint: 'local derivation from standings + events + lineups + statistics + fixtures',
    apiFields: 'not a direct API resource',
    localModels: 'TeamStatistics',
    localFields: 'matchesPlayed, totalGoals, totalAssists, goalsConceded, cleanSheets, yellowCards, redCards, shotsOnTarget, shotsTotal, corners, fouls, offsides, averagePossession, wins, draws, losses, points',
    status: 'derived',
    note: 'Team seasonal statistics are also derived locally.',
  },
];

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toCsv(data) {
  const headers = ['Resource', 'Endpoint', 'API Fields', 'Local Models', 'Local Fields', 'Status', 'Notes'];
  const body = data.map((row) =>
    [
      row.resource,
      row.endpoint,
      row.apiFields,
      row.localModels,
      row.localFields,
      row.status,
      row.note,
    ]
      .map(csvEscape)
      .join(',')
  );

  return [headers.join(','), ...body].join('\n');
}

function toExcelXml(data) {
  const headers = ['Resource', 'Endpoint', 'API Fields', 'Local Models', 'Local Fields', 'Status', 'Notes'];
  const headerRow = headers
    .map((header) => `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`)
    .join('');
  const dataRows = data
    .map((row) => {
      const values = [
        row.resource,
        row.endpoint,
        row.apiFields,
        row.localModels,
        row.localFields,
        row.status,
        row.note,
      ];
      return `<Row>${values
        .map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
        .join('')}</Row>`;
    })
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="API Mapping">
  <Table>
   <Row>${headerRow}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>
`;
}

const docsDir = path.join(process.cwd(), 'docs');
fs.mkdirSync(docsDir, { recursive: true });

function writeWithFallback(filename, content) {
  const primaryPath = path.join(docsDir, filename);
  try {
    fs.writeFileSync(primaryPath, content, 'utf8');
    return primaryPath;
  } catch (error) {
    if (!error || error.code !== 'EBUSY') {
      throw error;
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const datedPath = path.join(docsDir, `${base}-updated${ext}`);
    fs.writeFileSync(datedPath, content, 'utf8');
    return datedPath;
  }
}

const csvPath = writeWithFallback('api-football-storage-comparison.csv', toCsv(rows));
const xmlPath = writeWithFallback('api-football-storage-comparison.xml', toExcelXml(rows));

console.log(`Generated ${rows.length} mapping rows.`);
console.log(`CSV: ${csvPath}`);
console.log(`XML: ${xmlPath}`);
