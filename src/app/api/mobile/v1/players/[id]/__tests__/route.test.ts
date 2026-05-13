import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { PlayerPayload } from '@shared/types/mobile-api';

function mkReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/mobile/v1/players/${id}`);
}

describe('GET /api/mobile/v1/players/:id — basic PlayerPayload (v1.0)', () => {
  test('returns 404 for unknown id', async () => {
    const res = await GET(mkReq('bogus'), { params: { id: 'bogus' } });
    expect(res.status).toBe(404);
  });

  test('returns basic shape with profile + career array for a real player', async () => {
    const player = await prisma.player.findFirst({ select: { id: true } });
    if (!player) {
      console.warn('No players in dev DB — skipping');
      return;
    }
    const req = mkReq(player.id);
    const res = await GET(req, { params: { id: player.id } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlayerPayload;
    expect(body.player.id).toBe(player.id);
    // v1.0 omits charts/season switcher (deferred to v1.1):
    expect(body).not.toHaveProperty('seasonSwitcher');
    expect(body).not.toHaveProperty('charts');
    // v1.0 surfaces all of:
    expect(body).toHaveProperty('currentSeasonStats');
    expect(body.player).toHaveProperty('marketValue');
    expect(body.player).toHaveProperty('contractUntil');
    expect(body.player).toHaveProperty('dateOfBirth');
    expect(Array.isArray(body.recentMatches)).toBe(true);
    expect(body.recentMatches.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(body.career)).toBe(true);
  });

  test('surfaces Flashscore market value + career when stored on the player', async () => {
    const players = await prisma.player.findMany({ select: { id: true, additionalInfo: true }, take: 200 });
    const sample = players.find((p) => {
      const ai = p.additionalInfo as { flashscore?: { marketValue?: string } } | null;
      return Boolean(ai?.flashscore?.marketValue);
    });
    if (!sample) {
      console.warn('No player has Flashscore extras yet — skipping');
      return;
    }
    const res = await GET(mkReq(sample.id), { params: { id: sample.id } });
    const body = (await res.json()) as PlayerPayload;
    expect(typeof body.player.marketValue).toBe('string');
    expect(Array.isArray(body.career)).toBe(true);
  });
});
