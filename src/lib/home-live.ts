import prisma from '@/lib/prisma';
import { apiFootballFetch, isApiFootballRateLimitError } from '@/lib/api-football';
import { getAllowedLiveCountryLabels } from '@/lib/live-competition-settings';

export type HomepageLiveEvent = {
  id: string;
  minuteLabel: string;
  typeLabel: string;
  iconPath: string | null;
  iconLabel: string;
  iconClassName: string;
  teamName: string;
  primaryText: string;
  secondaryText: string | null;
};

export type HomepageLiveSnapshot = {
  id: string;
  fixtureId: number | null;
  leagueApiFootballId: number | null;
  homeTeamApiFootballId: number | null;
  awayTeamApiFootballId: number | null;
  countryLabel: string;
  countryFlagUrl: string | null;
  leagueLabel: string;
  roundLabel: string;
  statusLabel: string;
  minuteLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  scoreLabel: string;
  eventCount: number;
  gameHref: string;
  events: HomepageLiveEvent[];
};

const LIVE_TRANSLATIONS: Record<string, string> = {
  // ── Match status ──────────────────────────────────────────────────────────
  Halftime: 'מחצית',
  'First Half': 'מחצית ראשונה',
  'Second Half': 'מחצית שנייה',
  'Extra Time': 'הארכה',
  'Break Time': 'הפסקה',
  'Match Finished': 'הסתיים',
  Finished: 'הסתיים',
  'After Extra Time': 'לאחר הארכה',
  'Penalty In Progress': 'פנדלים',
  'Match Suspended': 'הושעה',
  'Match Interrupted': 'הופסק',
  'Match Abandoned': 'בוטל',
  'Match Postponed': 'נדחה',
  'Match Cancelled': 'בוטל',
  'Not Started': 'טרם החל',
  Live: 'חי',
  Friendlies: 'משחקי ידידות',
  'Friendly International': 'ידידות בינלאומית',
  'Penalty Shootout': 'פנדלים',

  // ── Countries ─────────────────────────────────────────────────────────────
  England: 'אנגליה',
  Spain: 'ספרד',
  Germany: 'גרמניה',
  France: 'צרפת',
  Italy: 'איטליה',
  Portugal: 'פורטוגל',
  Netherlands: 'הולנד',
  Belgium: 'בלגיה',
  Turkey: 'טורקיה',
  Russia: 'רוסיה',
  Ukraine: 'אוקראינה',
  Greece: 'יוון',
  Scotland: 'סקוטלנד',
  Switzerland: 'שווייץ',
  Austria: 'אוסטריה',
  Croatia: 'קרואטיה',
  Serbia: 'סרביה',
  Denmark: 'דנמרק',
  Norway: 'נורווגיה',
  Sweden: 'שוודיה',
  Poland: 'פולין',
  'Czech Republic': 'צ׳כיה',
  Hungary: 'הונגריה',
  Romania: 'רומניה',
  Bulgaria: 'בולגריה',
  Slovakia: 'סלובקיה',
  Slovenia: 'סלובניה',
  'Bosnia and Herzegovina': 'בוסניה',
  Albania: 'אלבניה',
  'North Macedonia': 'מקדוניה',
  Finland: 'פינלנד',
  Ireland: 'אירלנד',
  'Northern Ireland': 'צפון אירלנד',
  Wales: 'וולס',
  Georgia: 'גאורגיה',
  Cyprus: 'קפריסין',
  Luxembourg: 'לוקסמבורג',
  Malta: 'מלטה',
  Iceland: 'איסלנד',
  Israel: 'ישראל',
  'Saudi Arabia': 'ערב הסעודית',
  UAE: 'איחוד האמירויות',
  Qatar: 'קטאר',
  Egypt: 'מצרים',
  Morocco: 'מרוקו',
  Tunisia: 'תוניסיה',
  Algeria: 'אלג׳יריה',
  'South Africa': 'דרום אפריקה',
  Nigeria: 'ניגריה',
  Ghana: 'גאנה',
  Brazil: 'ברזיל',
  Argentina: 'ארגנטינה',
  Colombia: 'קולומביה',
  Chile: 'צ׳ילה',
  Mexico: 'מקסיקו',
  USA: 'ארצות הברית',
  'United States': 'ארצות הברית',
  Canada: 'קנדה',
  Japan: 'יפן',
  'South Korea': 'קוריאה הדרומית',
  Australia: 'אוסטרליה',
  China: 'סין',
  World: 'עולמי',
  Europe: 'אירופה',
  Africa: 'אפריקה',
  'South America': 'דרום אמריקה',
  'North America': 'צפון אמריקה',
  Asia: 'אסיה',

  // ── Major leagues & cups ─────────────────────────────────────────────────
  'Premier League': 'פרמייר ליג',
  Championship: 'צ׳מפיונשיפ',
  'League One': 'ליגה 1 אנגלית',
  'League Two': 'ליגה 2 אנגלית',
  'FA Cup': 'גביע ה-FA',
  'League Cup': 'גביע הליג',
  'Community Shield': 'מגן הקהילה',
  'La Liga': 'לה ליגה',
  'Segunda División': 'ספרד ליגה 2',
  'Copa del Rey': 'גביע המלך',
  'Supercopa de España': 'סופרקאפ ספרד',
  Bundesliga: 'בונדסליגה',
  '2. Bundesliga': 'בונדסליגה 2',
  'DFB Pokal': 'גביע גרמניה',
  'DFL Supercup': 'סופרקאפ גרמניה',
  'Ligue 1': 'ליג 1',
  'Ligue 2': 'ליג 2',
  'Coupe de France': 'גביע צרפת',
  'Trophée des Champions': 'גביע האלופים הצרפתי',
  'Serie A': 'סריה א',
  'Serie B': 'סריה ב',
  'Coppa Italia': 'גביע איטליה',
  'Supercoppa Italiana': 'סופרקאפ איטליה',
  Eredivisie: 'ארה-דיוויזי',
  'KNVB Beker': 'גביע הולנד',
  'Primeira Liga': 'פרימיירה ליגה',
  'Taça de Portugal': 'גביע פורטוגל',
  'Süper Lig': 'סופר ליג טורקיה',
  'Turkish Cup': 'גביע טורקיה',
  'Jupiler Pro League': 'ליגת פרו בלגיה',
  'Russian Premier League': 'ליגה ראשונה רוסיה',
  'Ukrainian Premier League': 'ליגה ראשונה אוקראינה',
  Superliga: 'סופרליגה',
  'Scottish Premiership': 'ליגה ראשונה סקוטית',
  'Greek Super League': 'סופר ליגה יוון',
  'Swiss Super League': 'ליגה ראשונה שווייץ',
  'Austrian Bundesliga': 'בונדסליגה אוסטרית',
  'Champions League': 'ליגת האלופות',
  'UEFA Champions League': 'ליגת האלופות',
  'Europa League': 'ליגת אירופה',
  'UEFA Europa League': 'ליגת אירופה',
  'UEFA Europa Conference League': 'ליגת הוועידה',
  'Conference League': 'ליגת הוועידה',
  'UEFA Nations League': 'ליגת האומות',
  'World Cup': 'מונדיאל',
  'FIFA World Cup': 'מונדיאל',
  'European Championship': 'יורו',
  'UEFA Euro': 'יורו',
  'Copa America': 'קופה אמריקה',
  'Copa Libertadores': 'קופה ליברטדורס',
  'Copa Sudamericana': 'קופה סודאמריקנה',
  'African Cup of Nations': 'גביע אפריקה',
  'AFCON': 'גביע אפריקה',
  'Asia Cup': 'גביע אסיה',
  'AFC Champions League': 'ליגת האלופות האסיאתית',
  'Club World Cup': 'גביע העולם למועדונים',
  'FIFA Club World Cup': 'גביע העולם למועדונים',
  'International Champions Cup': 'גביע הבינלאומי',

  // ── Israeli teams (API-Football names → Hebrew) ───────────────────────────
  'Hapoel Beer Sheva': 'הפועל באר שבע',
  'Hapoel Tel Aviv': 'הפועל תל אביב',
  'Hapoel Haifa': 'הפועל חיפה',
  'Hapoel Jerusalem': 'הפועל ירושלים',
  'Hapoel Petah Tikva': 'הפועל פתח תקווה',
  'Hapoel Petach Tikva': 'הפועל פתח תקווה',
  'Hapoel Kfar Saba': 'הפועל כפר סבא',
  'Hapoel Hadera': 'הפועל חדרה',
  'Hapoel Acre': 'הפועל עכו',
  'Hapoel Raanana': 'הפועל רעננה',
  'Hapoel Rishon LeZion': 'הפועל ראשון לציון',
  'Hapoel Ramat Gan': 'הפועל רמת גן',
  'Hapoel Nof HaGalil': 'הפועל נוף הגליל',
  'Hapoel Afula': 'הפועל עפולה',
  'Hapoel Kfar Shalem': 'הפועל כפר שלם',
  'Hapoel Nir Ramat HaSharon': 'הפועל ניר רמת השרון',
  'Hapoel Umm al-Fahm': 'הפועל אום אל פאחם',
  'Maccabi Tel Aviv': 'מכבי תל אביב',
  'Maccabi Haifa': 'מכבי חיפה',
  'Maccabi Netanya': 'מכבי נתניה',
  'Maccabi Petach Tikva': 'מכבי פתח תקווה',
  'Maccabi Petah Tikva': 'מכבי פתח תקווה',
  'Maccabi Herzliya': 'מכבי הרצליה',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
  'Maccabi Bnei Reineh': 'מכבי בני ריינה',
  'Beitar Jerusalem': 'בית"ר ירושלים',
  'Beitar Tel Aviv': 'בית"ר תל אביב',
  'Bnei Sakhnin': 'בני סכנין',
  'Bnei Yehuda': 'בני יהודה',
  'Ironi Kiryat Shmona': 'עירוני קריית שמונה',
  'Ironi Tiberias': 'עירוני טבריה',
  'MS Ashdod': 'מ.ס. אשדוד',
  'Ashdod': 'מ.ס. אשדוד',
  'FC Ashdod': 'מ.ס. אשדוד',
  'MS Kafr Qasim': 'מ.ס. כפר קאסם',
  'Kafr Qasim': 'מ.ס. כפר קאסם',
  'Sektzia Nes Tziona': 'סקציה נס ציונה',
  'AS Ashdod': 'א.ס. אשדוד',
  'Ihud Bnei Shefaram': 'איחוד בני שפרעם',

  // ── Israeli competitions ──────────────────────────────────────────────────
  "Ligat Ha'al": 'ליגת העל',
  "Lןigat Ha'al": 'ליגת העל',
  'Liga Leumit': 'ליגה לאומית',
  'Liga Alef': 'ליגה א׳',
  'Liga Bet': 'ליגה ב׳',
  'State Cup': 'גביע המדינה',
  'Super Cup': 'אלוף האלופות',
  'Toto Cup Ligat Al': 'גביע הטוטו',
  'Toto Cup': 'גביע הטוטו',
  'Winner Cup': 'גביע וינר',

  // ── Round labels ──────────────────────────────────────────────────────────
  'Regular Season': 'מחזור',
  'Group Stage': 'שלב הבתים',
  'Round of 16': 'שמינית גמר',
  'Quarter-finals': 'רבע גמר',
  'Semi-finals': 'חצי גמר',
  Final: 'גמר',
  'Play-offs': 'פלייאוף',
  'Qualification Round': 'סיבוב קדם',
  'Preliminary Round': 'סיבוב מקדים',
};

