import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get latest odds per match (by winnerId, latest fetchedAt)
  const odds = await prisma.winnerOdds.findMany({
    where: {
      matchTime: { gte: today, lt: tomorrow },
    },
    orderBy: { fetchedAt: 'desc' },
  });

  // Deduplicate — keep only latest per winnerId
  const seen = new Set<number>();
  const unique = odds.filter(o => {
    if (seen.has(o.winnerId)) return false;
    seen.add(o.winnerId);
    return true;
  });

  return NextResponse.json(unique);
}
