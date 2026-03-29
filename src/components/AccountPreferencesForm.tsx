'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type TeamOption = {
  apiFootballId: number;
  name: string;
};

type CompetitionOption = {
  apiFootballId: number;
  name: string;
};

export default function AccountPreferencesForm({
  teams,
  competitions,
  initialFavoriteTeamApiIds,
  initialFavoriteCompetitionApiIds,
}: {
  teams: TeamOption[];
  competitions: CompetitionOption[];
  initialFavoriteTeamApiIds: number[];
  initialFavoriteCompetitionApiIds: number[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [favoriteTeamApiIds, setFavoriteTeamApiIds] = useState<number[]>(initialFavoriteTeamApiIds);
  const [favoriteCompetitionApiIds, setFavoriteCompetitionApiIds] = useState<number[]>(initialFavoriteCompetitionApiIds);
  const [teamQuery, setTeamQuery] = useState('');
  const [competitionQuery, setCompetitionQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const visibleTeams = useMemo(() => {
    const normalized = teamQuery.trim().toLowerCase();
    if (!normalized) return teams;
    return teams.filter((team) => team.name.toLowerCase().includes(normalized));
  }, [teams, teamQuery]);

  const visibleCompetitions = useMemo(() => {
    const normalized = competitionQuery.trim().toLowerCase();
    if (!normalized) return competitions;
    return competitions.filter((competition) => competition.name.toLowerCase().includes(normalized));
  }, [competitions, competitionQuery]);

  function toggleId(current: number[], id: number) {
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  }

  async function handleSave() {
    setMessage(null);

    const response = await fetch('/api/account/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        favoriteTeamApiIds,
        favoriteCompetitionApiIds,
      }),
    });

    if (!response.ok) {
      setMessage('לא הצלחנו לשמור כרגע את ההעדפות.');
      return;
    }

    setMessage('ההעדפות נשמרו בהצלחה.');
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section className="rounded-[24px] border border-white/70 bg-white/90 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Preferences</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">קבוצות וליגות מועדפות</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        אפשר לבחור כמה קבוצות וכמה ליגות מועדפות. דף הבית ישתמש בהעדפות האלו כברירת מחדל ויציג תוכן ממוקד יותר עבורך.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PreferenceBlock
          title="קבוצות מועדפות"
          query={teamQuery}
          setQuery={setTeamQuery}
          placeholder="חיפוש קבוצה..."
          options={visibleTeams.map((team) => ({ id: team.apiFootballId, label: team.name }))}
          selectedIds={favoriteTeamApiIds}
          onToggle={(id) => setFavoriteTeamApiIds((current) => toggleId(current, id))}
        />
        <PreferenceBlock
          title="ליגות מועדפות"
          query={competitionQuery}
          setQuery={setCompetitionQuery}
          placeholder="חיפוש ליגה..."
          options={visibleCompetitions.map((competition) => ({ id: competition.apiFootballId, label: competition.name }))}
          selectedIds={favoriteCompetitionApiIds}
          onToggle={(id) => setFavoriteCompetitionApiIds((current) => toggleId(current, id))}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-stone-500">
          נבחרו {favoriteTeamApiIds.length} קבוצות ו-{favoriteCompetitionApiIds.length} ליגות.
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? 'שומר...' : 'שמור העדפות'}
        </button>
      </div>

      {message ? <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700">{message}</div> : null}
    </section>
  );
}

function PreferenceBlock({
  title,
  query,
  setQuery,
  placeholder,
  options,
  selectedIds,
  onToggle,
}: {
  title: string;
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
  options: Array<{ id: number; label: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-stone-900">{title}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-700">{selectedIds.length} נבחרו</span>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="mt-4 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400"
      />
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
        {options.map((option) => {
          const checked = selectedIds.includes(option.id);
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
                checked ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <span className={`font-semibold ${checked ? 'text-red-900' : 'text-stone-800'}`}>{option.label}</span>
              <input type="checkbox" checked={checked} onChange={() => onToggle(option.id)} />
            </label>
          );
        })}
        {options.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">לא נמצאו תוצאות לחיפוש הזה.</div> : null}
      </div>
    </div>
  );
}