function translateLiveText(value: string | null | undefined) {
  if (!value) return '';
  return LIVE_TRANSLATIONS[value] || value;
}

function getLiveEventIconPath(eventType: string | null | undefined, detail: string | null | undefined) {
  const normalizedType = (eventType || '').toLowerCase();
  const normalizedDetail = (detail || '').toLowerCase();

  if (normalizedType === 'goal') {
    return '/Icons/event-goal-nav-96.png';
  }

  if (normalizedType === 'card') {
    return normalizedDetail === 'red card' ? '/Icons/event-red-card-nav-96.png' : '/Icons/event-yellow-card-nav-96.png';
  }

  if (normalizedType === 'subst') {
    return '/Icons/event-sub-in-nav-96.png';
  }

  if (normalizedType.includes('injur') || normalizedDetail.includes('injur')) {
    return '/Icons/event-injury-nav-96.png';
  }

  return null;
}

function formatLiveMinute(
  elapsed: number | null | undefined,
  extra: number | null | undefined,
  statusShort?: string | null,
  statusLong?: string | null
) {
  const normalizedShort = String(statusShort || '').toUpperCase();
  if (normalizedShort === 'HT') return 'מחצית';
  if (normalizedShort === 'BT') return 'הפסקה';
  if (normalizedShort === 'FT' || normalizedShort === 'AET' || normalizedShort === 'PEN') {
    return translateLiveText(statusLong || statusShort) || 'הסתיים';
  }
  if (typeof elapsed !== 'number') return 'LIVE';
  return `${elapsed}${extra ? `+${extra}` : ''}'`;
}

