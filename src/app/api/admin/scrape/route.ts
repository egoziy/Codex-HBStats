import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { scrapeAndSaveTeam, scrapeAndSavePlayer, scrapeAllSport5, SPORT5_TEAMS } from '@/lib/sport5-scraper';
import prisma from '@/lib/prisma';
import { execSync, exec } from 'child_process';
import path from 'path';

// Concurrency lock — prevent multiple simultaneous scrape operations
let scrapeInProgress = false;

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  try {
    // Scrape a single team and save to DB
    if (action === 'scrape-team') {
      const folderId = body?.folderId;
      if (!folderId) return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
      const result = await scrapeAndSaveTeam(folderId);
      return NextResponse.json({ success: true, ...result });
    }

    // Scrape a single player's historical stats
    if (action === 'scrape-player') {
      const { scrapedPlayerId, teamFolderId, sport5PlayerId, slug } = body;
      if (!scrapedPlayerId || !teamFolderId || !sport5PlayerId || !slug) {
        return NextResponse.json({ error: 'scrapedPlayerId, teamFolderId, sport5PlayerId, and slug are required' }, { status: 400 });
      }
      const result = await scrapeAndSavePlayer(scrapedPlayerId, teamFolderId, sport5PlayerId, slug);
      return NextResponse.json({ success: true, ...result });
    }

    // Scrape ALL teams and all their players
    if (action === 'scrape-all') {
      if (scrapeInProgress) {
        return NextResponse.json({ error: 'סריקה כבר רצה. חכה שתסתיים.' }, { status: 429 });
      }
      scrapeInProgress = true;
      try {
        const folderIds = body?.folderIds || undefined;
        const result = await scrapeAllSport5(folderIds);
        return NextResponse.json({ success: true, ...result });
      } finally {
        scrapeInProgress = false;
      }
    }

    // Get scrape status/summary
    if (action === 'status') {
      const [teams, players, seasons, matches, standings, jobs] = await Promise.all([
        prisma.scrapedTeam.count({ where: { source: 'sport5' } }),
        prisma.scrapedPlayer.count({ where: { source: 'sport5' } }),
        prisma.scrapedPlayerSeason.count({ where: { source: 'sport5' } }),
        prisma.scrapedMatch.count({ where: { source: 'sport5' } }),
        prisma.scrapedStanding.count({ where: { source: 'sport5' } }),
        prisma.scrapeJob.findMany({ where: { source: 'sport5' }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);
      return NextResponse.json({ teams, players, seasons, matches, standings, recentJobs: jobs });
    }

    // List available teams to scrape
    if (action === 'list-teams') {
      return NextResponse.json({ teams: SPORT5_TEAMS });
    }

    // RSSSF: fire-and-forget scrape (takes many minutes)
    if (action === 'rsssf-scrape') {
      if (scrapeInProgress) {
        return NextResponse.json({ error: 'סריקה כבר רצה. חכה שתסתיים.' }, { status: 429 });
      }
      scrapeInProgress = true;
      const cwd = path.resolve(process.cwd());
      exec(`node scripts/scrape-rsssf.js --mode all`, { cwd }, (err) => {
        scrapeInProgress = false;
        if (err) console.error('RSSSF scrape error:', err.message);
        else console.log('RSSSF scrape completed');
      });
      return NextResponse.json({ success: true, message: 'סריקת RSSSF התחילה ברקע. תוצאות בטרמינל.' });
    }

    // RSSSF: merge scraped data into main DB (pre-2000 by default)
    if (action === 'rsssf-merge') {
      if (scrapeInProgress) {
        return NextResponse.json({ error: 'סריקה כבר רצה. חכה שתסתיים.' }, { status: 429 });
      }
      scrapeInProgress = true;
      try {
        const maxYear = Number(body?.maxYear) || 2000;
        const cwd = path.resolve(process.cwd());
        const output = execSync(
          `node scripts/merge-rsssf.js --mode all --max-year ${maxYear}`,
          { cwd, timeout: 120_000, encoding: 'utf8' }
        );
        return NextResponse.json({ success: true, message: output.slice(-800) });
      } catch (err: any) {
        return NextResponse.json({ error: err.message?.slice(0, 300) || 'Merge failed' }, { status: 500 });
      } finally {
        scrapeInProgress = false;
      }
    }

    // RSSSF: return scraped counts per category
    if (action === 'rsssf-status') {
      const [standings, topScorers, matches] = await Promise.all([
        prisma.scrapedStanding.count({ where: { source: 'rsssf' } }),
        prisma.scrapedLeaderboard.count({ where: { source: 'rsssf' } }),
        prisma.scrapedMatch.count({ where: { source: 'rsssf' } }),
      ]);
      return NextResponse.json({ standings, topScorers, matches });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Scrape failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return scraped data summary
  const [teams, players, seasons, standings] = await Promise.all([
    prisma.scrapedTeam.findMany({
      where: { source: 'sport5' },
      select: { id: true, nameHe: true, season: true, _count: { select: { players: true, standings: true } } },
      orderBy: { nameHe: 'asc' },
    }),
    prisma.scrapedPlayerSeason.groupBy({ by: ['season'], where: { source: 'sport5' }, _count: true, orderBy: { season: 'desc' } }),
    prisma.scrapedPlayerSeason.count({ where: { source: 'sport5' } }),
    prisma.scrapedStanding.count({ where: { source: 'sport5' } }),
  ]);

  return NextResponse.json({ teams, seasonBreakdown: players, totalSeasonStats: seasons, totalStandings: standings });
}
