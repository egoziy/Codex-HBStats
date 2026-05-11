import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { MatchPayload } from '@shared/types/mobile-api';

function mkReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/mobile/v1/games/${id}`);
}

describe('GET /api/mobile/v1/games/:id — MatchPayload contract', () => {
  test('returns 404 for non-existent match', async () => {
    const res = await GET(mkReq('non-existent-id'), { params: { id: 'non-existent-id' } });
    expect(res.status).toBe(404);
  });

  test('returns 200 with MatchPayload shape for a real game', async () => {
    const game = await prisma.game.findFirst({ select: { id: true } });
    if (!game) {
      console.warn('No matches in dev DB — skipping');
      return;
    }
    const res = await GET(mkReq(game.id), { params: { id: game.id } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MatchPayload;
    expect(body.match.id).toBe(game.id);
    expect(body).toHaveProperty('homeTeam');
    expect(body).toHaveProperty('awayTeam');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.lineups).toHaveProperty('home');
    expect(body.lineups).toHaveProperty('away');
  });
});
