'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUPPORTED_COMPETITIONS } from '@/lib/competitions';

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
};

const resourceDefs = [
  { key: 'countries', label: 'מדינות' },
  { key: 'seasons', label: 'עונות' },
  { key: 'leagues', label: 'ליגות' },
  { key: 'competitions', label: 'מסגרות ותחרויות' },
  { key: 'teams', label: 'קבוצות וסגלים' },
  { key: 'players', label: 'שחקנים וסטטיסטיקות שחקן' },
  { key: 'fixtures', label: 'משחקים ותוצאות' },
  { key: 'standings', label: 'טבלאות ליגה' },
  { key: 'events', label: 'אירועי משחק' },
  { key: 'lineups', label: 'הרכבים' },
  { key: 'statistics', label: 'סטטיסטיקות משחק' },
  { key: 'topScorers', label: 'מלכי שערים' },
  { key: 'topAssists', label: 'מלכי בישולים' },
  { key: 'injuries', label: 'פציעות' },
  { key: 'transfers', label: 'העברות' },
  { key: 'trophies', label: 'תארים' },
  { key: 'sidelined', label: 'שחקנים מושבתים' },
  { key: 'odds', label: 'יחסים' },
  { key: 'predictions', label: 'תחזיות' },
  { key: 'h2h', label: 'ראש בראש' },
  { key: 'livescore', label: 'לייב' },
];

export default function ApiFetchForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [season, setSeason] = useState('2025');
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
  ]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const seasons = useMemo(() => Array.from({ length: 11 }, (_, index) => String(2025 - index)), []);
  const selectedCompetition = SUPPORTED_COMPETITIONS.find((competition) => competition.id === leagueId) || null;

  const progressPercent = useMemo(() => {
    if (!steps.length) return 0;
    const done = steps.filter((step) => step.status === 'done').length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

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

    const selectedStepStates = resourceDefs
      .filter((resource) => selectedResources.includes(resource.key))
      .map((resource) => ({ ...resource, status: 'pending' as const }));

    setSteps(selectedStepStates);

    try {
      const response = await fetch('/api/admin/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season,
          leagueId,
          teamSelection,
          resources: selectedResources,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setResult(payload.error || 'משיכת הנתונים נכשלה.');
        setSteps((current) => current.map((step) => ({ ...step, status: 'failed' })));
        return;
      }

      setJobId(payload.jobId || null);
      setSteps((current) => current.map((step) => ({ ...step, status: 'done' })));
      setResult(
        `המשיכה הסתיימה. נוספו או עודכנו ${payload.teamsAdded} קבוצות, ${payload.playersAdded} שחקנים, ${payload.gamesAdded} משחקים ו-${payload.standingsUpdated} שורות טבלה.`
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
    setSelectedResources((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
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
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ליגה">
          <select
            value={leagueId}
            onChange={(event) => setLeagueId(event.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3"
          >
            {SUPPORTED_COMPETITIONS.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.nameHe}
              </option>
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
        <div className="mb-3 font-bold text-stone-900">מה למשוך?</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resourceDefs.map((resource) => (
            <label
              key={resource.key}
              className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
            >
              <input
                type="checkbox"
                checked={selectedResources.includes(resource.key)}
                onChange={() => toggleResource(resource.key)}
              />
              <span className="font-semibold text-stone-700">{resource.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={handleFetch}
          disabled={loading || loadingTeams || selectedResources.length === 0}
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
                <span className="font-semibold text-stone-700">{step.label}</span>
                <span className="font-bold">
                  {step.status === 'done'
                    ? 'הושלם'
                    : step.status === 'running'
                      ? 'בתהליך'
                      : step.status === 'failed'
                        ? 'נכשל'
                        : 'ממתין'}
                </span>
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
