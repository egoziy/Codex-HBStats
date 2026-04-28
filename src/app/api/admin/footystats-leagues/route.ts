import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { fsGetLeagueList } from '@/lib/footystats';

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
  }

  try {
    const all = await fsGetLeagueList();
    const israeli = all.filter((l) =>
      l.country?.toLowerCase().includes('israel')
    );
    return NextResponse.json({ leagues: israeli });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'שגיאה בטעינת ליגות' },
      { status: 500 }
    );
  }
}
