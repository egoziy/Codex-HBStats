import Link from 'next/link';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type GameResult = 'home' | 'draw' | 'away';

function determineResult(homeScore: number, awayScore: number): GameResult {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

function resultLabel(result: GameResult): string {
  if (result === 'home') return 'ניצחון בית';
  if (result === 'away') return 'ניצחון חוץ';
  return 'תיקו';
}

function formatOdd(odd: number | null): string {
  if (odd == null) return '—';
  return odd.toFixed(2);
}

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams?: { view?: string; season?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);

  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' }, select: { id: true, name: true } });
  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;

  // Games with Match Winner odds that have completed
  const gamesWithOdds = await prisma.game.findMany({
    where: {
      status: 'COMPLETED',
      oddsValues: { some: { marketName: 'Match Winner' } },
      ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
    },
    include: {
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
      season: { select: { name: true } },
      oddsValues: {
        where: { marketName: 'Match Winner' },
        orderBy: { bookmakerName: 'asc' },
      },
    },
    orderBy: { dateTime: 'desc' },
  });

  // Games with API predictions that have completed
  const gamesWithPredictions = await prisma.gamePrediction.findMany({
    where: {
      game: {
        status: 'COMPLETED',
        ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
      },
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { nameHe: true, nameEn: true } },
          awayTeam: { select: { nameHe: true, nameEn: true } },
          competition: { select: { nameHe: true, nameEn: true } },
          season: { select: { name: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'desc' } },
  });

  // Analysis: for each game, determine favorite by odds and check if correct
  const analysisRows = gamesWithOdds.map((game) => {
    const result = determineResult(game.homeScore ?? 0, game.awayScore ?? 0);

    // Average odds per selection across bookmakers
    const homeOdds = game.oddsValues.filter((o) => o.selectionValue === 'Home');
    const drawOdds = game.oddsValues.filter((o) => o.selectionValue === 'Draw');
    const awayOdds = game.oddsValues.filter((o) => o.selectionValue === 'Away');

    const avgHome = homeOdds.length ? homeOdds.reduce((s, o) => s + o.odd, 0) / homeOdds.length : null;
    const avgDraw = drawOdds.length ? drawOdds.reduce((s, o) => s + o.odd, 0) / drawOdds.length : null;
    const avgAway = awayOdds.length ? awayOdds.reduce((s, o) => s + o.odd, 0) / awayOdds.length : null;

    // Favorite = lowest average odd
    let favorite: GameResult = 'home';
    let favoriteOdd = avgHome;
    if (avgAway != null && (favoriteOdd == null || avgAway < favoriteOdd)) {
      favorite = 'away';
      favoriteOdd = avgAway;
    }
    if (avgDraw != null && (favoriteOdd == null || avgDraw < favoriteOdd)) {
      favorite = 'draw';
      favoriteOdd = avgDraw;
    }

    const favoriteWon = favorite === result;

    // Was it an upset? Favorite lost and result had high odds
    const resultOdd = result === 'home' ? avgHome : result === 'away' ? avgAway : avgDraw;
    const isUpset = !favoriteWon && resultOdd != null && resultOdd > 3.0;

    return {
      gameId: game.id,
      date: game.dateTime,
      homeTeam: game.homeTeam.nameHe || game.homeTeam.nameEn,
      awayTeam: game.awayTeam.nameHe || game.awayTeam.nameEn,
      competition: game.competition?.nameHe || game.competition?.nameEn || '',
      season: game.season.name,
      homeScore: game.homeScore ?? 0,
      awayScore: game.awayScore ?? 0,
      result,
      avgHome,
      avgDraw,
      avgAway,
      favorite,
      favoriteOdd,
      favoriteWon,
      resultOdd,
      isUpset,
      bookmakerCount: new Set(game.oddsValues.map((o) => o.bookmakerName)).size,
    };
  });

  // Prediction analysis
  const predictionRows = gamesWithPredictions.map((pred) => {
    const game = pred.game;
    const result = determineResult(game.homeScore ?? 0, game.awayScore ?? 0);

    // Determine predicted result from percentages
    const pHome = pred.percentHome ?? 0;
    const pDraw = pred.percentDraw ?? 0;
    const pAway = pred.percentAway ?? 0;
    let predicted: GameResult = 'home';
    if (pAway > pHome && pAway > pDraw) predicted = 'away';
    else if (pDraw > pHome && pDraw > pAway) predicted = 'draw';

    return {
      gameId: game.id,
      date: game.dateTime,
      homeTeam: game.homeTeam.nameHe || game.homeTeam.nameEn,
      awayTeam: game.awayTeam.nameHe || game.awayTeam.nameEn,
      competition: game.competition?.nameHe || game.competition?.nameEn || '',
      homeScore: game.homeScore ?? 0,
      awayScore: game.awayScore ?? 0,
      result,
      predicted,
      correct: predicted === result,
      pHome,
      pDraw,
      pAway,
      advice: pred.adviceHe || pred.adviceEn || '',
      winnerName: pred.winnerTeamNameHe || pred.winnerTeamNameEn || '',
    };
  });

  // Summary stats
  const totalOddsGames = analysisRows.length;
  const favoriteWins = analysisRows.filter((r) => r.favoriteWon).length;
  const upsets = analysisRows.filter((r) => r.isUpset).length;
  const draws = analysisRows.filter((r) => r.result === 'draw').length;
  const homeWins = analysisRows.filter((r) => r.result === 'home').length;
  const awayWins = analysisRows.filter((r) => r.result === 'away').length;
  const favoriteAccuracy = totalOddsGames > 0 ? Math.round((favoriteWins / totalOddsGames) * 100) : 0;

  const totalPredGames = predictionRows.length;
  const predCorrect = predictionRows.filter((r) => r.correct).length;
  const predAccuracy = totalPredGames > 0 ? Math.round((predCorrect / totalPredGames) * 100) : 0;

  return (
    <div className={`min-h-screen px-4 py-8 ${displayMode === 'premier' ? 'bg-[linear-gradient(180deg,#f7fbff_0%,#edf2ff_100%)]' : 'bg-stone-100'}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(135deg,#1e1b4b,#312e81_45%,#4f46e5)] p-6 text-white shadow-md">
          <p className="text-sm font-semibold tracking-[0.25em] text-indigo-200">ניתוח</p>
          <h1 className="mt-2 text-3xl font-black">תחזיות ויחסים</h1>
          <p className="mt-3 max-w-3xl text-white/80">
            ניתוח דיוק תחזיות ויחסי הימורים מול תוצאות בפועל. כולל אחוז דיוק הפייבוריט, הפתעות, וחלוקת תוצאות.
          </p>
          <form className="mt-5 flex flex-wrap items-center gap-3" action="/predictions">
            <input type="hidden" name="view" value={displayMode} />
            <select name="season" defaultValue={selectedSeasonId || ''} className="rounded-2xl border border-white/30 bg-white px-4 py-3 text-sm font-bold text-slate-900">
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="rounded-full bg-white px-5 py-3 text-sm font-bold text-indigo-900">הצג</button>
          </form>
        </section>

        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="משחקים עם יחסים" value={String(totalOddsGames)} />
          <SummaryCard label="דיוק פייבוריט" value={totalOddsGames > 0 ? `${favoriteAccuracy}%` : '—'} highlight />
          <SummaryCard label="הפתעות" value={String(upsets)} tone="red" />
          <SummaryCard label="תחזיות API" value={totalPredGames > 0 ? `${predAccuracy}% (${predCorrect}/${totalPredGames})` : 'אין נתונים'} />
        </section>

        {/* Result distribution */}
        {totalOddsGames > 0 ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">חלוקת תוצאות</h2>
            <p className="mt-1 text-sm text-slate-500">מתוך {totalOddsGames} משחקים שהסתיימו ויש עבורם יחסי הימורים.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <DistributionBar label="ניצחון בית" count={homeWins} total={totalOddsGames} color="bg-emerald-500" />
              <DistributionBar label="תיקו" count={draws} total={totalOddsGames} color="bg-amber-500" />
              <DistributionBar label="ניצחון חוץ" count={awayWins} total={totalOddsGames} color="bg-blue-500" />
            </div>
          </section>
        ) : null}

        {/* Odds analysis table */}
        {analysisRows.length > 0 ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">ניתוח יחסים מול תוצאות</h2>
            <p className="mt-1 text-sm text-slate-500">ממוצע יחסים מכל בתי ההימורים, פייבוריט לפי היחס הנמוך ביותר.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="px-3 py-3">תאריך</th>
                    <th className="px-3 py-3">משחק</th>
                    <th className="px-3 py-3">תוצאה</th>
                    <th className="px-3 py-3">יחס בית</th>
                    <th className="px-3 py-3">תיקו</th>
                    <th className="px-3 py-3">יחס חוץ</th>
                    <th className="px-3 py-3">פייבוריט</th>
                    <th className="px-3 py-3">צדק?</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisRows.map((row) => (
                    <tr key={row.gameId} className={`border-b border-slate-50 ${row.isUpset ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(row.date)}
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/games/${row.gameId}?view=${displayMode}`} className="font-bold text-slate-800 hover:text-indigo-700">
                          {row.homeTeam} - {row.awayTeam}
                        </Link>
                        <div className="text-[10px] text-slate-400">{row.competition}</div>
                      </td>
                      <td className="px-3 py-3 font-black text-slate-900">{row.homeScore}-{row.awayScore}</td>
                      <td className={`px-3 py-3 font-semibold ${row.favorite === 'home' ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {formatOdd(row.avgHome)}
                      </td>
                      <td className={`px-3 py-3 font-semibold ${row.favorite === 'draw' ? 'text-amber-700' : 'text-slate-500'}`}>
                        {formatOdd(row.avgDraw)}
                      </td>
                      <td className={`px-3 py-3 font-semibold ${row.favorite === 'away' ? 'text-blue-700' : 'text-slate-500'}`}>
                        {formatOdd(row.avgAway)}
                      </td>
                      <td className="px-3 py-3 text-xs font-bold text-slate-700">{resultLabel(row.favorite)}</td>
                      <td className="px-3 py-3 text-center">
                        {row.favoriteWon ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">V</span>
                        ) : row.isUpset ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-black text-red-700">!</span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">X</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* API Predictions table */}
        {predictionRows.length > 0 ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">תחזיות API</h2>
            <p className="mt-1 text-sm text-slate-500">תחזיות שנמשכו מ-API-Football עם אחוזים לכל תוצאה.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="px-3 py-3">תאריך</th>
                    <th className="px-3 py-3">משחק</th>
                    <th className="px-3 py-3">תוצאה</th>
                    <th className="px-3 py-3">% בית</th>
                    <th className="px-3 py-3">% תיקו</th>
                    <th className="px-3 py-3">% חוץ</th>
                    <th className="px-3 py-3">תחזית</th>
                    <th className="px-3 py-3">צדק?</th>
                  </tr>
                </thead>
                <tbody>
                  {predictionRows.map((row) => (
                    <tr key={row.gameId} className={`border-b border-slate-50 ${row.correct ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(row.date)}
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/games/${row.gameId}?view=${displayMode}`} className="font-bold text-slate-800 hover:text-indigo-700">
                          {row.homeTeam} - {row.awayTeam}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-black text-slate-900">{row.homeScore}-{row.awayScore}</td>
                      <td className="px-3 py-3 font-semibold text-emerald-700">{row.pHome}%</td>
                      <td className="px-3 py-3 font-semibold text-amber-700">{row.pDraw}%</td>
                      <td className="px-3 py-3 font-semibold text-blue-700">{row.pAway}%</td>
                      <td className="px-3 py-3 text-xs font-bold">{resultLabel(row.predicted)}</td>
                      <td className="px-3 py-3 text-center">
                        {row.correct ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">V</span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-black text-red-700">X</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Empty state */}
        {analysisRows.length === 0 && predictionRows.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            <div className="text-lg font-bold">אין נתונים לניתוח</div>
            <p className="mt-2 text-sm">
              צריך למשוך נתוני יחסים ותחזיות דרך פאנל האדמין כדי שהניתוח יתמלא.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: 'red' }) {
  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${
      highlight ? 'border-indigo-200 bg-indigo-50' : tone === 'red' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
    }`}>
      <div className={`text-xs font-semibold tracking-[0.18em] ${highlight ? 'text-indigo-500' : tone === 'red' ? 'text-red-500' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-2 text-3xl font-black ${highlight ? 'text-indigo-900' : tone === 'red' ? 'text-red-900' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function DistributionBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <span className="text-lg font-black text-slate-900">{count} ({pct}%)</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
