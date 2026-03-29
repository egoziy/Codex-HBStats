'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUPPORTED_COMPETITIONS } from '@/lib/competitions';

const COMPETITION_GROUP_LABELS = {
  ISRAEL: 'ישראל',
  EUROPE: 'אירופה',
} as const;

type TeamOption = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  logoUrl?: string | null;
};

type StepState = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  syncedCount?: number;
  fetchedCount?: number;
  note?: string | null;
};

type ResourceDef = {
  key: string;
  label: string;
  supported: boolean;
  requiresAllTeams?: boolean;
};

const resourceDefs: ResourceDef[] = [
  { key: 'countries', label: 'מדינות', supported: true },
  { key: 'seasons', label: 'עונות', supported: true },
  { key: 'leagues', label: 'ליגות', supported: true },
  { key: 'competitions', label: 'מסגרות ותחרויות', supported: true },
  { key: 'teams', label: 'קבוצות וסגלים', supported: true },
  { key: 'players', label: 'שחקנים וסטטיסטיקות שחקן', supported: true },
  { key: 'fixtures', label: 'משחקים ותוצאות', supported: true },
  { key: 'standings', label: 'טבלאות ליגה', supported: true },
  { key: 'events', label: 'אירועי משחק', supported: true },
  { key: 'lineups', label: 'הרכבים', supported: true },
  { key: 'statistics', label: 'סטטיסטיקות משחק', supported: true },
  { key: 'topScorers', label: 'מלכי שערים', supported: true, requiresAllTeams: true },
  { key: 'topAssists', label: 'מלכי בישולים', supported: true, requiresAllTeams: true },
  { key: 'injuries', label: 'פציעות', supported: true },
  { key: 'transfers', label: 'העברות', supported: true },
  { key: 'trophies', label: 'תארים', supported: true },
  { key: 'sidelined', label: 'שחקנים מושבתים', supported: true },
  { key: 'odds', label: 'יחסים', supported: true },
  { key: 'predictions', label: 'תחזיות', supported: true },
  { key: 'h2h', label: 'ראש בראש', supported: true },
  { key: 'livescore', label: 'לייב', supported: true },
];

const ALL_TEAMS_ONLY_RESOURCE_NOTE = 'זמין רק בבחירה של כל הקבוצות';
const RESOURCE_HELP_TEXT: Record<string, string> = {
  odds: 'זמין עבור משחקים עתידיים או חיים שכבר יובאו למערכת.',
  predictions: 'זמין עבור משחקים עתידיים או חיים שכבר יובאו למערכת.',
  h2h: 'זמין עבור משחקים עתידיים או חיים שכבר יובאו למערכת.',
  livescore: 'זמין רק כשיש כרגע משחקים חיים בליגה שנבחרה.',
};

resourceDefs.push({ key: 'globalLivescore', label: 'לייב גלובלי', supported: true, requiresAllTeams: true });
RESOURCE_HELP_TEXT.globalLivescore = 'שומר פיד לייב מכל המדינות עבור דף הבית, בלי לשנות את נתוני ישראל הקיימים.';

function getDefaultSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function formatSeasonLabel(yearValue: string) {
  const year = Number(yearValue);
  return Number.isFinite(year) ? `${year}-${year + 1}` : yearValue;
}

function getMinimumSeasonYearForCompetition(competitionId: string) {
  const minimumYears: Record<string, number> = {
    '2': 2011,
    '3': 2011,
    '382': 2016,
    '383': 2016,
    '496': 2016,
    '384': 2018,
    '385': 2019,
    '659': 2020,
    '848': 2021,
  };

  return minimumYears[competitionId] || null;
}

