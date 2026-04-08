import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { scrapeTeamPage, scrapePlayerPage, scrapeLeagueTopScorers, scrapeAllTeams, SPORT5_TEAMS } from '@/lib/sport5-scraper';
import { mergeTeamPlayers, mergePlayerSeasonStats } from '@/lib/sport5-merge';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;
  const seasonId = body?.seasonId;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  try {
    // Scrape a single team page
    if (action === 'scrape-team') {
      const folderId = body?.folderId;
      if (!folderId) {
        return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
      }
      const data = await scrapeTeamPage(folderId);
      return NextResponse.json({
        success: true,
        data: {
          team: data.nameHe,
          players: data.players.length,
          standings: data.standings ? 'yes' : 'no',
        },
        raw: data,
      });
    }

    // Scrape a single team and merge into DB
    if (action === 'scrape-and-merge-team') {
      const folderId = body?.folderId;
      if (!folderId || !seasonId) {
        return NextResponse.json({ error: 'folderId and seasonId are required' }, { status: 400 });
      }
      const data = await scrapeTeamPage(folderId);
      const mergeResult = await mergeTeamPlayers(data, seasonId);
      return NextResponse.json({ success: true, scrape: { team: data.nameHe, players: data.players.length }, merge: mergeResult });
    }

    // Scrape a player page
    if (action === 'scrape-player') {
      const { teamFolderId, playerId, slug } = body;
      if (!teamFolderId || !playerId || !slug) {
        return NextResponse.json({ error: 'teamFolderId, playerId, and slug are required' }, { status: 400 });
      }
      const data = await scrapePlayerPage(teamFolderId, playerId, slug);
      return NextResponse.json({ success: true, data });
    }

    // Scrape player and merge stats
    if (action === 'scrape-and-merge-player') {
      const { teamFolderId, playerId, slug } = body;
      if (!teamFolderId || !playerId || !slug || !seasonId) {
        return NextResponse.json({ error: 'teamFolderId, playerId, slug, and seasonId are required' }, { status: 400 });
      }
      const data = await scrapePlayerPage(teamFolderId, playerId, slug);
      const mergeResult = await mergePlayerSeasonStats(data, seasonId);
      return NextResponse.json({ success: true, scrape: { player: data.name, seasons: data.seasons.length }, merge: mergeResult });
    }

    // Scrape all Liga Ha'al teams
    if (action === 'scrape-all-teams') {
      const folderIds = Object.keys(SPORT5_TEAMS).map(Number);
      const result = await scrapeAllTeams(folderIds);
      return NextResponse.json({
        success: true,
        summary: {
          teams: result.teams.length,
          totalPlayers: result.teams.reduce((sum, t) => sum + t.players.length, 0),
          errors: result.errors.length,
        },
        errors: result.errors,
        scrapedAt: result.scrapedAt,
      });
    }

    // Scrape all teams and merge
    if (action === 'scrape-and-merge-all') {
      if (!seasonId) {
        return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
      }
      const folderIds = Object.keys(SPORT5_TEAMS).map(Number);
      const scrapeResult = await scrapeAllTeams(folderIds);
      const mergeResults = [];

      for (const team of scrapeResult.teams) {
        const mergeResult = await mergeTeamPlayers(team, seasonId);
        mergeResults.push({ team: team.nameHe, ...mergeResult });
      }

      return NextResponse.json({
        success: true,
        summary: {
          teamsScraped: scrapeResult.teams.length,
          scrapeErrors: scrapeResult.errors.length,
          totalMatched: mergeResults.reduce((s, r) => s + r.playersMatched, 0),
          totalUpdated: mergeResults.reduce((s, r) => s + r.statsUpdated, 0),
          totalSkipped: mergeResults.reduce((s, r) => s + r.skipped, 0),
        },
        teams: mergeResults,
        scrapeErrors: scrapeResult.errors,
      });
    }

    // Scrape league top scorers
    if (action === 'scrape-top-scorers') {
      const folderId = body?.folderId || 44;
      const scorers = await scrapeLeagueTopScorers(folderId);
      return NextResponse.json({ success: true, count: scorers.length, scorers });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Scrape failed', details: error.message },
      { status: 500 }
    );
  }
}
