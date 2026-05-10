import { NextRequest, NextResponse } from 'next/server';
import { getHomepageLiveSnapshots, type HomepageLiveEvent } from '@/lib/home-live';
import type { LivePayload, LiveLeagueGroup, LiveMatchExpanded, LiveMatchEvent } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

function mapEventType(event: HomepageLiveEvent): LiveMatchEvent['type'] {
  const label = event.typeLabel;
  if (label === 'שער' || label === 'שער עצמי') return 'goal';
  if (label === 'פנדל') return 'penalty';
  if (label === 'כרטיס צהוב') return 'yellow';
  if (label === 'כרטיס אדום') return 'red';
  if (label === 'חילוף') return 'sub';
  // Fallback based on icon class
  if (event.iconClassName?.includes('emerald')) return 'goal';
  if (event.iconClassName?.includes('red')) return 'red';
  if (event.iconClassName?.includes('amber')) return 'yellow';
  if (event.iconClassName?.includes('sky')) return 'sub';
  return 'goal';
}

function parseMinute(minuteLabel: string | null | undefined): number | null {
  if (!minuteLabel) return null;
  const match = String(minuteLabel).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = Number(limitParam);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  const snapshots = await getHomepageLiveSnapshots(null, { limit });

  const groupsMap = new Map<string, LiveLeagueGroup>();

  for (const snapshot of snapshots) {
    const groupKey = `${snapshot.countryLabel}__${snapshot.leagueLabel}`;
    const leagueId = snapshot.leagueApiFootballId
      ? String(snapshot.leagueApiFootballId)
      : groupKey;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        league: {
          id: leagueId,
          nameHe: snapshot.leagueLabel,
          nameEn: snapshot.leagueLabel,
          logo: snapshot.countryFlagUrl ?? null,
        },
        matches: [],
      });
    }

    const gameId = snapshot.gameHref.match(/\/games\/([^/?#]+)/)?.[1] ?? snapshot.id;

    const recentEvents: LiveMatchEvent[] = snapshot.events
      .slice(-3)
      .map((e: HomepageLiveEvent): LiveMatchEvent => {
        const teamSide: 'home' | 'away' =
          e.teamName === snapshot.homeTeamName ? 'home' : 'away';
        return {
          minute: parseMinute(e.minuteLabel) ?? 0,
          type: mapEventType(e),
          player: e.primaryText && e.primaryText !== 'לא ידוע' ? e.primaryText : null,
          team: teamSide,
        };
      });

    const { homeScore, awayScore } = (() => {
      const match = snapshot.scoreLabel.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) return { homeScore: null, awayScore: null };
      return { homeScore: Number(match[1]), awayScore: Number(match[2]) };
    })();

    const expanded: LiveMatchExpanded = {
      id: gameId,
      minute: parseMinute(snapshot.minuteLabel),
      status: 'live',
      home: {
        team: {
          id: snapshot.homeTeamApiFootballId
            ? String(snapshot.homeTeamApiFootballId)
            : `home-${gameId}`,
          apiId: snapshot.homeTeamApiFootballId ?? null,
          nameEn: snapshot.homeTeamName,
          nameHe: snapshot.homeTeamName,
          logoUrl: null,
        },
        score: homeScore,
      },
      away: {
        team: {
          id: snapshot.awayTeamApiFootballId
            ? String(snapshot.awayTeamApiFootballId)
            : `away-${gameId}`,
          apiId: snapshot.awayTeamApiFootballId ?? null,
          nameEn: snapshot.awayTeamName,
          nameHe: snapshot.awayTeamName,
          logoUrl: null,
        },
        score: awayScore,
      },
      eventCount: snapshot.eventCount,
      recentEvents,
    };

    groupsMap.get(groupKey)!.matches.push(expanded);
  }

  const payload: LivePayload = {
    groups: Array.from(groupsMap.values()),
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
