import { GET } from '../route';
import { NextRequest } from 'next/server';
import type { LivePayload } from '@shared/types/mobile-api';

function mkReq(): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/live');
}

describe('GET /api/mobile/v1/live — LivePayload contract', () => {
  test('returns 200 with groups + lastUpdated', async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as LivePayload;
    expect(body).toHaveProperty('groups');
    expect(body).toHaveProperty('lastUpdated');
    expect(Array.isArray(body.groups)).toBe(true);
    expect(typeof body.lastUpdated).toBe('string');
    // lastUpdated should parse as a valid ISO date
    expect(new Date(body.lastUpdated).toString()).not.toBe('Invalid Date');
  });

  test('each group has league + matches array', async () => {
    const res = await GET(mkReq());
    const body = (await res.json()) as LivePayload;
    for (const group of body.groups) {
      expect(group.league).toHaveProperty('id');
      expect(group.league).toHaveProperty('nameHe');
      expect(group.league).toHaveProperty('nameEn');
      expect(Array.isArray(group.matches)).toBe(true);
      // Each match has recentEvents capped at 3
      for (const match of group.matches) {
        expect(match.recentEvents.length).toBeLessThanOrEqual(3);
      }
    }
  });
});
