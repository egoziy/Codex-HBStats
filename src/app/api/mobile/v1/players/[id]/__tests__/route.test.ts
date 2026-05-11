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

  test('returns basic shape (no career, no charts) for a real player', async () => {
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
    // v1.0 omits these (verify they're NOT in the response):
    expect(body).not.toHaveProperty('careerHistory');
    expect(body).not.toHaveProperty('seasonSwitcher');
    expect(body).not.toHaveProperty('charts');
    // v1.0 includes:
    expect(body).toHaveProperty('currentSeasonStats');
    expect(Array.isArray(body.recentMatches)).toBe(true);
    expect(body.recentMatches.length).toBeLessThanOrEqual(5);
  });
});