function normalizeLiveEvents(rawJson: any): HomepageLiveEvent[] {
  const events = Array.isArray(rawJson?.events) ? rawJson.events : [];

  return events.map((event: any, index: number) => {
    const elapsed = event?.time?.elapsed;
    const extra = event?.time?.extra;
    const minuteLabel = typeof elapsed === 'number' ? `${elapsed}${extra ? `+${extra}` : ''}'` : '-';
    const teamName = translateLiveText(event?.team?.name) || event?.team?.name || 'קבוצה';
    const playerName = event?.player?.name || 'לא ידוע';
    const assistName = event?.assist?.name || null;
    const detail = event?.detail || '';
    const comments = event?.comments || null;

    if (event?.type === 'Goal') {
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: detail === 'Penalty' ? 'פנדל' : detail === 'Own Goal' ? 'שער עצמי' : 'שער',
        iconPath: getLiveEventIconPath(event?.type, detail),
        iconLabel: 'ש',
        iconClassName: 'bg-emerald-100 text-emerald-800',
        teamName,
        primaryText: playerName,
        secondaryText: assistName ? `בישול: ${assistName}` : comments,
      };
    }

    if (event?.type === 'Card') {
      const isRed = String(detail).toLowerCase().includes('red');
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: isRed ? 'כרטיס אדום' : 'כרטיס צהוב',
        iconPath: getLiveEventIconPath(event?.type, detail),
        iconLabel: isRed ? 'א' : 'צ',
        iconClassName: isRed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800',
        teamName,
        primaryText: playerName,
        secondaryText: comments,
      };
    }

    if (event?.type === 'subst') {
      return {
        id: `${event?.time?.elapsed || 'e'}-${index}`,
        minuteLabel,
        typeLabel: 'חילוף',
        iconPath: getLiveEventIconPath(event?.type, detail),
        iconLabel: 'ח',
        iconClassName: 'bg-sky-100 text-sky-800',
        teamName,
        primaryText: playerName,
        secondaryText: assistName ? `יצא: ${assistName}` : comments,
      };
    }

    return {
      id: `${event?.time?.elapsed || 'e'}-${index}`,
      minuteLabel,
      typeLabel: translateLiveText(event?.type) || event?.type || 'אירוע',
      iconPath: getLiveEventIconPath(event?.type, detail),
      iconLabel: '•',
      iconClassName: 'bg-stone-100 text-stone-700',
      teamName,
      primaryText: playerName,
      secondaryText: detail || comments,
    };
  });
}

