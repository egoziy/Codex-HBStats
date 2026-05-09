import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Row = { name: string; value: string; sub?: string | null };

async function buildAllSections(seasonId: string) {
  // ── Team-level avg goals (home/away/scored/conceded) ──
  const teamAggRows = await prisma.$queryRaw<Array<{
    teamId: string; teamNameHe: string; gamesHome: number; goalsHomeFor: number;
    gamesAway: number; goalsAwayFor: number; goalsAgainst: number; gamesAll: number;
  }>>`
    WITH g_home AS (
      SELECT g."homeTeamId" AS team_id, COUNT(*) AS games, SUM(g."homeScore") AS goals_for, SUM(g."awayScore") AS goals_against
      FROM games g WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      GROUP BY g."homeTeamId"
    ),
    g_away AS (
      SELECT g."awayTeamId" AS team_id, COUNT(*) AS games, SUM(g."awayScore") AS goals_for, SUM(g."homeScore") AS goals_against
      FROM games g WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      GROUP BY g."awayTeamId"
    )
    SELECT
      t.id AS "teamId", t."nameHe" AS "teamNameHe",
      COALESCE(h.games, 0)::int AS "gamesHome", COALESCE(h.goals_for, 0)::int AS "goalsHomeFor",
      COALESCE(a.games, 0)::int AS "gamesAway", COALESCE(a.goals_for, 0)::int AS "goalsAwayFor",
      (COALESCE(h.goals_against, 0) + COALESCE(a.goals_against, 0))::int AS "goalsAgainst",
      (COALESCE(h.games, 0) + COALESCE(a.games, 0))::int AS "gamesAll"
    FROM teams t
    LEFT JOIN g_home h ON h.team_id = t.id
    LEFT JOIN g_away a ON a.team_id = t.id
    WHERE (h.games > 0 OR a.games > 0)
  `;

  const teamHomeGoalAvg: Row[] = teamAggRows
    .filter((r) => r.gamesHome > 0)
    .map((r) => ({ name: r.teamNameHe, value: (r.goalsHomeFor / r.gamesHome).toFixed(2), sub: `${r.goalsHomeFor} שערים / ${r.gamesHome} משחקי בית` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  const teamAwayGoalAvg: Row[] = teamAggRows
    .filter((r) => r.gamesAway > 0)
    .map((r) => ({ name: r.teamNameHe, value: (r.goalsAwayFor / r.gamesAway).toFixed(2), sub: `${r.goalsAwayFor} שערים / ${r.gamesAway} משחקי חוץ` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  const teamGoalsScored: Row[] = teamAggRows
    .map((r) => ({ name: r.teamNameHe, value: ((r.goalsHomeFor + r.goalsAwayFor) / r.gamesAll).toFixed(2), sub: `${r.goalsHomeFor + r.goalsAwayFor} שערים / ${r.gamesAll} משחקים` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  const teamGoalsConceded: Row[] = teamAggRows
    .map((r) => ({ name: r.teamNameHe, value: (r.goalsAgainst / r.gamesAll).toFixed(2), sub: `${r.goalsAgainst} ספיגות / ${r.gamesAll} משחקים` }))
    .sort((a, b) => Number(a.value) - Number(b.value));

  // ── Home / away success rate (% of points / max possible per side) ──
  const teamSuccessRows = await prisma.$queryRaw<Array<{
    teamId: string; teamNameHe: string;
    homePts: number; homeGames: number; awayPts: number; awayGames: number;
  }>>`
    WITH home_results AS (
      SELECT g."homeTeamId" AS team_id,
        SUM(CASE WHEN g."homeScore" > g."awayScore" THEN 3 WHEN g."homeScore" = g."awayScore" THEN 1 ELSE 0 END)::int AS pts,
        COUNT(*)::int AS games
      FROM games g WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      GROUP BY g."homeTeamId"
    ),
    away_results AS (
      SELECT g."awayTeamId" AS team_id,
        SUM(CASE WHEN g."awayScore" > g."homeScore" THEN 3 WHEN g."homeScore" = g."awayScore" THEN 1 ELSE 0 END)::int AS pts,
        COUNT(*)::int AS games
      FROM games g WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      GROUP BY g."awayTeamId"
    )
    SELECT
      t.id AS "teamId", t."nameHe" AS "teamNameHe",
      COALESCE(h.pts, 0)::int AS "homePts", COALESCE(h.games, 0)::int AS "homeGames",
      COALESCE(a.pts, 0)::int AS "awayPts", COALESCE(a.games, 0)::int AS "awayGames"
    FROM teams t
    LEFT JOIN home_results h ON h.team_id = t.id
    LEFT JOIN away_results a ON a.team_id = t.id
    WHERE (h.games > 0 OR a.games > 0)
  `;

  const homeSuccessRate: Row[] = teamSuccessRows
    .filter((r) => r.homeGames > 0)
    .map((r) => ({ name: r.teamNameHe, value: `${Math.round((r.homePts / (r.homeGames * 3)) * 100)}%`, sub: `${r.homePts}/${r.homeGames * 3} נק׳` }))
    .sort((a, b) => parseInt(b.value) - parseInt(a.value));

  const awaySuccessRate: Row[] = teamSuccessRows
    .filter((r) => r.awayGames > 0)
    .map((r) => ({ name: r.teamNameHe, value: `${Math.round((r.awayPts / (r.awayGames * 3)) * 100)}%`, sub: `${r.awayPts}/${r.awayGames * 3} נק׳` }))
    .sort((a, b) => parseInt(b.value) - parseInt(a.value));

  // ── Win when scoring first / not scoring first ──
  const winFirstRows = await prisma.$queryRaw<Array<{
    teamId: string; teamNameHe: string;
    firstScore: number; firstWin: number; secondScore: number; secondWin: number;
  }>>`
    WITH first_goals AS (
      SELECT DISTINCT ON (g.id) g.id AS game_id, ge."teamId" AS first_team_id
      FROM games g
      JOIN game_events ge ON ge."gameId" = g.id
      WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND ge.type IN ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL')
      ORDER BY g.id, ge.minute ASC, ge."sortOrder" ASC
    ),
    games_with_first AS (
      SELECT g.id, g."homeTeamId", g."awayTeamId", g."homeScore", g."awayScore",
             fg.first_team_id,
             CASE WHEN g."homeScore" > g."awayScore" THEN g."homeTeamId"
                  WHEN g."awayScore" > g."homeScore" THEN g."awayTeamId"
                  ELSE NULL END AS winner_id
      FROM games g LEFT JOIN first_goals fg ON fg.game_id = g.id
      WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal' AND g.status = 'COMPLETED'
    ),
    per_team AS (
      SELECT t.id AS "teamId", t."nameHe" AS "teamNameHe",
        SUM(CASE WHEN gf.first_team_id = t.id THEN 1 ELSE 0 END)::int AS "firstScore",
        SUM(CASE WHEN gf.first_team_id = t.id AND gf.winner_id = t.id THEN 1 ELSE 0 END)::int AS "firstWin",
        SUM(CASE WHEN gf.first_team_id IS NOT NULL AND gf.first_team_id <> t.id AND (gf."homeTeamId" = t.id OR gf."awayTeamId" = t.id) THEN 1 ELSE 0 END)::int AS "secondScore",
        SUM(CASE WHEN gf.first_team_id IS NOT NULL AND gf.first_team_id <> t.id AND gf.winner_id = t.id THEN 1 ELSE 0 END)::int AS "secondWin"
      FROM teams t LEFT JOIN games_with_first gf ON gf."homeTeamId" = t.id OR gf."awayTeamId" = t.id
      WHERE EXISTS (SELECT 1 FROM games_with_first gf2 WHERE gf2."homeTeamId"=t.id OR gf2."awayTeamId"=t.id)
      GROUP BY t.id, t."nameHe"
    )
    SELECT * FROM per_team
  `;

  const winWhenScoringFirst: Row[] = winFirstRows
    .filter((r) => r.firstScore > 0)
    .map((r) => ({ name: r.teamNameHe, value: `${Math.round((r.firstWin / r.firstScore) * 100)}%`, sub: `${r.firstWin}/${r.firstScore} משחקים` }))
    .sort((a, b) => parseInt(b.value) - parseInt(a.value));

  const winWhenNotScoringFirst: Row[] = winFirstRows
    .filter((r) => r.secondScore > 0)
    .map((r) => ({ name: r.teamNameHe, value: `${Math.round((r.secondWin / r.secondScore) * 100)}%`, sub: `${r.secondWin}/${r.secondScore} משחקים` }))
    .sort((a, b) => parseInt(b.value) - parseInt(a.value));

  // ── Minutes per goal scored / conceded ──
  const minutesPerGoalRows = await prisma.$queryRaw<Array<{
    teamId: string; teamNameHe: string; minutesPlayed: number; goalsScored: number; goalsConceded: number;
  }>>`
    WITH agg AS (
      SELECT t.id AS team_id,
        (COALESCE(SUM(CASE WHEN g."homeTeamId" = t.id OR g."awayTeamId" = t.id THEN 90 ELSE 0 END), 0))::int AS minutes,
        (COALESCE(SUM(CASE WHEN g."homeTeamId" = t.id THEN g."homeScore" WHEN g."awayTeamId" = t.id THEN g."awayScore" END), 0))::int AS goals_for,
        (COALESCE(SUM(CASE WHEN g."homeTeamId" = t.id THEN g."awayScore" WHEN g."awayTeamId" = t.id THEN g."homeScore" END), 0))::int AS goals_ag
      FROM teams t
      JOIN games g ON (g."homeTeamId" = t.id OR g."awayTeamId" = t.id)
        AND g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      GROUP BY t.id
    )
    SELECT t.id AS "teamId", t."nameHe" AS "teamNameHe",
           agg.minutes AS "minutesPlayed", agg.goals_for AS "goalsScored", agg.goals_ag AS "goalsConceded"
    FROM teams t JOIN agg ON agg.team_id = t.id
  `;

  const minPerGoalScored: Row[] = minutesPerGoalRows
    .filter((r) => r.goalsScored > 0)
    .map((r) => ({ name: r.teamNameHe, value: Math.round(r.minutesPlayed / r.goalsScored).toString(), sub: `${r.minutesPlayed} דקות / ${r.goalsScored} שערים` }))
    .sort((a, b) => Number(a.value) - Number(b.value));

  const minPerGoalConceded: Row[] = minutesPerGoalRows
    .filter((r) => r.goalsConceded > 0)
    .map((r) => ({ name: r.teamNameHe, value: Math.round(r.minutesPlayed / r.goalsConceded).toString(), sub: `${r.minutesPlayed} דקות / ${r.goalsConceded} ספיגות` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  // ── Goals by 15-min bucket (entire league) ──
  const goalBucketsRaw = await prisma.$queryRaw<Array<{ bucket: string; goals: number }>>`
    SELECT CASE
      WHEN minute BETWEEN 1 AND 15 THEN '01-15'
      WHEN minute BETWEEN 16 AND 30 THEN '16-30'
      WHEN minute BETWEEN 31 AND 45 THEN '31-45'
      WHEN minute BETWEEN 46 AND 60 THEN '46-60'
      WHEN minute BETWEEN 61 AND 75 THEN '61-75'
      WHEN minute BETWEEN 76 AND 90 THEN '76-90'
      WHEN minute > 90 THEN '90+'
    END AS bucket, COUNT(*)::int AS goals
    FROM game_events ge JOIN games g ON g.id = ge."gameId"
    WHERE ge.type IN ('GOAL', 'PENALTY_GOAL') AND g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
    GROUP BY bucket ORDER BY MIN(minute)
  `;
  const goalBuckets: Row[] = goalBucketsRaw.map((r) => ({ name: `דקות ${r.bucket}`, value: r.goals.toString(), sub: '' }));

  // ── Penalty conversion league-wide ──
  const penaltyRow = await prisma.$queryRaw<Array<{ scored: number; missed: number }>>`
    SELECT
      SUM(CASE WHEN ge.type = 'PENALTY_GOAL' THEN 1 ELSE 0 END)::int AS scored,
      SUM(CASE WHEN ge.type = 'PENALTY_MISSED' THEN 1 ELSE 0 END)::int AS missed
    FROM game_events ge JOIN games g ON g.id = ge."gameId"
    WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
  `;
  const penaltyStats = penaltyRow[0];
  const penaltyConversion: Row[] = penaltyStats && (penaltyStats.scored + penaltyStats.missed) > 0 ? [{
    name: 'אחוז ניצול פנדלים (כל הליגה)',
    value: `${Math.round((penaltyStats.scored / (penaltyStats.scored + penaltyStats.missed)) * 100)}%`,
    sub: `${penaltyStats.scored} מתוך ${penaltyStats.scored + penaltyStats.missed}`,
  }] : [];

  // ── Referee avg cards per game ──
  const refereeRows = await prisma.$queryRaw<Array<{
    refereeName: string; games: number; yellows: number; reds: number;
  }>>`
    WITH ref_games AS (
      SELECT COALESCE(g."refereeHe", g."refereeEn") AS ref_name, g.id AS game_id
      FROM games g WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
        AND g.status = 'COMPLETED' AND COALESCE(g."refereeHe", g."refereeEn") IS NOT NULL
    )
    SELECT
      rg.ref_name AS "refereeName",
      COUNT(DISTINCT rg.game_id)::int AS games,
      SUM(CASE WHEN ge.type = 'YELLOW_CARD' THEN 1 ELSE 0 END)::int AS yellows,
      SUM(CASE WHEN ge.type IN ('RED_CARD', 'YELLOW_RED_CARD') THEN 1 ELSE 0 END)::int AS reds
    FROM ref_games rg
    LEFT JOIN game_events ge ON ge."gameId" = rg.game_id
    GROUP BY rg.ref_name HAVING COUNT(DISTINCT rg.game_id) >= 3
  `;
  const refYellows: Row[] = refereeRows
    .map((r) => ({ name: r.refereeName, value: (r.yellows / r.games).toFixed(2), sub: `${r.yellows} צהובים / ${r.games} משחקים` }))
    .sort((a, b) => Number(b.value) - Number(a.value));
  const refReds: Row[] = refereeRows
    .map((r) => ({ name: r.refereeName, value: (r.reds / r.games).toFixed(2), sub: `${r.reds} אדומים / ${r.games} משחקים` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  // ── Stadium avg goals per game ──
  const venueRows = await prisma.$queryRaw<Array<{ venueName: string; games: number; goals: number }>>`
    SELECT COALESCE(g."venueNameHe", g."venueNameEn") AS "venueName",
           COUNT(*)::int AS games,
           SUM(g."homeScore" + g."awayScore")::int AS goals
    FROM games g
    WHERE g."seasonId" = ${seasonId} AND g."competitionId" = 'comp_liga_haal'
      AND g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL
      AND COALESCE(g."venueNameHe", g."venueNameEn") IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) >= 3
  `;
  const venueGoalAvg: Row[] = venueRows
    .map((r) => ({ name: r.venueName, value: (r.goals / r.games).toFixed(2), sub: `${r.goals} שערים / ${r.games} משחקים` }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  return {
    teamHomeGoalAvg, teamAwayGoalAvg, teamGoalsScored, teamGoalsConceded,
    homeSuccessRate, awaySuccessRate, winWhenScoringFirst, winWhenNotScoringFirst,
    minPerGoalScored, minPerGoalConceded, goalBuckets, penaltyConversion,
    refYellows, refReds, venueGoalAvg,
  };
}

export default async function StatisticsInsightsPage({
  searchParams,
}: {
  searchParams?: { season?: string };
}) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' } });
  const selectedSeasonId = searchParams?.season || seasons.find((s) => s.year <= 2025)?.id || seasons[0]?.id;
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);

  const data = await buildAllSections(selectedSeasonId || '');

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">סטטיסטיקות</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl">תובנות מתקדמות</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            סטטיסטיקות ברמת קבוצה, שופט, אצטדיון. עונה: <strong>{selectedSeason?.name}</strong> · ליגת העל
          </p>
          <form action="/statistics/insights" className="mt-4">
            <select name="season" defaultValue={selectedSeasonId} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900">
              {seasons.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
            <button className="ms-3 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">הצג</button>
          </form>
        </section>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <RowCard title="ממוצע שערים בבית" rows={data.teamHomeGoalAvg.slice(0, 8)} />
          <RowCard title="ממוצע שערים בחוץ" rows={data.teamAwayGoalAvg.slice(0, 8)} />
          <RowCard title="ממוצע כיבושים למשחק" rows={data.teamGoalsScored.slice(0, 8)} />
          <RowCard title="ממוצע ספיגות למשחק" rows={data.teamGoalsConceded.slice(0, 8)} />
          <RowCard title="אחוז הצלחה בבית" rows={data.homeSuccessRate.slice(0, 8)} />
          <RowCard title="אחוז הצלחה בחוץ" rows={data.awaySuccessRate.slice(0, 8)} />
          <RowCard title="ניצחונות כשכובשים ראשונים" rows={data.winWhenScoringFirst.slice(0, 8)} />
          <RowCard title="ניצחונות כשלא כובשים ראשונים" rows={data.winWhenNotScoringFirst.slice(0, 8)} />
          <RowCard title="כל כמה דקות כובשים" rows={data.minPerGoalScored.slice(0, 8)} />
          <RowCard title="כל כמה דקות סופגים" rows={data.minPerGoalConceded.slice(0, 8)} />
          <RowCard title="שערים לפי דקות" rows={data.goalBuckets} />
          <RowCard title="אחוז ניצול פנדלים" rows={data.penaltyConversion} />
          <RowCard title="שופטים — צהובים/משחק" rows={data.refYellows.slice(0, 10)} />
          <RowCard title="שופטים — אדומים/משחק" rows={data.refReds.slice(0, 10)} />
          <RowCard title="אצטדיונים — שערים/משחק" rows={data.venueGoalAvg.slice(0, 10)} />
        </div>

        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 text-sm text-stone-600 shadow-sm">
          <p>
            <strong>הערות:</strong> אחוז שערים בבעיטות חופשיות / נגיחות וממוצע קהל ביתי זמינים רק עד 2019/20 (מקור Walla, לא מתעדכן).
            כל יתר הסטטיסטיקות מחושבות בזמן אמת מנתוני המשחקים והאירועים.
          </p>
        </section>
      </div>
    </div>
  );
}

function RowCard({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <section className="modern-card rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <h3 className="border-r-[3px] border-[var(--accent)] pr-3 text-base font-black text-stone-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-start justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
            <div className="flex flex-1 items-baseline gap-2 min-w-0">
              <span className="w-5 shrink-0 text-[11px] font-black text-stone-400">#{i + 1}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-stone-900">{r.name}</div>
                {r.sub ? <div className="text-[11px] text-stone-500">{r.sub}</div> : null}
              </div>
            </div>
            <div className="text-base font-black text-[var(--accent)]">{r.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
