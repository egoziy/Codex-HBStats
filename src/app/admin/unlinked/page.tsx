import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminUnlinkedClient from '@/components/AdminUnlinkedClient';

export const dynamic = 'force-dynamic';

export default async function AdminUnlinkedPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל.
          </p>
          <div className="mt-6">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
          </div>
        </div>
      </div>
    );
  }

  // GameLineupEntry rows with no playerId but a participantName — created by
  // the Flashscore enrichment when its player-name → DB-player match failed.
  const unlinkedLineups = await prisma.gameLineupEntry.findMany({
    where: { playerId: null, participantName: { not: null } },
    include: {
      game: {
        select: {
          id: true,
          dateTime: true,
          homeTeam: { select: { id: true, nameHe: true, nameEn: true } },
          awayTeam: { select: { id: true, nameHe: true, nameEn: true } },
        },
      },
      team: { select: { id: true, nameHe: true, nameEn: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const unlinkedEvents = await prisma.gameEvent.findMany({
    where: { playerId: null, participantName: { not: null }, notesEn: 'flashscore' },
    include: {
      game: {
        select: {
          id: true,
          dateTime: true,
          homeTeam: { select: { id: true, nameHe: true, nameEn: true } },
          awayTeam: { select: { id: true, nameHe: true, nameEn: true } },
        },
      },
      eventTeam: { select: { id: true, nameHe: true, nameEn: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // Pre-load team squads we'll need so admin can pick from a dropdown.
  const teamIds = new Set<string>();
  for (const row of unlinkedLineups) {
    if (row.team?.id) teamIds.add(row.team.id);
  }
  for (const row of unlinkedEvents) {
    if (row.eventTeam?.id) teamIds.add(row.eventTeam.id);
  }
  const squads: Record<string, { id: string; nameHe: string; nameEn: string; jerseyNumber: number | null }[]> = {};
  if (teamIds.size > 0) {
    const players = await prisma.player.findMany({
      where: { teamId: { in: Array.from(teamIds) } },
      select: { id: true, nameHe: true, nameEn: true, jerseyNumber: true, teamId: true },
      orderBy: [{ jerseyNumber: 'asc' }],
    });
    for (const p of players) {
      if (!squads[p.teamId]) squads[p.teamId] = [];
      squads[p.teamId].push({ id: p.id, nameHe: p.nameHe, nameEn: p.nameEn, jerseyNumber: p.jerseyNumber });
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-stone-900">קישור ידני — שחקנים לא מקושרים</h1>
          <Link href="/admin" className="text-sm font-bold text-stone-600 underline">חזרה לאדמין</Link>
        </div>
        <p className="mb-6 text-sm text-stone-600 leading-7">
          רשומות שנוצרו מ-Flashscore אבל שם השחקן לא הותאם אוטומטית לשחקן ב-DB.
          בחר את השחקן הנכון מהרשימה כדי להשלים את הקישור.
        </p>
        <AdminUnlinkedClient
          unlinkedLineups={unlinkedLineups.map((r) => ({
            id: r.id,
            participantName: r.participantName!,
            jerseyNumber: r.jerseyNumber,
            role: r.role,
            gameId: r.game.id,
            gameDate: r.game.dateTime?.toISOString() ?? null,
            teamId: r.team?.id ?? null,
            teamName: r.team?.nameHe ?? r.team?.nameEn ?? null,
            opponentName:
              r.team?.id === r.game.homeTeam?.id
                ? (r.game.awayTeam?.nameHe ?? r.game.awayTeam?.nameEn ?? null)
                : (r.game.homeTeam?.nameHe ?? r.game.homeTeam?.nameEn ?? null),
          }))}
          unlinkedEvents={unlinkedEvents.map((e) => ({
            id: e.id,
            participantName: e.participantName!,
            type: e.type,
            minute: e.minute,
            gameId: e.game.id,
            gameDate: e.game.dateTime?.toISOString() ?? null,
            teamId: e.eventTeam?.id ?? null,
            teamName: e.eventTeam?.nameHe ?? e.eventTeam?.nameEn ?? null,
            opponentName:
              e.eventTeam?.id === e.game.homeTeam?.id
                ? (e.game.awayTeam?.nameHe ?? e.game.awayTeam?.nameEn ?? null)
                : (e.game.homeTeam?.nameHe ?? e.game.homeTeam?.nameEn ?? null),
          }))}
          squads={squads}
        />
      </div>
    </div>
  );
}