export function getCurrentSeasonStartYear(referenceDate = new Date()) {
  return referenceDate.getMonth() >= 6 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
}

export async function cleanupFutureSeasons() {
  const currentSeasonStartYear = getCurrentSeasonStartYear();
  return prisma.season.deleteMany({
    where: {
      year: {
        gt: currentSeasonStartYear,
      },
    },
  });
}

export async function refreshGlobalHomepageLiveSnapshots() {
  const liveRows = await apiFootballFetch('/fixtures?live=all');
  const fixtureIds = liveRows.map((row: any) => row?.fixture?.id).filter((id: unknown): id is number => typeof id === 'number');
  const teamApiIds = Array.from(
    new Set(
      liveRows
        .flatMap((row: any) => [row?.teams?.home?.id, row?.teams?.away?.id])
        .filter((id: unknown): id is number => typeof id === 'number')
    )
  );

  const localGames = fixtureIds.length
    ? await prisma.game.findMany({
        where: {
          apiFootballId: {
            in: fixtureIds,
          },
        },
        select: {
          id: true,
          apiFootballId: true,
          seasonId: true,
          competitionId: true,
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: {
            select: {
              nameHe: true,
              nameEn: true,
            },
          },
          awayTeam: {
            select: {
              nameHe: true,
              nameEn: true,
            },
          },
        },
      })
    : [];

  const localTeams = teamApiIds.length
    ? await prisma.team.findMany({
        where: {
          apiFootballId: {
            in: teamApiIds,
          },
        },
        select: {
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          season: {
            select: {
              year: true,
            },
          },
        },
        orderBy: [{ season: { year: 'desc' } }],
      })
    : [];

  const localGameMap = new Map(localGames.map((game) => [game.apiFootballId, game]));
  const localTeamMap = new Map<number, (typeof localTeams)[number]>();

  for (const team of localTeams) {
    if (typeof team.apiFootballId !== 'number') continue;
    if (!localTeamMap.has(team.apiFootballId)) {
      localTeamMap.set(team.apiFootballId, team);
    }
  }

  // Build EN→HE team name map from DB for Israeli teams (fallback when no apiFootballId match)
  const teamNameEnToHe = new Map<string, string>();
  if (localTeamMap.size === 0) {
    const dbTeams = await prisma.team.findMany({
      where: { nameHe: { not: '' }, season: { year: { gte: 2020 } } },
      select: { nameEn: true, nameHe: true },
      distinct: ['nameEn'],
    });
    for (const t of dbTeams) {
      if (t.nameHe && t.nameEn && t.nameHe !== t.nameEn) {
        teamNameEnToHe.set(t.nameEn.toLowerCase(), t.nameHe);
      }
    }
  }

  if (fixtureIds.length) {
    await prisma.liveGameSnapshot.deleteMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
        apiFootballFixtureId: {
          notIn: fixtureIds,
        },
      },
    });
  } else {
    await prisma.liveGameSnapshot.deleteMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
      },
    });
  }

  for (const row of liveRows) {
    const fixtureId = row?.fixture?.id;
    if (typeof fixtureId !== 'number') continue;

    const localGame = localGameMap.get(fixtureId);
    const localHomeTeam = localGame?.homeTeam || localTeamMap.get(row?.teams?.home?.id);
    const localAwayTeam = localGame?.awayTeam || localTeamMap.get(row?.teams?.away?.id);
    const homeNameApi = row?.teams?.home?.name || null;
    const awayNameApi = row?.teams?.away?.name || null;
    const resolvedHomeTeamNameHe =
      localHomeTeam?.nameHe ||
      (homeNameApi && teamNameEnToHe.get(homeNameApi.toLowerCase())) ||
      translateLiveText(homeNameApi) || homeNameApi || null;
    const resolvedHomeTeamNameEn = localHomeTeam?.nameEn || homeNameApi || null;
    const resolvedAwayTeamNameHe =
      localAwayTeam?.nameHe ||
      (awayNameApi && teamNameEnToHe.get(awayNameApi.toLowerCase())) ||
      translateLiveText(awayNameApi) || awayNameApi || null;
    const resolvedAwayTeamNameEn = localAwayTeam?.nameEn || awayNameApi || null;

    await prisma.liveGameSnapshot.upsert({
      where: {
        apiFootballFixtureId_feedScope: {
          apiFootballFixtureId: fixtureId,
          feedScope: 'GLOBAL_HOMEPAGE',
        },
      },
      create: {
        apiFootballFixtureId: fixtureId,
        feedScope: 'GLOBAL_HOMEPAGE',
        leagueApiFootballId: row?.league?.id || null,
        leagueNameEn: row?.league?.name || null,
        leagueNameHe: translateLiveText(row?.league?.name) || row?.league?.name || null,
        roundEn: row?.league?.round || null,
        roundHe: translateLiveText(row?.league?.round) || row?.league?.round || null,
        statusShort: row?.fixture?.status?.short || null,
        statusLong: row?.fixture?.status?.long || null,
        elapsed: row?.fixture?.status?.elapsed ?? null,
        extra: row?.fixture?.status?.extra ?? null,
        snapshotAt: new Date(),
        fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
        homeTeamApiFootballId: row?.teams?.home?.id || null,
        homeTeamNameEn: resolvedHomeTeamNameEn,
        homeTeamNameHe: resolvedHomeTeamNameHe,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: resolvedAwayTeamNameEn,
        awayTeamNameHe: resolvedAwayTeamNameHe,
        homeScore: row?.goals?.home ?? null,
        awayScore: row?.goals?.away ?? null,
        eventCount: Array.isArray(row?.events) ? row.events.length : 0,
        rawJson: row as any,
        gameId: localGame?.id || null,
        seasonId: localGame?.seasonId || null,
        competitionId: localGame?.competitionId || null,
      },
      update: {
        leagueApiFootballId: row?.league?.id || null,
        leagueNameEn: row?.league?.name || null,
        leagueNameHe: translateLiveText(row?.league?.name) || row?.league?.name || null,
        roundEn: row?.league?.round || null,
        roundHe: translateLiveText(row?.league?.round) || row?.league?.round || null,
        statusShort: row?.fixture?.status?.short || null,
        statusLong: row?.fixture?.status?.long || null,
        elapsed: row?.fixture?.status?.elapsed ?? null,
        extra: row?.fixture?.status?.extra ?? null,
        snapshotAt: new Date(),
        fixtureDate: row?.fixture?.date ? new Date(row.fixture.date) : null,
        homeTeamApiFootballId: row?.teams?.home?.id || null,
        homeTeamNameEn: resolvedHomeTeamNameEn,
        homeTeamNameHe: resolvedHomeTeamNameHe,
        awayTeamApiFootballId: row?.teams?.away?.id || null,
        awayTeamNameEn: resolvedAwayTeamNameEn,
        awayTeamNameHe: resolvedAwayTeamNameHe,
        homeScore: row?.goals?.home ?? null,
        awayScore: row?.goals?.away ?? null,
        eventCount: Array.isArray(row?.events) ? row.events.length : 0,
        rawJson: row as any,
        gameId: localGame?.id || null,
        seasonId: localGame?.seasonId || null,
        competitionId: localGame?.competitionId || null,
      },
    });
  }

  return liveRows.length;
}