export default function ApiFetchForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [season, setSeason] = useState(String(getDefaultSeasonYear()));
  const [leagueId, setLeagueId] = useState('383');
  const [teamSelection, setTeamSelection] = useState('all');
  const [availableTeams, setAvailableTeams] = useState<TeamOption[]>(teams);
  const [selectedResources, setSelectedResources] = useState<string[]>([
    'countries',
    'seasons',
    'leagues',
    'teams',
    'players',
    'fixtures',
    'standings',
    'events',
  ]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const seasons = useMemo(() => {
    const defaultSeasonYear = getDefaultSeasonYear();
    const minimumSeasonYear = getMinimumSeasonYearForCompetition(leagueId) || defaultSeasonYear - 10;
    return Array.from({ length: 11 }, (_, index) => String(defaultSeasonYear - index)).filter(
      (value) => Number(value) >= minimumSeasonYear
    );
  }, [leagueId]);

  const selectedCompetition = SUPPORTED_COMPETITIONS.find((competition) => competition.id === leagueId) || null;
  const minimumSeasonYear = getMinimumSeasonYearForCompetition(leagueId);
  const isTeamScoped = teamSelection !== 'all';
  const competitionGroups = useMemo(() => {
    return Object.entries(COMPETITION_GROUP_LABELS)
      .map(([region, label]) => ({
        region,
        label,
        competitions: SUPPORTED_COMPETITIONS.filter((competition) => competition.region === region),
      }))
      .filter((group) => group.competitions.length > 0);
  }, []);

  const availableResourceDefs = useMemo(
    () =>
      resourceDefs.map((resource) => {
        const disabledForScope = Boolean(resource.requiresAllTeams && isTeamScoped);
        return {
          ...resource,
          disabled: !resource.supported || disabledForScope,
          disabledReason: disabledForScope ? ALL_TEAMS_ONLY_RESOURCE_NOTE : null,
        };
      }),
    [isTeamScoped]
  );

  const selectableResourceKeys = useMemo(
    () => availableResourceDefs.filter((resource) => !resource.disabled).map((resource) => resource.key),
    [availableResourceDefs]
  );

  const enabledSelectedResources = useMemo(
    () => selectedResources.filter((key) => selectableResourceKeys.includes(key)),
    [selectedResources, selectableResourceKeys]
  );

  const progressPercent = useMemo(() => {
    if (!steps.length) return 0;
    const done = steps.filter((step) => step.status === 'done').length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

  const allSupportedSelected = useMemo(
    () => selectableResourceKeys.length > 0 && selectableResourceKeys.every((key) => selectedResources.includes(key)),
    [selectableResourceKeys, selectedResources]
  );

  useEffect(() => {
    setSelectedResources((current) => current.filter((key) => selectableResourceKeys.includes(key)));
  }, [selectableResourceKeys]);

  useEffect(() => {
    if (!minimumSeasonYear) return;
    if (Number(season) < minimumSeasonYear) {
      setSeason(String(minimumSeasonYear));
    }
  }, [minimumSeasonYear, season]);

  useEffect(() => {
    if (!loading || steps.length === 0) {
      return undefined;
    }

    let currentIndex = 0;

    const timer = window.setInterval(() => {
      setSteps((current) =>
        current.map((step, index) => {
          if (index < currentIndex) return { ...step, status: 'done' };
          if (index === currentIndex) return { ...step, status: 'running' };
          return step;
        })
      );

      if (currentIndex < steps.length - 1) {
        currentIndex += 1;
      }
    }, 700);

    return () => window.clearInterval(timer);
  }, [loading, steps.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      setLoadingTeams(true);

      try {
        const response = await fetch(
          `/api/admin/options/teams?season=${encodeURIComponent(season)}&leagueId=${encodeURIComponent(leagueId)}`
        );
        const payload = await response.json();

        if (!response.ok || cancelled) {
          if (!cancelled) {
            setAvailableTeams([]);
            setTeamSelection('all');
          }
          return;
        }

        const nextTeams = payload.teams || [];
        setAvailableTeams(nextTeams);

        if (teamSelection !== 'all' && !nextTeams.some((team: TeamOption) => team.id === teamSelection)) {
          setTeamSelection('all');
        }
      } catch {
        if (!cancelled) {
          setAvailableTeams([]);
          setTeamSelection('all');
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [season, leagueId, teamSelection]);

  async function handleFetch() {
    setLoading(true);
    setResult(null);
    setJobId(null);

    const selectedStepStates = availableResourceDefs
      .filter((resource) => enabledSelectedResources.includes(resource.key))
      .map((resource) => ({ key: resource.key, label: resource.label, status: 'pending' as const }));

    setSteps(selectedStepStates);

    try {
      const response = await fetch('/api/admin/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season,
          leagueId,
          teamSelection,
          resources: enabledSelectedResources,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setResult(payload.error || 'משיכת הנתונים נכשלה.');
        setSteps((current) => current.map((step) => ({ ...step, status: 'failed' })));
        return;
      }

      setJobId(payload.jobId || null);
      setSteps(
        Array.isArray(payload.steps)
          ? payload.steps
          : selectedStepStates.map((step) => ({ ...step, status: 'done' as const }))
      );
      setResult(
        `המשיכה הסתיימה. סונכרנו ${payload.countriesSaved || 0} מדינות, ${payload.seasonsSaved || 0} עונות, ${payload.leaguesSaved || 0} ליגות, נוספו או עודכנו ${payload.teamsAdded} קבוצות, ${payload.playersAdded} שחקנים, ${payload.sidelinedSaved || 0} שחקנים מושבתים, ${payload.gamesAdded} משחקים, ${payload.standingsUpdated} שורות טבלה, ${payload.eventsSaved || 0} אירועים, ${payload.injuriesSaved || 0} פציעות, ${payload.transfersSaved || 0} העברות, ${payload.trophiesSaved || 0} תארים, ${payload.predictionsSaved || 0} תחזיות, ${payload.h2hSaved || 0} רשומות ראש בראש, ${payload.oddsSaved || 0} יחסים ו-${payload.livescoreSaved || 0} משחקי לייב.`
      );
      router.refresh();
    } catch {
      setSteps((current) => current.map((step) => ({ ...step, status: 'failed' })));
      setResult('התרחשה תקלה במהלך משיכת הנתונים.');
    } finally {
      setLoading(false);
    }
  }

  function toggleResource(key: string) {
    if (!selectableResourceKeys.includes(key)) return;

    setSelectedResources((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function toggleAllSupported() {
    setSelectedResources((current) => {
      if (selectableResourceKeys.every((key) => current.includes(key))) {
        return current.filter((key) => !selectableResourceKeys.includes(key));
      }

      const next = new Set(current);
      for (const key of selectableResourceKeys) {
        next.add(key);
      }
      return Array.from(next);
    });
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Fetch</p>
        <h2 className="text-2xl font-black text-stone-900">משיכת נתונים מ-API-Football</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          אפשר לבחור בדיוק אילו שכבות נתונים למשוך. הקבוצות נטענות ישירות מה-API לפי העונה והליגה שבחרתם.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="עונה">
          <select
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3"
          >
            {seasons.map((value) => (
              <option key={value} value={value}>
                {formatSeasonLabel(value)}
              </option>
            ))}
          </select>
          {minimumSeasonYear ? (
            <span className="mt-2 block text-xs text-stone-500">
              העונה המוקדמת ביותר הזמינה ב-API לתחרות זו היא {formatSeasonLabel(String(minimumSeasonYear))}
            </span>
          ) : null}
        </Field>

        <Field label="ליגה">
          <select
            value={leagueId}
            onChange={(event) => setLeagueId(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3"
          >
            {competitionGroups.map((group) => (
              <optgroup key={group.region} label={group.label}>
                {group.competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.nameHe}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedCompetition?.notes ? (
            <span className="mt-2 block text-xs text-stone-500">{selectedCompetition.notes}</span>
          ) : null}
        </Field>

        <Field label="קבוצה">
          <select
            value={teamSelection}
            onChange={(event) => setTeamSelection(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3"
          >
            <option value="all">כל הקבוצות</option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.nameHe || team.nameEn}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-stone-500">
            {loadingTeams ? 'טוען קבוצות מה-API...' : `${availableTeams.length} קבוצות זמינות למשיכה`}
          </span>
        </Field>
      </div>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="font-bold text-stone-900">מה למשוך?</div>
          <button
            type="button"
            onClick={toggleAllSupported}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
          >
            {allSupportedSelected ? 'נקה בחירה' : 'בחר הכל'}
          </button>
        </div>
        <div className="mb-3 text-xs text-stone-500">
          ממומש כרגע בפועל: מדינות, עונות, ליגות, מסגרות, קבוצות, שחקנים, שחקנים מושבתים, משחקים, טבלאות,
          אירועים, הרכבים, סטטיסטיקות משחק, מלכי שערים/בישולים, פציעות, העברות, תארים, תחזיות, ראש בראש,
          יחסים ולייב.
        </div>
        {isTeamScoped ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            בבחירת קבוצה ספציפית סעיפים שזמינים רק בייבוא של כל הקבוצות ננעלים אוטומטית.
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {availableResourceDefs.map((resource) => (
            <label
              key={resource.key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                resource.disabled ? 'border-stone-200 bg-stone-100 text-stone-400' : 'border-stone-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedResources.includes(resource.key)}
                disabled={resource.disabled}
                onChange={() => toggleResource(resource.key)}
              />
              <div>
                <span className={`font-semibold ${resource.disabled ? 'text-stone-400' : 'text-stone-700'}`}>
                  {resource.label}
                  {!resource.supported ? ' (בקרוב)' : ''}
                  {resource.disabledReason ? ` (${resource.disabledReason})` : ''}
                </span>
                {RESOURCE_HELP_TEXT[resource.key] ? (
                  <div className={`mt-1 text-xs ${resource.disabled ? 'text-stone-400' : 'text-stone-500'}`}>
                    {RESOURCE_HELP_TEXT[resource.key]}
                  </div>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={handleFetch}
          disabled={loading || loadingTeams || enabledSelectedResources.length === 0}
          className="rounded-full bg-stone-900 px-6 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {loading ? 'מושך נתונים...' : 'התחלת משיכה'}
        </button>
        <div className="text-sm text-stone-500">המערכת שומרת גם את המקור באנגלית וגם את התרגום לעברית.</div>
      </div>

      {steps.length ? (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-bold text-stone-900">התקדמות</div>
            <div className="text-sm font-semibold text-stone-600">{progressPercent}%</div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-red-700 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-4 space-y-2">
            {steps.map((step) => (
              <div key={step.key} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm">
                <div>
                  <span className="font-semibold text-stone-700">{step.label}</span>
                  {step.note ? <div className="mt-1 text-xs text-stone-500">{step.note}</div> : null}
                </div>
                <div className="text-left">
                  <span className="font-bold">
                    {step.status === 'done'
                      ? `הושלם${typeof step.syncedCount === 'number' ? ` | ${step.syncedCount} סונכרנו` : ''}`
                      : step.status === 'running'
                        ? 'בתהליך'
                        : step.status === 'failed'
                          ? 'נכשל'
                          : 'ממתין'}
                  </span>
                  {typeof step.fetchedCount === 'number' ? (
                    <div className="mt-1 text-xs font-medium text-stone-500">{`נמצאו ${step.fetchedCount}`}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700">
          {result}
        </div>
      ) : null}

      {jobId ? <div className="mt-3 text-xs text-stone-500">Job ID: {jobId}</div> : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      {children}
    </label>
  );
}
