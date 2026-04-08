import Link from 'next/link';
import SmartFilterForm from '@/components/SmartFilterForm';
import { derivePlayerDeepStats } from '@/lib/deep-stats';
import { getDisplayMode } from '@/lib/display-mode';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';
import { PlayerPhoto } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

function buildPlayersFilterFields({
  displayMode,
  seasons,
  allTeams,
}: {
  displayMode: string;
  seasons: Array<{ id: string; name: string }>;
  allTeams: Array<{ id: string; seasonId: string; nameHe: string | null; nameEn: string }>;
}) {
  return [
    {
      name: 'season',
      options: seasons.map((season) => ({ value: season.id, label: season.name })),
      className:
        displayMode === 'premier'
          ? 'rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none'
          : 'rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold',
    },
    {
      name: 'teamId',
      includeAllOption: true,
      allLabel: 'כל הקבוצות',
      options: allTeams.map((team) => ({
        value: team.id,
        label: team.nameHe || team.nameEn,
        meta: { season: [team.seasonId] },
      })),
      className:
        displayMode === 'premier'
          ? 'rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none'
          : 'rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold',
    },
  ];
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams?: { season?: string; teamId?: string; view?: string };
}) {
  const displayMode = await getDisplayMode(searchParams?.view);
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });
  const seasonIds = seasons.map((season) => season.id);
  const allTeams = seasonIds.length
    ? await prisma.team.findMany({
        where: { seasonId: { in: seasonIds } },
        select: { id: true, seasonId: true, nameHe: true, nameEn: true },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedSeasonId = searchParams?.season || seasons.find((season) => season.year <= 2025)?.id || seasons[0]?.id;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const displayZeroStatPlayers = await getDisplayZeroStatPlayersSetting();

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedTeamId = searchParams?.teamId || 'all';
  const playersFilterFields = buildPlayersFilterFields({
    displayMode,
    seasons,
    allTeams,
  });

  const players = selectedSeason
    ? await prisma.player.findMany({
        where: {
          team: {
            seasonId: selectedSeason.id,
          },
          ...(selectedTeamId !== 'all' ? { teamId: selectedTeamId } : {}),
        },
        include: {
          team: true,
          playerStats: {
            where: { seasonId: selectedSeason.id },
          },
          uploads: {
            orderBy: [{ createdAt: 'asc' }],
          },
        },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const playerIds = players.map((player) => player.id);

  const seasonalEvidencePlayerIds = selectedSeason && playerIds.length > 0
    ? new Set(
        [
          ...(await prisma.gameLineupEntry.findMany({
            where: {
              playerId: { in: playerIds },
              game: { seasonId: selectedSeason.id },
            },
            select: { playerId: true },
          })).map((entry) => entry.playerId),
          ...(await prisma.playerInjury.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerSidelinedEntry.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerTransfer.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.playerTrophy.findMany({
            where: {
              playerId: { in: playerIds },
              seasonId: selectedSeason.id,
            },
            select: { playerId: true },
          })).flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
          ...(await prisma.gameEvent.findMany({
            where: {
              game: { seasonId: selectedSeason.id },
              OR: [{ playerId: { in: playerIds } }, { relatedPlayerId: { in: playerIds } }],
            },
            select: { playerId: true, relatedPlayerId: true },
          })).flatMap((entry) => [entry.playerId, entry.relatedPlayerId].filter(Boolean) as string[]),
        ].filter(Boolean)
      )
    : new Set<string>();

  const seasonGames = selectedSeason
    ? await prisma.game.findMany({
        where: { seasonId: selectedSeason.id },
        include: {
          events: {
            select: {
              minute: true,
              extraMinute: true,
              type: true,
              playerId: true,
              relatedPlayerId: true,
              teamId: true,
            },
          },
          lineupEntries: {
            select: {
              playerId: true,
              role: true,
              teamId: true,
            },
          },
          gameStats: {
            select: {
              homeTeamPossession: true,
              awayTeamPossession: true,
              homeShotsOnTarget: true,
              awayShotsOnTarget: true,
              homeShotsTotal: true,
              awayShotsTotal: true,
              homeCorners: true,
              awayCorners: true,
              homeFouls: true,
              awayFouls: true,
              homeOffsides: true,
              awayOffsides: true,
              homeYellowCards: true,
              awayYellowCards: true,
              homeRedCards: true,
              awayRedCards: true,
            },
          },
        },
      })
    : [];

  const visiblePlayers = players
    .map((player) => {
      const stat = derivePlayerDeepStats(
        player.id,
        seasonGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
      );
      const hasSeasonStats =
        player.playerStats.some((row) => row.gamesPlayed > 0 || row.minutesPlayed > 0) ||
        stat.gamesPlayed > 0 ||
        stat.minutesPlayed > 0 ||
        stat.goals > 0 ||
        stat.assists > 0;

      return {
        ...player,
        stat,
        isZeroStatPlayer: !hasSeasonStats && !seasonalEvidencePlayerIds.has(player.id),
      };
    })
    .filter((player) => (displayZeroStatPlayers ? true : !player.isZeroStatPlayer))
    .sort((left, right) => {
      if (left.isZeroStatPlayer !== right.isZeroStatPlayer) {
        return left.isZeroStatPlayer ? 1 : -1;
      }

      return formatPlayerName(left).localeCompare(formatPlayerName(right), 'he');
    });

  const mainPlayers = visiblePlayers.filter((player) => !player.isZeroStatPlayer);
  const zeroStatPlayers = visiblePlayers.filter((player) => player.isZeroStatPlayer);

  if (displayMode === 'premier') {
    return (
      <PremierPlayersView
        seasons={seasons}
        selectedSeason={selectedSeason}
        selectedSeasonId={selectedSeasonId || ''}
        teams={teams}
        allTeams={allTeams}
        selectedTeamId={selectedTeamId}
        visiblePlayers={visiblePlayers}
        mainPlayers={mainPlayers}
        zeroStatPlayers={zeroStatPlayers}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.25em] text-amber-700">שחקנים</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">מרכז השחקנים</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            כאן אפשר לראות תמונות שחקנים, נתוני עונה מרכזיים, ולפתוח פרופיל מלא לכל שחקן.
          </p>

          <SmartFilterForm
            action="/players"
            hiddenFields={{ view: displayMode }}
            fields={playersFilterFields}
            initialValues={{
              season: selectedSeason?.id || '',
              teamId: selectedTeamId,
            }}
            formClassName="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
            buttonClassName="rounded-full bg-stone-900 px-5 py-3 font-bold text-white"
            submitLabel="הצג שחקנים"
          />

        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mainPlayers.map((player) => {
            const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
            const playerDisplayName = formatPlayerName(player);

            return (
              <Link
                key={player.id}
                href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300"
              >
                <div className="flex items-center gap-4">
                  <PlayerPhoto
                    src={displayPhoto}
                    alt={playerDisplayName}
                    className="h-20 w-20 rounded-full border border-stone-200 bg-stone-50 object-cover"
                    fallbackClassName="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400"
                  />
                  <div>
                    <h2 className="text-xl font-black text-stone-900">{playerDisplayName}</h2>
                    <div className="mt-1 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                    <div className="mt-1 text-sm text-stone-500">
                      {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-3 text-center">
                  <PlayerMetric label="שערים" value={String(player.stat.goals)} />
                  <PlayerMetric label="בישולים" value={String(player.stat.assists)} />
                  <PlayerMetric label="דקות" value={String(player.stat.minutesPlayed)} />
                  <PlayerMetric label="פתיחות" value={String(player.stat.starts)} />
                  <PlayerMetric label="נרשם כמחליף" value={String(player.stat.benchAppearances)} />
                  <PlayerMetric label="מחליף" value={String(player.stat.substituteAppearances)} />
                  <PlayerMetric label="צהובים" value={String(player.stat.yellowCards)} />
                  <PlayerMetric label="אדומים" value={String(player.stat.redCards)} />
                </div>
              </Link>
            );
          })}
        </section>

        {displayZeroStatPlayers && zeroStatPlayers.length > 0 ? (
          <section className="space-y-4">
            <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
              <h2 className="text-xl font-black text-stone-700">שחקנים ללא סטטיסטיקות עונתיות</h2>
              <p className="mt-2 text-sm text-stone-500">
                שחקנים שהגיעו מה־API לעונה הזו, אך אין להם הופעות, דקות או נתוני עונה ממשיים.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zeroStatPlayers.map((player) => {
                const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
                const playerDisplayName = formatPlayerName(player);

                return (
                  <Link
                    key={player.id}
                    href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}`}
                    className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 shadow-sm transition hover:border-stone-300"
                  >
                    <div className="flex items-center gap-4">
                      <PlayerPhoto
                        src={displayPhoto}
                        alt={playerDisplayName}
                        className="h-20 w-20 rounded-full border border-stone-200 bg-white object-cover grayscale"
                        fallbackClassName="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-stone-300 bg-white text-xs text-stone-400"
                      />
                      <div>
                        <div className="mb-1 inline-flex rounded-full bg-stone-200 px-3 py-1 text-xs font-bold text-stone-600">
                          0 סטטיסטיקות
                        </div>
                        <h2 className="text-xl font-black text-stone-700">{playerDisplayName}</h2>
                        <div className="mt-1 text-sm text-stone-500">{player.team.nameHe || player.team.nameEn}</div>
                        <div className="mt-1 text-sm text-stone-500">
                          {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PremierPlayersView({
  seasons,
  selectedSeason,
  selectedSeasonId,
  teams,
  allTeams,
  selectedTeamId,
  visiblePlayers,
  mainPlayers,
  zeroStatPlayers,
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeason: { id: string; name: string } | null;
  selectedSeasonId: string;
  teams: Array<{ id: string; nameHe: string | null; nameEn: string }>;
  allTeams: Array<{ id: string; seasonId: string; nameHe: string | null; nameEn: string }>;
  selectedTeamId: string;
  visiblePlayers: any[];
  mainPlayers: any[];
  zeroStatPlayers: any[];
}) {
  const playersFilterFields = buildPlayersFilterFields({
    displayMode: 'premier',
    seasons,
    allTeams,
  });
  const activePlayers = visiblePlayers.filter((player) => player.stat.gamesPlayed > 0 || player.stat.minutesPlayed > 0);
  const topContributors = [...activePlayers]
    .sort((a, b) => b.stat.goals + b.stat.assists - (a.stat.goals + a.stat.assists))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef3ff_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] bg-[linear-gradient(140deg,#160038,#560087_50%,#05b6df)] px-6 py-7 text-white shadow-[0_30px_90px_rgba(22,0,56,0.3)] md:px-8 md:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.34em] text-cyan-100">
                שחקנים
              </div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">מרכז השחקנים</h1>
              <p className="text-sm leading-6 text-white/78 md:text-base">
                תצוגה חדשה בהשראת האתר הרשמי, עם טבלת סגל ברורה, זיהוי מהיר של מובילי תרומה, והפרדה ברורה בין שחקנים פעילים לבין שחקנים ללא סטטיסטיקה עונתית.
              </p>
            </div>

            <SmartFilterForm
              action="/players"
              hiddenFields={{ view: 'premier' }}
              fields={playersFilterFields}
              initialValues={{
                season: selectedSeason?.id || '',
                teamId: selectedTeamId,
              }}
              formClassName="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
              buttonClassName="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#360065]"
              submitLabel="הצג שחקנים"
            />

            <form className="hidden" action="/players">
              <input type="hidden" name="view" value="premier" />
              <select
                name="season"
                defaultValue={selectedSeason?.id || ''}
                className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id} className="text-slate-950">
                    {season.name}
                  </option>
                ))}
              </select>
              <select
                name="teamId"
                defaultValue={selectedTeamId}
                className="rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
              >
                <option value="all" className="text-slate-950">כל הקבוצות</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="text-slate-950">
                    {team.nameHe || team.nameEn}
                  </option>
                ))}
              </select>
              <button className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#360065]">הצג שחקנים</button>
            </form>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HeroStat label="שחקנים מוצגים" value={String(visiblePlayers.length)} />
            <HeroStat label="פעילים" value={String(activePlayers.length)} />
            <HeroStat label="ללא סטטיסטיקות" value={String(zeroStatPlayers.length)} />
            <HeroStat label="עונה" value={selectedSeason?.name || '-'} />
          </div>
        </section>

        {topContributors.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-3">
            {topContributors.map((player, index) => {
              const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
              return (
                <Link
                  key={player.id}
                  href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                  className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5"
                >
                  <div className="mb-4 inline-flex rounded-full bg-[#efe6ff] px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-[#6f00ba]">
                    #{index + 1} מוביל
                  </div>
                  <div className="flex items-center gap-4">
                    <PlayerPhoto
                      src={displayPhoto}
                      alt={formatPlayerName(player)}
                      className="h-20 w-20 rounded-full bg-[#f7f8ff] object-cover"
                      fallbackClassName="flex h-20 w-20 items-center justify-center rounded-full bg-[#f0f3ff] text-xs font-black text-slate-500"
                    />
                    <div>
                      <div className="text-xl font-black text-slate-950">{formatPlayerName(player)}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{player.team.nameHe || player.team.nameEn}</div>
                      <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        {player.position || 'ללא עמדה'} | #{player.jerseyNumber ?? '-'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-3">
                    <MiniStat label="שערים" value={String(player.stat.goals)} />
                    <MiniStat label="בישולים" value={String(player.stat.assists)} />
                    <MiniStat label="הופעות" value={String(player.stat.gamesPlayed)} />
                    <MiniStat label="דקות" value={String(player.stat.minutesPlayed)} />
                  </div>
                </Link>
              );
            })}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-950">טבלת סגל</h2>
              <p className="mt-1 text-sm text-slate-500">טבלת סגל עונתית בסגנון רשמי, עם מעבר מהיר לפרופיל שחקן.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-right">
              <thead>
                <tr className="border-b border-slate-100 bg-[#f8f9ff] text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-4">שחקן</th>
                  <th className="px-4 py-4">קבוצה</th>
                  <th className="px-4 py-4">עמדה</th>
                  <th className="px-4 py-4 text-center">מס&apos;</th>
                  <th className="px-4 py-4 text-center">הופעות</th>
                  <th className="px-4 py-4 text-center">שערים</th>
                  <th className="px-4 py-4 text-center">בישולים</th>
                  <th className="px-4 py-4 text-center">דקות</th>
                  <th className="px-4 py-4 text-center">פתיחות</th>
                  <th className="px-4 py-4 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((player) => {
                  const displayPhoto = player.photoUrl || player.uploads[0]?.filePath || null;
                  return (
                    <tr key={player.id} className={`border-b border-slate-100 text-sm ${player.isZeroStatPlayer ? 'bg-slate-50 text-slate-400' : 'text-slate-700 hover:bg-[#f9faff]'}`}>
                      <td className="px-4 py-4">
                        <Link
                          href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                          className="flex items-center gap-3"
                        >
                          <PlayerPhoto
                            src={displayPhoto}
                            alt={formatPlayerName(player)}
                            className={`h-11 w-11 rounded-full object-cover ${player.isZeroStatPlayer ? 'grayscale' : ''}`}
                            fallbackClassName="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef2ff] text-[11px] font-black text-slate-500"
                          />
                          <div>
                            <div className={`font-black ${player.isZeroStatPlayer ? 'text-slate-500' : 'text-slate-950'}`}>{formatPlayerName(player)}</div>
                            <div className="text-xs text-slate-500">
                              {player.nationalityHe || player.nationalityEn || player.birthCountryHe || player.birthCountryEn || 'ללא לאום'}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 font-semibold">{player.team.nameHe || player.team.nameEn}</td>
                      <td className="px-4 py-4 font-semibold">{player.position || '-'}</td>
                      <td className="px-4 py-4 text-center font-bold">{player.jerseyNumber ?? '-'}</td>
                      <td className="px-4 py-4 text-center font-bold">{player.stat.gamesPlayed}</td>
                      <td className="px-4 py-4 text-center font-black text-[#6f00ba]">{player.stat.goals}</td>
                      <td className="px-4 py-4 text-center font-black text-cyan-700">{player.stat.assists}</td>
                      <td className="px-4 py-4 text-center font-bold">{player.stat.minutesPlayed}</td>
                      <td className="px-4 py-4 text-center font-bold">{player.stat.starts}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${
                          player.isZeroStatPlayer ? 'bg-slate-200 text-slate-500' : 'bg-[#efe6ff] text-[#6f00ba]'
                        }`}>
                          {player.isZeroStatPlayer ? 'ללא נתונים' : 'פעיל'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {zeroStatPlayers.length > 0 ? (
          <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-black text-slate-950">מעקב שחקנים ללא סטטיסטיקה</h2>
            <p className="mt-2 text-sm text-slate-500">שחקנים שהגיעו לייבוא העונתי אך עדיין אין להם סטטיסטיקה עונתית אמינה או פעילות מוכחת.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {zeroStatPlayers.map((player) => (
                <Link
                  key={player.id}
                  href={`/players/${player.canonicalPlayerId || player.id}?season=${selectedSeasonId}&view=premier`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                >
                  {formatPlayerName(player)} | {player.team.nameHe || player.team.nameEn}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
      <div className="text-xs font-bold tracking-[0.26em] text-white/55">{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-[#f6f8ff] px-3 py-3 text-center">
      <div className="text-[11px] font-bold tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function PlayerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-3 py-3">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-2 text-lg font-black text-stone-900">{value}</div>
    </div>
  );
}