function mapSnapshotToHomepage(snapshot: any): HomepageLiveSnapshot {
  const rawLeague = snapshot.rawJson?.league || {};
  const countryLabel = translateLiveText(rawLeague.country || '') || 'בינלאומי';
  return {
    id: snapshot.id,
    fixtureId: snapshot.apiFootballFixtureId ?? null,
    leagueApiFootballId: snapshot.leagueApiFootballId ?? null,
    homeTeamApiFootballId: snapshot.homeTeamApiFootballId ?? null,
    awayTeamApiFootballId: snapshot.awayTeamApiFootballId ?? null,
    countryLabel,
    countryFlagUrl: rawLeague.flag || null,
    leagueLabel: translateLiveText(snapshot.leagueNameHe || snapshot.leagueNameEn) || 'ליגה',
    roundLabel: translateLiveText(snapshot.roundHe || snapshot.roundEn) || 'ללא מחזור',
    statusLabel: translateLiveText(snapshot.statusLong || snapshot.statusShort) || 'משחק חי',
    minuteLabel: formatLiveMinute(snapshot.elapsed, snapshot.extra, snapshot.statusShort, snapshot.statusLong),
    homeTeamName: snapshot.homeTeamNameHe || snapshot.homeTeamNameEn || 'קבוצת בית',
    awayTeamName: snapshot.awayTeamNameHe || snapshot.awayTeamNameEn || 'קבוצת חוץ',
    scoreLabel: `${snapshot.homeScore ?? 0} - ${snapshot.awayScore ?? 0}`,
    eventCount: snapshot.eventCount ?? 0,
    gameHref: snapshot.game?.id ? `/games/${snapshot.game.id}` : '/games',
    events: normalizeLiveEvents(snapshot.rawJson),
  };
}

