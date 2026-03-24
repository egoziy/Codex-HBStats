import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { apiFootballFetch } from '@/lib/api-football';

const TEAM_TRANSLATIONS: Record<string, string> = {
  'Hapoel Beer Sheva': 'הפועל באר שבע',
  'Maccabi Tel Aviv': 'מכבי תל אביב',
  'Maccabi Haifa': 'מכבי חיפה',
  'Beitar Jerusalem': 'בית"ר ירושלים',
  'Hapoel Haifa': 'הפועל חיפה',
  'Maccabi Netanya': 'מכבי נתניה',
  'Bnei Sakhnin': 'בני סכנין',
  'Hapoel Jerusalem': 'הפועל ירושלים',
  'Maccabi Petah Tikva': 'מכבי פתח תקווה',
  'Hapoel Tel Aviv': 'הפועל תל אביב',
  'Ashdod': 'מ.ס. אשדוד',
  'Hapoel Hadera': 'הפועל חדרה',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
};

function translateTeamName(name: string) {
  return TEAM_TRANSLATIONS[name] || name;
}

export async function GET(request: NextRequest) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה.' }, { status: 403 });
  }

  const season = request.nextUrl.searchParams.get('season');
  const leagueId = request.nextUrl.searchParams.get('leagueId');

  if (!season || !leagueId) {
    return NextResponse.json({ error: 'חסרה עונה או ליגה.' }, { status: 400 });
  }

  try {
    const rows = await apiFootballFetch(`/teams?league=${leagueId}&season=${season}`);

    const teams = rows
      .map((row: any) => ({
        id: String(row?.team?.id || ''),
        nameEn: row?.team?.name || '',
        nameHe: translateTeamName(row?.team?.name || ''),
        logoUrl: row?.team?.logo || null,
      }))
      .filter((team: { id: string; nameEn: string }) => team.id && team.nameEn);

    return NextResponse.json({ teams });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'לא ניתן לטעון קבוצות.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
