const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function compare() {
  // IFA counts
  const ifaStandings = await prisma.scrapedStanding.count({ where: { source: 'footballOrgIl' } });
  const ifaMatches = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl' } });
  const ifaMatchesWithScore = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl', homeScore: { not: null } } });
  const ifaEvents = await prisma.scrapedMatchEvent.count({ where: { source: 'footballOrgIl' } });
  const ifaLineups = await prisma.scrapedMatchLineup.count({ where: { source: 'footballOrgIl' } });
  const ifaPlayers = await prisma.scrapedPlayer.count({ where: { source: 'footballOrgIl' } });
  const ifaPlayerSeasons = await prisma.scrapedPlayerSeason.count({ where: { source: 'footballOrgIl' } });
  const ifaPlayersWithBirth = await prisma.scrapedPlayer.count({ where: { source: 'footballOrgIl', birthDate: { not: null } } });
  const ifaPlayersWithPhoto = await prisma.scrapedPlayer.count({ where: { source: 'footballOrgIl', photoUrl: { not: null } } });
  const ifaMatchesWithRef = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl', referee: { not: null } } });
  const ifaMatchesWithVenue = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl', venue: { not: null } } });
  const ifaMatchesWithCoach = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl', coachHome: { not: null } } });
  const ifaTeams = await prisma.scrapedTeam.count({ where: { source: 'footballOrgIl' } });
  const ifaHalfTime = await prisma.scrapedMatch.count({ where: { source: 'footballOrgIl', homeHalfScore: { not: null } } });

  // Walla counts
  const wallaStandings = await prisma.scrapedStanding.count({ where: { source: 'walla' } });
  const wallaMatches = await prisma.scrapedMatch.count({ where: { source: 'walla' } });
  const wallaMatchesWithScore = await prisma.scrapedMatch.count({ where: { source: 'walla', homeScore: { not: null } } });
  const wallaEvents = await prisma.scrapedMatchEvent.count({ where: { source: 'walla' } });
  const wallaLineups = await prisma.scrapedMatchLineup.count({ where: { source: 'walla' } });
  const wallaPlayers = await prisma.scrapedPlayer.count({ where: { source: 'walla' } });
  const wallaPlayerSeasons = await prisma.scrapedPlayerSeason.count({ where: { source: 'walla' } });
  const wallaPlayersWithBirth = await prisma.scrapedPlayer.count({ where: { source: 'walla', birthDate: { not: null } } });
  const wallaPlayersWithPhoto = await prisma.scrapedPlayer.count({ where: { source: 'walla', photoUrl: { not: null } } });
  const wallaMatchesWithRef = await prisma.scrapedMatch.count({ where: { source: 'walla', referee: { not: null } } });
  const wallaMatchesWithVenue = await prisma.scrapedMatch.count({ where: { source: 'walla', venue: { not: null } } });
  const wallaTeams = await prisma.scrapedTeam.count({ where: { source: 'walla' } });
  const wallaLeaderboards = await prisma.scrapedLeaderboard.count({ where: { source: 'walla' } });
  const wallaHalfTime = await prisma.scrapedMatch.count({ where: { source: 'walla', homeHalfScore: { not: null } } });

  // Season ranges
  const ifaSeasons = await prisma.scrapedStanding.findMany({ where: { source: 'footballOrgIl' }, select: { season: true }, distinct: ['season'], orderBy: { season: 'asc' } });
  const wallaSeasons = await prisma.scrapedStanding.findMany({ where: { source: 'walla' }, select: { season: true }, distinct: ['season'], orderBy: { season: 'asc' } });

  // Leagues
  const ifaLeagues = await prisma.scrapedStanding.findMany({ where: { source: 'footballOrgIl' }, select: { leagueNameHe: true }, distinct: ['leagueNameHe'] });
  const wallaLeagues = await prisma.scrapedStanding.findMany({ where: { source: 'walla' }, select: { leagueNameHe: true }, distinct: ['leagueNameHe'] });

  function row(label, ifa, walla) {
    const winner = ifa > walla ? ' ◄' : walla > ifa ? '          ◄' : '';
    console.log(`  ${label.padEnd(28)} │ ${String(ifa).padStart(10)} │ ${String(walla).padStart(10)}${winner}`);
  }

  console.log('');
  console.log('  ══════════════ IFA vs Walla — השוואת נתונים סרוקים ══════════════');
  console.log('');
  console.log(`  ${'נתון'.padEnd(28)} │ ${'IFA'.padStart(10)} │ ${'Walla'.padStart(10)}`);
  console.log('  ' + '─'.repeat(28) + '─┼─' + '─'.repeat(10) + '─┼─' + '─'.repeat(10));

  console.log('  --- כמויות בסיסיות ---');
  row('עונות', ifaSeasons.length, wallaSeasons.length);
  row('ליגות', ifaLeagues.length, wallaLeagues.length);
  row('קבוצות', ifaTeams, wallaTeams);
  row('טבלאות (שורות)', ifaStandings, wallaStandings);

  console.log('  --- משחקים ---');
  row('משחקים (סה"כ)', ifaMatches, wallaMatches);
  row('עם תוצאה', ifaMatchesWithScore, wallaMatchesWithScore);
  row('עם תוצאת מחצית', ifaHalfTime, wallaHalfTime);
  row('עם שופטים', ifaMatchesWithRef, wallaMatchesWithRef);
  row('עם אצטדיון', ifaMatchesWithVenue, wallaMatchesWithVenue);
  row('עם מאמנים', ifaMatchesWithCoach, 0);
  row('אירועי משחק', ifaEvents, wallaEvents);
  row('הרכבים', ifaLineups, wallaLineups);

  console.log('  --- שחקנים ---');
  row('שחקנים (ייחודיים)', ifaPlayers, wallaPlayers);
  row('סטטיסטיקות (עונתיות)', ifaPlayerSeasons, wallaPlayerSeasons);
  row('עם תאריך לידה', ifaPlayersWithBirth, wallaPlayersWithBirth);
  row('עם תמונה', ifaPlayersWithPhoto, wallaPlayersWithPhoto);
  row('Leaderboards', 0, wallaLeaderboards);

  console.log('');
  console.log('  --- טווח עונות ---');
  console.log(`  IFA:   ${ifaSeasons[0]?.season || '?'} → ${ifaSeasons[ifaSeasons.length - 1]?.season || '?'}`);
  console.log(`  Walla: ${wallaSeasons[0]?.season || '?'} → ${wallaSeasons[wallaSeasons.length - 1]?.season || '?'}`);

  console.log('');
  console.log('  --- ליגות ---');
  console.log(`  IFA:   ${ifaLeagues.map(l => l.leagueNameHe).join(', ')}`);
  console.log(`  Walla: ${wallaLeagues.map(l => l.leagueNameHe).join(', ')}`);

  console.log('');
  console.log('  --- נתונים ייחודיים ---');
  console.log('  IFA בלבד:  אירועי משחק, הרכבים, שופטים, מאמנים, תאריך לידה, אזרחות, צהובים טוטו, דקות משחק');
  console.log('  Walla בלבד: Leaderboards (6 קטגוריות), בישולים, תוצאות מחצית');

  await prisma.$disconnect();
}

compare().catch(console.error);