const ISRAELI_LEAGUE_IDS = new Set([383, 385, 1114, 1115]);
const ISRAELI_TEAM_IDS = new Set([563, 604, 657, 2253, 4195, 4481, 4492, 4495, 4499, 4500, 4507, 4510, 8670, 8681]);
const ISRAELI_KEYWORDS = [
  // English
  'israel',
  'ligat ha',
  'toto cup',
  'state cup',
  'winner cup',
  'hapoel',
  'maccabi',
  'beitar',
  'bnei',
  'ironi',
  'beer sheva',
  'jerusalem',
  'tel aviv',
  'haifa',
  'netanya',
  'petah tikva',
  'sakhnin',
  'ashdod',
  'kiryat',
  'katamon',
  'kfar saba',
  'nazareth',
  // Hebrew
  'ישראל',
  'ליגת העל',
  'ליגה לאומית',
  'גביע המדינה',
  'גביע הטוטו',
  'הפועל',
  'מכבי',
  'בית"ר',
  'ביתר',
  'בני',
  'עירוני',
  'מ.ס.',
  'סקציה',
];

function normalizeLiveSortText(value: string | null | undefined) {
  return String(value || '').toLowerCase();
}

function includesIsraeliKeyword(value: string) {
  return ISRAELI_KEYWORDS.some((keyword) => value.includes(keyword));
}

