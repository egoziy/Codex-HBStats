const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function translateName(name) {
  const translations = {
    'Hapoel Beer Sheva': 'הפועל באר שבע',
    'Maccabi Tel Aviv': 'מכבי תל אביב',
    'Maccabi Haifa': 'מכבי חיפה',
    'Beitar Jerusalem': 'בית"ר ירושלים',
    'Hapoel Haifa': 'הפועל חיפה',
    'Maccabi Netanya': 'מכבי נתניה',
    'Bnei Sakhnin': 'בני סכנין',
    'Hapoel Jerusalem': 'הפועל ירושלים',
    'Maccabi Petah Tikva': 'מכבי פתח תקווה',
    'Hapoel Tel Aviv': 'הפועל תל אביב',
    Ashdod: 'מ.ס. אשדוד',
    'Hapoel Hadera': 'הפועל חדרה',
    'Maccabi Bnei Raina': 'מכבי בני ריינה',
  };

  return translations[name] || name || null;
}

async function fetchApiFootball(endpoint, apiKey) {
  const response = await fetch(`https://v3.football.api-sports.io${endpoint}`, {
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.response) ? payload.response : [];
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env'));

  const seasonYear = Number(process.argv[2] || 2017);
  const leagueId = Number(process.argv[3] || 383);
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    throw new Error('Missing API_FOOTBALL_KEY in environment');
  }

  const prisma = new PrismaClient();

  try {
    const season = await prisma.season.findUnique({
      where: { year: seasonYear },
    });

    if (!season) {
      throw new Error(`Season ${seasonYear}-${seasonYear + 1} not found`);
    }

    const competition = await prisma.competition.findUnique({
      where: { apiFootballId: leagueId },
    });

    if (!competition) {
      throw new Error(`Competition with apiFootballId ${leagueId} not found`);
    }

    const competitionSeason = await prisma.competitionSeason.findUnique({
      where: {
        competitionId_seasonId: {
          competitionId: competition.id,
          seasonId: season.id,
        },
      },
    });

    if (!competitionSeason) {
      throw new Error(`Competition season missing for competition ${leagueId} and season ${seasonYear}`);
    }

    const teamRows = await prisma.team.findMany({
      where: { seasonId: season.id },
      select: { id: true, apiFootballId: true, nameEn: true, nameHe: true },
    });

    const teamByApiId = new Map(teamRows.filter((team) => team.apiFootballId !== null).map((team) => [team.apiFootballId, team]));
    const teamByName = new Map(teamRows.map((team) => [team.nameEn, team]));

    const standingsBlocks = await fetchApiFootball(`/standings?league=${leagueId}&season=${seasonYear}`, apiKey);
    let saved = 0;
    let fetched = 0;

    for (const block of standingsBlocks) {
      const groups = block?.league?.standings || [];
      for (const group of groups) {
        for (const row of group) {
          const apiTeamId = row?.team?.id ?? null;
          const teamName = row?.team?.name ?? null;
          const dbTeam = (apiTeamId !== null ? teamByApiId.get(apiTeamId) : null) || (teamName ? teamByName.get(teamName) : null);
          fetched += 1;

          if (!dbTeam) {
            console.log(`Skipping row without matching team: ${teamName || apiTeamId}`);
            continue;
          }

          await prisma.standing.upsert({
            where: {
              seasonId_teamId: {
                seasonId: season.id,
                teamId: dbTeam.id,
              },
            },
            update: {
              competitionId: competition.id,
              position: row?.rank ?? 0,
              played: row?.all?.played ?? 0,
              wins: row?.all?.win ?? 0,
              draws: row?.all?.draw ?? 0,
              losses: row?.all?.lose ?? 0,
              goalsFor: row?.all?.goals?.for ?? 0,
              goalsAgainst: row?.all?.goals?.against ?? 0,
              points: row?.points ?? 0,
              form: row?.form ?? null,
            },
            create: {
              seasonId: season.id,
              teamId: dbTeam.id,
              competitionId: competition.id,
              position: row?.rank ?? 0,
              played: row?.all?.played ?? 0,
              wins: row?.all?.win ?? 0,
              draws: row?.all?.draw ?? 0,
              losses: row?.all?.lose ?? 0,
              goalsFor: row?.all?.goals?.for ?? 0,
              goalsAgainst: row?.all?.goals?.against ?? 0,
              points: row?.points ?? 0,
              form: row?.form ?? null,
            },
          });

          if (!dbTeam.nameHe || dbTeam.nameHe === dbTeam.nameEn) {
            await prisma.team.update({
              where: { id: dbTeam.id },
              data: { nameHe: translateName(teamName) || dbTeam.nameHe || dbTeam.nameEn },
            });
          }

          saved += 1;
        }
      }
    }

    await prisma.competitionSeason.update({
      where: { id: competitionSeason.id },
      data: { standingsUpdatedAt: new Date() },
    });

    console.log(JSON.stringify({
      season: season.name,
      leagueId,
      fetched,
      saved,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
