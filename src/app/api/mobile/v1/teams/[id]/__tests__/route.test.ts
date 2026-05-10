import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { TeamPayload } from '@shared/types/mobile-api';

function mkReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/mobile/v1/teams/${id}`);
}

describe('GET /api/mobile/v1/teams/:id — TeamPayload contract', () => {
  test('returns 404 for non-existent team', async () => {
    const res = await GET(mkReq('bogus'), { params: { id: 'bogus' } });
    expect(res.status).toBe(404);
  });

  test('returns 200 with TeamPayload shape', async () => {
    const team = await prisma.team.findFirst({ select: { id: true } });
    if (!team) {
      console.warn('No teams in dev DB — skipping');
      return;
    }
    const res = await GET(mkReq(team.id), { params: { id: team.id } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TeamPayload;
    expect(body.team.id).toBe(team.id);
    expect(Array.isArray(body.recentForm)).toBe(true);
    expect(Array.isArray(body.squad)).toBe(true);
    expect(body).toHaveProperty('seasonStats');
  });
});