function isIsraeliLiveSnapshot(snapshot: {
  countryLabel: string;
  leagueLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueApiFootballId?: number | null;
  homeTeamApiFootballId?: number | null;
  awayTeamApiFootballId?: number | null;
}) {
  if (snapshot.leagueApiFootballId && ISRAELI_LEAGUE_IDS.has(snapshot.leagueApiFootballId)) {
    return true;
  }

  if (snapshot.homeTeamApiFootballId && ISRAELI_TEAM_IDS.has(snapshot.homeTeamApiFootballId)) {
    return true;
  }

  if (snapshot.awayTeamApiFootballId && ISRAELI_TEAM_IDS.has(snapshot.awayTeamApiFootballId)) {
    return true;
  }

  const country = normalizeLiveSortText(snapshot.countryLabel);
  const league = normalizeLiveSortText(snapshot.leagueLabel);
  const teams = normalizeLiveSortText(`${snapshot.homeTeamName} ${snapshot.awayTeamName}`);

  if (country.includes('israel') || country.includes('ישראל')) {
    return true;
  }

  return includesIsraeliKeyword(league) || includesIsraeliKeyword(teams);
}

function sortLiveSnapshots<
  T extends {
    countryLabel: string;
    leagueLabel: string;
    homeTeamName: string;
    awayTeamName: string;
    leagueApiFootballId?: number | null;
    homeTeamApiFootballId?: number | null;
    awayTeamApiFootballId?: number | null;
  },
>(snapshots: T[]) {
  return [...snapshots].sort((a, b) => {
    const aIsraeli = isIsraeliLiveSnapshot(a);
    const bIsraeli = isIsraeliLiveSnapshot(b);

    if (aIsraeli !== bIsraeli) {
      return aIsraeli ? -1 : 1;
    }

    const countryCompare = a.countryLabel.localeCompare(b.countryLabel, 'he');
    if (countryCompare !== 0) return countryCompare;
    return a.leagueLabel.localeCompare(b.leagueLabel, 'he');
  });
}

