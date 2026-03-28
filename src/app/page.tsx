import Link from 'next/link';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import { fetchTelegramChannelMessages, type TelegramChannelMessage } from '@/lib/telegram';
import { getCurrentSeasonStartYear, getHomepageLiveSnapshots } from '@/lib/home-live';
import HomeLivePanel from '@/components/HomeLivePanel';

export const dynamic = 'force-dynamic';

type SearchParams = { team?: string };

type HeadToHeadGroup = {
  gameId: string;
  fixtureLabel: string;
  fixtureHref: string;
  roundLabel: string | null;
  items: Array<{
    id: string;
    date: Date | null;
    homeTeamName: string;
    awayTeamName: string;
    scoreLabel: string;
  }>;
};

function formatDate(date: Date | null | undefined, withTime = false) {
  if (!date) return 'לא זמין';
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function getRoundLabel(game: { roundNameHe: string | null; roundNameEn: string | null }) {
  return game.roundNameHe || game.roundNameEn || null;
}

function getStatusLabel(status: string) {
  if (status === 'ONGOING') return 'חי';
  if (status === 'COMPLETED') return 'הסתיים';
  if (status === 'CANCELLED') return 'בוטל';
  return 'בקרוב';
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getTelegramPreviewTitle(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'עדכון חדש מספורט בנגב';
  return truncateText(normalized.split('\n')[0].replace(/[!?.:;,]+$/g, ''), 80);
}

function shouldCollapseTelegramText(text: string) {
  return text.length > 220 || text.split('\n').length > 3;
}

function gameMatchesPreferredTeam(
  game: { homeTeamId?: string; awayTeamId?: string; game?: { homeTeamId: string; awayTeamId: string } | null } | null,
  selectedTeam: { id: string; apiFootballId: number | null } | null
) {
  if (!selectedTeam || !game) return true;
  if (game.game) return game.game.homeTeamId === selectedTeam.id || game.game.awayTeamId === selectedTeam.id;
  return game.homeTeamId === selectedTeam.id || game.awayTeamId === selectedTeam.id;
}

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const latestSeason = await prisma.season.findFirst({
    where: {
      year: {
        lte: getCurrentSeasonStartYear(),
      },
    },
    orderBy: { year: 'desc' },
  });

  if (!latestSeason) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <EmptyPanel title="עדיין אין נתונים להצגה" text="צריך קודם למשוך עונה, משחקים ונתוני בית כדי שדף הבית יציג תוכן." />
      </div>
    );
  }

  const now = new Date();
  const selectedTeamId = typeof searchParams?.team === 'string' ? searchParams.team : '';

  const [seasonTeams, rawStandings] = await Promise.all([
    prisma.team.findMany({
      where: { seasonId: latestSeason.id },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      select: { id: true, apiFootballId: true, nameHe: true, nameEn: true },
    }),
    prisma.standing.findMany({ where: { seasonId: latestSeason.id }, include: { team: true } }),
  ]);

  const selectedTeam = seasonTeams.find((team) => team.id === selectedTeamId) || null;
  const sortedStandings = sortStandings(rawStandings);
  const compactStandings = (() => {
    if (!sortedStandings.length) return [];
    if (!selectedTeam) return sortedStandings.slice(0, 6);
    const selectedIndex = sortedStandings.findIndex((row) => row.teamId === selectedTeam.id);
    if (selectedIndex === -1) return sortedStandings.slice(0, 6);
    const start = Math.max(0, selectedIndex - 2);
    return sortedStandings.slice(start, Math.min(sortedStandings.length, start + 5));
  })();

  const [nextGame, lastGame, predictionsRaw, headToHeadEntriesRaw, nextRoundGamesRaw, telegramMessages, initialLiveItems] =
    await Promise.all([
      prisma.game.findFirst({
        where: {
          seasonId: latestSeason.id,
          status: 'SCHEDULED',
          dateTime: { gte: now },
          ...(selectedTeam ? { OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }] } : {}),
        },
        include: { homeTeam: true, awayTeam: true, competition: true, prediction: true },
        orderBy: [{ dateTime: 'asc' }],
      }),
      prisma.game.findFirst({
        where: {
          seasonId: latestSeason.id,
          status: 'COMPLETED',
          ...(selectedTeam ? { OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }] } : {}),
        },
        include: { homeTeam: true, awayTeam: true, competition: true },
        orderBy: [{ dateTime: 'desc' }],
      }),
      prisma.gamePrediction.findMany({
        where: { seasonId: latestSeason.id },
        include: { game: { include: { homeTeam: true, awayTeam: true, competition: true } } },
        orderBy: { game: { dateTime: 'asc' } },
        take: 12,
      }),
      prisma.gameHeadToHeadEntry.findMany({
        where: { seasonId: latestSeason.id },
        include: { game: { include: { homeTeam: true, awayTeam: true, competition: true } } },
        orderBy: [{ gameId: 'asc' }, { relatedDate: 'desc' }],
        take: 60,
      }),
      prisma.game.findMany({
        where: {
          seasonId: latestSeason.id,
          status: 'SCHEDULED',
          dateTime: { gte: now },
          ...(selectedTeam ? { OR: [{ homeTeamId: selectedTeam.id }, { awayTeamId: selectedTeam.id }] } : {}),
        },
        include: { homeTeam: true, awayTeam: true, competition: true, prediction: true },
        orderBy: [{ dateTime: 'asc' }],
        take: 24,
      }),
      fetchTelegramChannelMessages('sportbanegev', 5).catch(() => []),
      getHomepageLiveSnapshots(null, { limit: 6 }),
    ]);

  const predictions = predictionsRaw
    .filter((prediction) => prediction.game.status !== 'CANCELLED')
    .filter((prediction) => gameMatchesPreferredTeam(prediction, selectedTeam))
    .slice(0, 4);
  const headToHeadEntries = headToHeadEntriesRaw.filter((entry) => gameMatchesPreferredTeam(entry, selectedTeam));
  const nextRoundLabel = nextGame ? getRoundLabel(nextGame) : null;
  const nextRoundCompetitionId = nextGame?.competitionId || null;
  const nextRoundGames = nextGame
    ? nextRoundGamesRaw
        .filter((game) => (nextRoundCompetitionId ? game.competitionId === nextRoundCompetitionId : true) && getRoundLabel(game) === nextRoundLabel)
        .slice(0, 6)
    : [];

  const groupedHeadToHeadMap = new Map<string, HeadToHeadGroup>();
  for (const entry of headToHeadEntries) {
    if (!groupedHeadToHeadMap.has(entry.gameId)) {
      groupedHeadToHeadMap.set(entry.gameId, {
        gameId: entry.gameId,
        fixtureLabel: `${getTeamLabel(entry.game.homeTeam)} - ${getTeamLabel(entry.game.awayTeam)}`,
        fixtureHref: `/games/${entry.game.id}`,
        roundLabel: getRoundLabel(entry.game),
        items: [],
      });
    }
    const group = groupedHeadToHeadMap.get(entry.gameId);
    if (!group || group.items.length >= 3) continue;
    group.items.push({
      id: entry.id,
      date: entry.relatedDate,
      homeTeamName: entry.homeTeamNameHe || entry.homeTeamNameEn || 'לא ידוע',
      awayTeamName: entry.awayTeamNameHe || entry.awayTeamNameEn || 'לא ידוע',
      scoreLabel: entry.homeScore !== null && entry.awayScore !== null ? `${entry.homeScore} - ${entry.awayScore}` : 'ללא תוצאה',
    });
  }

  const headToHeadGroups = Array.from(groupedHeadToHeadMap.values()).slice(0, 3);
  const featuredTelegramMessage = telegramMessages[0] || null;
  const telegramFeedMessages = featuredTelegramMessage ? telegramMessages.slice(1) : telegramMessages;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7efe3_0%,#efe3d3_100%)]">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6">
        <section className="rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Home</p>
              <h1 className="mt-1 text-2xl font-black text-stone-900">מרכז המשחקים של העונה {latestSeason.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">אפשר לבחור קבוצה מועדפת, לראות משחק קרוב ואחרון, ולקבל מבט מהיר על לייב, תחזיות, טבלה וטלגרם.</p>
            </div>
            <form method="get" className="grid gap-3 rounded-[22px] border border-red-100 bg-[linear-gradient(180deg,#fff8f6_0%,#fff_100%)] p-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-stone-700">קבוצה מועדפת</span>
                <select name="team" defaultValue={selectedTeam?.id || ''} className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm">
                  <option value="">כל הקבוצות</option>
                  {seasonTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.nameHe || team.nameEn}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">עדכן</button>
              {selectedTeam ? <Link href="/" className="rounded-full border border-stone-300 px-5 py-3 text-center text-sm font-bold text-stone-700">נקה</Link> : <div />}
            </form>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">עונה פעילה: {latestSeason.name}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedTeam ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>
              {selectedTeam ? `תצוגה ממוקדת: ${selectedTeam.nameHe || selectedTeam.nameEn}` : 'תצוגה: כל הקבוצות'}
            </span>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_0.7fr_1fr]">
          <Panel eyebrow="Upcoming" title="המשחק הקרוב" actionHref="/games" actionLabel="לוח משחקים">
            {nextGame ? <GameSpotlightCard game={nextGame} predictionLabel={nextGame.prediction?.winnerTeamNameHe || nextGame.prediction?.winnerTeamNameEn || null} /> : <EmptyState text="אין כרגע משחק עתידי שמתאים לחתך שנבחר." />}
          </Panel>
          <Panel eyebrow="Latest" title="המשחק האחרון" actionHref="/games" actionLabel="לכל המשחקים">
            {lastGame ? <GameSpotlightCard game={lastGame} /> : <EmptyState text="אין כרגע משחק אחרון לחתך שנבחר." />}
          </Panel>
          <Panel eyebrow="Standings" title="טבלה מצומצמת" actionHref="/standings" actionLabel="לטבלה המלאה">
            {compactStandings.length ? (
              <div className="overflow-hidden rounded-[20px] border border-stone-200">
                <table className="min-w-full text-right">
                  <thead className="bg-stone-100 text-xs text-stone-500"><tr><th className="px-4 py-2.5">מיקום</th><th className="px-4 py-2.5">קבוצה</th><th className="px-4 py-2.5">נקודות</th></tr></thead>
                  <tbody>
                    {compactStandings.map((row) => {
                      const highlighted = selectedTeam?.id === row.teamId;
                      return (
                        <tr key={row.id} className={`border-t border-stone-100 text-sm ${highlighted ? 'bg-red-50' : 'bg-white'}`}>
                          <td className="px-4 py-2.5 font-black text-stone-900">{row.displayPosition}</td>
                          <td className="px-4 py-2.5"><Link href={`/teams/${row.teamId}`} className={`font-semibold ${highlighted ? 'text-red-900' : 'text-stone-900'}`}>{row.team.nameHe || row.team.nameEn}</Link></td>
                          <td className="px-4 py-2.5 font-black text-stone-900">{row.adjustedPoints}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState text="אין כרגע טבלה זמינה לעונה הפעילה." />}
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel eyebrow="Live" title="לייב" actionHref="/live" actionLabel="לכל המשחקים">
            <HomeLivePanel initialItems={initialLiveItems} selectedTeamId={null} limit={6} />
          </Panel>
          <Panel eyebrow="Predictions" title="תחזיות" actionHref="/games" actionLabel="למשחקים">
            <div className="grid gap-3">
              {predictions.map((prediction) => (
                <Link key={prediction.id} href={`/games/${prediction.game.id}`} className="rounded-[22px] border border-stone-200 bg-stone-50 p-4 transition hover:border-amber-400 hover:bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-stone-500">{prediction.game.competition?.nameHe || prediction.game.competition?.nameEn || 'ללא מסגרת'}</div>
                      <div className="mt-1 text-lg font-black text-stone-900">{getTeamLabel(prediction.game.homeTeam)} - {getTeamLabel(prediction.game.awayTeam)}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(prediction.game.dateTime, true)}</div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{getStatusLabel(prediction.game.status)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <InfoChip label="תחזית" value={prediction.winnerTeamNameHe || prediction.winnerTeamNameEn || 'ללא הכרעה'} />
                    <InfoChip label="בית" value={prediction.percentHome !== null ? `${prediction.percentHome}%` : '—'} />
                    <InfoChip label="חוץ" value={prediction.percentAway !== null ? `${prediction.percentAway}%` : '—'} />
                  </div>
                </Link>
              ))}
              {predictions.length === 0 ? <EmptyState text="אין כרגע תחזיות שמתאימות לחתך שנבחר." /> : null}
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Panel eyebrow="Head To Head" title="ראש בראש" actionHref="/games" actionLabel="למשחקים">
            <div className="grid gap-3">
              {headToHeadGroups.map((group) => (
                <div key={group.gameId} className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link href={group.fixtureHref} className="text-lg font-black text-stone-900 hover:text-red-800">{group.fixtureLabel}</Link>
                      <div className="mt-1 text-xs text-stone-500">{group.roundLabel || 'מפגש קרוב'}</div>
                    </div>
                    <span className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-bold text-white">3 מפגשים אחרונים</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {group.items.map((item) => (
                      <div key={item.id} className="grid gap-2 rounded-2xl bg-white px-4 py-2.5 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
                        <div className="font-semibold text-stone-800">{item.homeTeamName}</div>
                        <div className="text-center text-base font-black text-stone-900">{item.scoreLabel}</div>
                        <div className="font-semibold text-stone-800">{item.awayTeamName}</div>
                        <div className="text-xs text-stone-500">{formatDate(item.date)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {headToHeadGroups.length === 0 ? <EmptyState text="אין כרגע נתוני ראש בראש שמתאימים לחתך שנבחר." /> : null}
            </div>
          </Panel>

          <Panel eyebrow="Next Round" title="המשחקים הבאים במחזור הקרוב" actionHref="/games" actionLabel="לוח משחקים">
            <div className="grid gap-3">
              {nextRoundGames.map((game) => (
                <Link key={game.id} href={`/games/${game.id}`} className="rounded-[22px] border border-stone-200 bg-stone-50 p-4 transition hover:border-stone-400 hover:bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-stone-500">{game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת'}</div>
                      <div className="mt-1 text-lg font-black text-stone-900">{getTeamLabel(game.homeTeam)} - {getTeamLabel(game.awayTeam)}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatDate(game.dateTime, true)}</div>
                    </div>
                    <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">{getStatusLabel(game.status)}</span>
                  </div>
                </Link>
              ))}
              {nextRoundGames.length === 0 ? <EmptyState text="אין כרגע משחקי מחזור קרוב שמתאימים לחתך שנבחר." /> : null}
            </div>
          </Panel>
        </section>

        <section>
          <Panel eyebrow="Telegram" title="עדכונים מ ספורט בנגב - הקבוצה של הדרום" actionHref="https://t.me/sportbanegev" actionLabel="לערוץ">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-stone-600">
              <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-900">5 ההודעות האחרונות</span>
              <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-700">תמונות ותוכן מלא בלחיצה</span>
            </div>

            {featuredTelegramMessage ? (
              <div className="mb-4 overflow-hidden rounded-[26px] border border-red-200 bg-[linear-gradient(180deg,#fff7f5_0%,#ffffff_100%)] shadow-sm">
                <div className="grid gap-0 xl:grid-cols-[1.02fr_0.98fr]">
                  <div className="relative min-h-[15rem] overflow-hidden">
                    {featuredTelegramMessage.imageUrl ? (
                      <img src={featuredTelegramMessage.imageUrl} alt="עדכון טלגרם" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.28),transparent_25%),linear-gradient(135deg,#450a0a,#991b1b_58%,#1f2937)]" />
                    )}
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.08)_0%,rgba(17,24,39,0.76)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-white backdrop-blur-sm">ספורט בנגב</div>
                      <div className="mt-3 max-w-3xl text-2xl font-black leading-tight text-white">{getTelegramPreviewTitle(featuredTelegramMessage.text)}</div>
                      <div className="mt-2 text-xs font-medium text-white/80">{formatDate(featuredTelegramMessage.publishedAt, true)}</div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-red-900">עדכון מרכזי מהקבוצה של הדרום</div>
                        <span className="rounded-full bg-red-100 px-3 py-1 text-[11px] font-bold text-red-900">טלגרם</span>
                      </div>
                      <TelegramMessageBody message={featuredTelegramMessage} featured />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-700">חדשות, עדכונים ודיווחים</span>
                      <a href={featuredTelegramMessage.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-red-800">פתח בטלגרם</a>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {telegramFeedMessages.map((message) => (
                <article key={message.id} className="overflow-hidden rounded-[22px] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md">
                  {message.imageUrl ? (
                    <img src={message.imageUrl} alt="עדכון טלגרם" className="h-36 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-end bg-[linear-gradient(160deg,#7f1d1d,#111827)] p-3">
                      <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-white">דרום</div>
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-xs font-semibold text-red-900">ספורט בנגב</div>
                      <div className="text-[11px] text-stone-500">{formatDate(message.publishedAt, true)}</div>
                    </div>
                    <div className="mt-2 text-base font-black leading-6 text-stone-900">{getTelegramPreviewTitle(message.text)}</div>
                    <TelegramMessageBody message={message} />
                    <div className="mt-3"><a href={message.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-red-800">לפתיחה בטלגרם</a></div>
                  </div>
                </article>
              ))}
              {telegramMessages.length === 0 ? <EmptyState text="לא הצלחנו לטעון כרגע את הודעות הטלגרם מהערוץ. אפשר לנסות שוב ברענון הדף." /> : null}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ eyebrow, title, actionHref, actionLabel, children }: { eyebrow: string; title: string; actionHref: string; actionLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-700">{eyebrow}</p>
          <h2 className="text-xl font-black text-stone-900">{title}</h2>
        </div>
        {actionHref.startsWith('http') ? <a href={actionHref} target="_blank" rel="noreferrer" className="text-xs font-bold text-red-800">{actionLabel}</a> : <Link href={actionHref} className="text-xs font-bold text-red-800">{actionLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

function GameSpotlightCard({ game, predictionLabel }: { game: { id: string; dateTime: Date; status: string; competition: { nameHe: string | null; nameEn: string } | null; homeTeam: { nameHe: string | null; nameEn: string }; awayTeam: { nameHe: string | null; nameEn: string }; homeScore?: number | null; awayScore?: number | null }; predictionLabel?: string | null }) {
  const completed = game.status === 'COMPLETED';
  return (
    <Link href={`/games/${game.id}`} className="block rounded-[22px] border border-red-200 bg-[linear-gradient(180deg,#fff8f6_0%,#fff_100%)] p-4 transition hover:border-red-400 hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-stone-500">{game.competition?.nameHe || game.competition?.nameEn || 'ללא מסגרת'}</div>
          <div className="mt-1 text-xl font-black text-stone-900">{getTeamLabel(game.homeTeam)} - {getTeamLabel(game.awayTeam)}</div>
          <div className="mt-1 text-xs text-stone-500">{formatDate(game.dateTime, true)}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-stone-900 text-white' : 'bg-red-100 text-red-900'}`}>{getStatusLabel(game.status)}</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <InfoChip label={completed ? 'תוצאה' : 'מועד'} value={completed ? `${game.homeScore ?? 0} - ${game.awayScore ?? 0}` : formatDate(game.dateTime, true)} />
        <InfoChip label="תחזית" value={predictionLabel || 'לא זמינה'} />
      </div>
    </Link>
  );
}

function TelegramMessageBody({ message, featured = false }: { message: TelegramChannelMessage; featured?: boolean }) {
  const collapsible = shouldCollapseTelegramText(message.text);
  const textClasses = featured ? 'text-sm leading-7 text-stone-700' : 'text-sm leading-6 text-stone-700';
  if (!collapsible) return <div className={`mt-3 whitespace-pre-line ${textClasses}`}>{message.text}</div>;
  return (
    <details className="group mt-3">
      <div className={`whitespace-pre-line group-open:hidden ${textClasses}`}>{truncateText(message.text, featured ? 320 : 140)}</div>
      <div className={`hidden whitespace-pre-line rounded-2xl bg-stone-50 px-4 py-3 group-open:block ${textClasses}`}>{message.text}</div>
      <summary className="mt-2 cursor-pointer list-none text-xs font-bold text-red-800 marker:hidden">{`הצג ${featured ? 'תוכן מלא' : 'עוד'}`}</summary>
    </details>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white px-3 py-2.5"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</div><div className="mt-1 text-sm font-black text-stone-900">{value}</div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">{text}</div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-black text-stone-900">{title}</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-600">{text}</p>
      <div className="mt-6"><Link href="/admin" className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white">לאזור האדמין</Link></div>
    </section>
  );
}