export async function getHomepageLiveSnapshots(
  selectedTeamId?: string | null,
  options?: {
    limit?: number;
  }
) {
  const limit = options?.limit ?? 4;
  const [latestSeason, allowedCountryLabels] = await Promise.all([
    prisma.season.findFirst({
      where: {
        year: {
          lte: getCurrentSeasonStartYear(),
        },
      },
      orderBy: { year: 'desc' },
    }),
    getAllowedLiveCountryLabels(),
  ]);

  const latestGlobalSnapshot = await prisma.liveGameSnapshot.findFirst({
    where: { feedScope: 'GLOBAL_HOMEPAGE' },
    orderBy: { snapshotAt: 'desc' },
    select: { snapshotAt: true },
  });

  const shouldRefresh =
    !latestGlobalSnapshot ||
    Date.now() - new Date(latestGlobalSnapshot.snapshotAt).getTime() >= 55_000;

  if (shouldRefresh) {
    try {
      await refreshGlobalHomepageLiveSnapshots();
    } catch (error) {
      if (!isApiFootballRateLimitError(error)) {
        throw error;
      }
    }
  }

  const selectedTeam = selectedTeamId
    ? await prisma.team.findUnique({
        where: { id: selectedTeamId },
        select: { id: true, apiFootballId: true },
      })
    : null;

  const globalSnapshots = await prisma.liveGameSnapshot.findMany({
    where: { feedScope: 'GLOBAL_HOMEPAGE' },
    include: {
      game: {
        select: {
          id: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      },
    },
    orderBy: [{ snapshotAt: 'desc' }, { apiFootballFixtureId: 'asc' }],
    take: 250,
  });

  const filteredGlobalSnapshots = globalSnapshots.filter((snapshot) => {
    const snapshotCountry =
      snapshot.rawJson && typeof snapshot.rawJson === 'object' ? String((snapshot.rawJson as any)?.league?.country || '').trim() : '';
    if (Array.isArray(allowedCountryLabels) && !allowedCountryLabels.includes(snapshotCountry)) {
      return false;
    }
    if (!selectedTeam) return true;
    if (snapshot.game) {
      return snapshot.game.homeTeamId === selectedTeam.id || snapshot.game.awayTeamId === selectedTeam.id;
    }
    return snapshot.homeTeamApiFootballId === selectedTeam.apiFootballId || snapshot.awayTeamApiFootballId === selectedTeam.apiFootballId;
  });

  const sourceSnapshots =
    filteredGlobalSnapshots.length > 0
      ? filteredGlobalSnapshots
      : latestSeason
        ? await prisma.liveGameSnapshot.findMany({
            where: {
              seasonId: latestSeason.id,
              feedScope: 'LOCAL',
            },
            include: {
              game: {
                select: {
                  id: true,
                  homeTeamId: true,
                  awayTeamId: true,
                },
              },
            },
            orderBy: [{ snapshotAt: 'desc' }],
            take: 100,
          })
        : [];

  const countryFilteredSnapshots = Array.isArray(allowedCountryLabels)
    ? sourceSnapshots.filter((snapshot) => {
        const snapshotCountry =
          snapshot.rawJson && typeof snapshot.rawJson === 'object' ? String((snapshot.rawJson as any)?.league?.country || '').trim() : '';
        return allowedCountryLabels.includes(snapshotCountry);
      })
    : sourceSnapshots;

  const filteredSourceSnapshots = selectedTeam
    ? countryFilteredSnapshots.filter((snapshot) => {
        if (snapshot.game) {
          return snapshot.game.homeTeamId === selectedTeam.id || snapshot.game.awayTeamId === selectedTeam.id;
        }
        return snapshot.homeTeamApiFootballId === selectedTeam.apiFootballId || snapshot.awayTeamApiFootballId === selectedTeam.apiFootballId;
      })
    : countryFilteredSnapshots;

  const teamApiIds = Array.from(
    new Set(
      filteredSourceSnapshots
        .flatMap((snapshot) => [snapshot.homeTeamApiFootballId, snapshot.awayTeamApiFootballId])
        .filter((id: unknown): id is number => typeof id === 'number')
    )
  );

  const localTeams = teamApiIds.length
    ? await prisma.team.findMany({
        where: {
          apiFootballId: {
            in: teamApiIds,
          },
        },
        select: {
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          season: {
            select: {
              year: true,
            },
          },
        },
        orderBy: [{ season: { year: 'desc' } }],
      })
    : [];

  const localTeamMap = new Map<number, (typeof localTeams)[number]>();

  for (const team of localTeams) {
    if (typeof team.apiFootballId !== 'number') continue;
    if (!localTeamMap.has(team.apiFootballId)) {
      localTeamMap.set(team.apiFootballId, team);
    }
  }

  const normalizedSnapshots = filteredSourceSnapshots.map((snapshot) => {
    const localHomeTeam =
      typeof snapshot.homeTeamApiFootballId === 'number'
        ? localTeamMap.get(snapshot.homeTeamApiFootballId)
        : null;
    const localAwayTeam =
      typeof snapshot.awayTeamApiFootballId === 'number'
        ? localTeamMap.get(snapshot.awayTeamApiFootballId)
        : null;

    return {
      ...snapshot,
      homeTeamNameHe: localHomeTeam?.nameHe || snapshot.homeTeamNameHe,
      homeTeamNameEn: localHomeTeam?.nameEn || snapshot.homeTeamNameEn,
      awayTeamNameHe: localAwayTeam?.nameHe || snapshot.awayTeamNameHe,
      awayTeamNameEn: localAwayTeam?.nameEn || snapshot.awayTeamNameEn,
    };
  });

  return sortLiveSnapshots(normalizedSnapshots.map(mapSnapshotToHomepage)).slice(0, limit);
}
