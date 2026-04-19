'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme, teamNameToColor } from '@/components/ThemeProvider';
import type { Theme, ColorSchemePref } from '@/components/ThemeProvider';

type TeamOption = {
  apiFootballId: number;
  name: string;
};

type CompetitionOption = {
  apiFootballId: number;
  name: string;
};

// ── Color scheme metadata ────────────────────────────────────────────────────
const COLOR_OPTIONS: Array<{
  id: ColorSchemePref;
  label: string;
  description: string;
  hue: number;
  sat: string;
  light: string;
}> = [
  { id: 'auto',   label: 'אוטומטי',           description: 'לפי הקבוצה המועדפת',        hue: 0,   sat: '85%', light: '52%' },
  { id: 'red',    label: 'אדום',               description: 'הפועל באר שבע / הפועל',      hue: 0,   sat: '85%', light: '52%' },
  { id: 'yellow', label: 'צהוב',               description: 'מכבי תל אביב / בית"ר ירושלים', hue: 45,  sat: '92%', light: '48%' },
  { id: 'green',  label: 'ירוק',               description: 'מכבי חיפה',                  hue: 145, sat: '63%', light: '38%' },
  { id: 'blue',   label: 'כחול',               description: 'בני יהודה / אחרים',          hue: 218, sat: '83%', light: '52%' },
];

function colorSwatch(hue: number, sat: string, light: string) {
  return `hsl(${hue} ${sat} ${light})`;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AccountPreferencesForm({
  teams,
  competitions,
  initialFavoriteTeamApiIds,
  initialFavoriteCompetitionApiIds,
  initialTheme,
  initialColorScheme,
}: {
  teams: TeamOption[];
  competitions: CompetitionOption[];
  initialFavoriteTeamApiIds: number[];
  initialFavoriteCompetitionApiIds: number[];
  initialTheme: Theme;
  initialColorScheme: ColorSchemePref;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { setTheme: applyTheme, setColorScheme: applyColor } = useTheme();

  const [favoriteTeamApiIds, setFavoriteTeamApiIds] = useState<number[]>(initialFavoriteTeamApiIds);
  const [favoriteCompetitionApiIds, setFavoriteCompetitionApiIds] = useState<number[]>(initialFavoriteCompetitionApiIds);
  const [teamQuery, setTeamQuery] = useState('');
  const [competitionQuery, setCompetitionQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Appearance state — local to this form (applied via ThemeProvider on save)
  const [selectedTheme, setSelectedTheme] = useState<Theme>(initialTheme);
  const [selectedColor, setSelectedColor] = useState<ColorSchemePref>(initialColorScheme);

  // Auto-detect color from first selected favorite team
  const autoDetectedColor = useMemo(() => {
    const firstTeam = teams.find((t) => favoriteTeamApiIds.includes(t.apiFootballId));
    return firstTeam ? teamNameToColor(firstTeam.name) : 'red';
  }, [teams, favoriteTeamApiIds]);

  const effectivePreviewColor = selectedColor === 'auto' ? autoDetectedColor : selectedColor;
  const previewOption = COLOR_OPTIONS.find((c) => c.id === effectivePreviewColor) || COLOR_OPTIONS[1];

  const visibleTeams = useMemo(() => {
    const n = teamQuery.trim().toLowerCase();
    return n ? teams.filter((t) => t.name.toLowerCase().includes(n)) : teams;
  }, [teams, teamQuery]);

  const visibleCompetitions = useMemo(() => {
    const n = competitionQuery.trim().toLowerCase();
    return n ? competitions.filter((c) => c.name.toLowerCase().includes(n)) : competitions;
  }, [competitions, competitionQuery]);

  function toggleId(current: number[], id: number) {
    return current.includes(id) ? current.filter((i) => i !== id) : [...current, id];
  }

  async function handleSave() {
    setMessage(null);

    const response = await fetch('/api/account/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        favoriteTeamApiIds,
        favoriteCompetitionApiIds,
        theme: selectedTheme,
        colorScheme: selectedColor,
      }),
    });

    if (!response.ok) {
      setMessage('לא הצלחנו לשמור את ההעדפות.');
      return;
    }

    // Persist team names for auto color-detection across page loads
    const selectedTeamNames = teams
      .filter((t) => favoriteTeamApiIds.includes(t.apiFootballId))
      .map((t) => t.name);
    if (typeof window !== 'undefined' && (window as any).__hbs_setTeamNames) {
      (window as any).__hbs_setTeamNames(selectedTeamNames);
    }

    // Apply immediately to the live page via ThemeProvider
    applyTheme(selectedTheme);
    applyColor(selectedColor);

    setMessage('ההעדפות נשמרו בהצלחה.');
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Appearance</p>
        <h2 className="mt-2 text-2xl font-black text-stone-900">עיצוב ועיצוב</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          בחר את מראה האתר ופלטת הצבעים. ניתן לשנות בכל עת.
        </p>

        {/* Theme toggle */}
        <div className="mt-6">
          <h3 className="text-base font-bold text-stone-800">סגנון תצוגה</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ThemeCard
              id="modern"
              selected={selectedTheme === 'modern'}
              onClick={() => setSelectedTheme('modern')}
              title="מודרני (ברירת מחדל)"
              description="עיצוב חדש ונקי עם כרטיסים ורקע בהיר. מנווטן זכוכית עם צבע הקבוצה."
              preview={
                <div className="h-16 rounded-xl overflow-hidden flex flex-col" style={{ background: '#f6f7fb' }}>
                  <div className="h-5 flex items-center px-2 gap-1" style={{ background: 'white', borderTop: `3px solid ${colorSwatch(previewOption.hue, previewOption.sat, previewOption.light)}`, borderBottom: '1px solid #e5e7eb' }}>
                    <div className="h-2 w-8 rounded-full" style={{ background: colorSwatch(previewOption.hue, previewOption.sat, previewOption.light) }} />
                    <div className="h-2 w-5 rounded-full bg-stone-200 mr-auto" />
                    <div className="h-2 w-5 rounded-full bg-stone-200" />
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-2 px-2">
                    <div className="h-7 flex-1 rounded-lg bg-white border border-stone-200" />
                    <div className="h-7 flex-1 rounded-lg bg-white border border-stone-200" />
                  </div>
                </div>
              }
            />
            <ThemeCard
              id="classic"
              selected={selectedTheme === 'classic'}
              onClick={() => setSelectedTheme('classic')}
              title="קלאסי"
              description="הסגנון המקורי עם ניווטן כהה-אדום ורקע חם בטון שמנת."
              preview={
                <div className="h-16 rounded-xl overflow-hidden flex flex-col" style={{ background: '#efe4d0' }}>
                  <div className="h-5 flex items-center px-2 gap-1" style={{ background: 'linear-gradient(120deg, #7f1d1d, #111827)' }}>
                    <div className="h-2 w-8 rounded-full bg-amber-300" />
                    <div className="h-2 w-5 rounded-full bg-white/30 mr-auto" />
                    <div className="h-2 w-5 rounded-full bg-white/30" />
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-2 px-2">
                    <div className="h-7 flex-1 rounded-[12px] bg-white/70 border border-stone-300" />
                    <div className="h-7 flex-1 rounded-[12px] bg-white/70 border border-stone-300" />
                  </div>
                </div>
              }
            />
          </div>
        </div>

        {/* Color scheme */}
        <div className="mt-6">
          <h3 className="text-base font-bold text-stone-800">פלטת צבעים</h3>
          {selectedColor === 'auto' && (
            <p className="mt-1 text-xs text-stone-500">
              זוהה אוטומטית לפי הקבוצה המועדפת שלך:
              <span className="mr-1 font-bold" style={{ color: colorSwatch(previewOption.hue, previewOption.sat, previewOption.light) }}>
                {previewOption.label}
              </span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {COLOR_OPTIONS.map((opt) => {
              const isSelected = selectedColor === opt.id;
              const swatchColor = opt.id === 'auto'
                ? colorSwatch(previewOption.hue, previewOption.sat, previewOption.light)
                : colorSwatch(opt.hue, opt.sat, opt.light);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedColor(opt.id)}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                    isSelected
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-white/30 shadow-sm flex-shrink-0"
                    style={{ background: opt.id === 'auto' ? `conic-gradient(#ef4444, #f59e0b, #16a34a, #3b82f6, #ef4444)` : swatchColor }}
                  />
                  <span>{opt.label}</span>
                  {opt.id !== 'auto' && (
                    <span className="hidden text-xs font-normal text-stone-400 sm:inline">{opt.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Teams & Competitions ─────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Preferences</p>
        <h2 className="mt-2 text-2xl font-black text-stone-900">קבוצות וליגות מועדפות</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          אפשר לבחור כמה קבוצות וכמה ליגות מועדפות. דף הבית ישתמש בהעדפות האלו כברירת מחדל.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <PreferenceBlock
            title="קבוצות מועדפות"
            query={teamQuery}
            setQuery={setTeamQuery}
            placeholder="חיפוש קבוצה..."
            options={visibleTeams.map((t) => ({ id: t.apiFootballId, label: t.name }))}
            selectedIds={favoriteTeamApiIds}
            onToggle={(id) => setFavoriteTeamApiIds((c) => toggleId(c, id))}
          />
          <PreferenceBlock
            title="ליגות מועדפות"
            query={competitionQuery}
            setQuery={setCompetitionQuery}
            placeholder="חיפוש ליגה..."
            options={visibleCompetitions.map((c) => ({ id: c.apiFootballId, label: c.name }))}
            selectedIds={favoriteCompetitionApiIds}
            onToggle={(id) => setFavoriteCompetitionApiIds((c) => toggleId(c, id))}
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
            {isPending ? 'שומר...' : 'שמור הכל'}
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700">{message}</div>
        ) : null}
      </section>
    </div>
  );
}

// ── ThemeCard ────────────────────────────────────────────────────────────────
function ThemeCard({
  id,
  selected,
  onClick,
  title,
  description,
  preview,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-[18px] border-2 p-3 text-right transition ${
        selected
          ? 'border-stone-900 bg-stone-50'
          : 'border-stone-200 bg-white hover:border-stone-300'
      }`}
    >
      {selected && (
        <span className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-xs text-white">✓</span>
      )}
      {preview}
      <div className="mt-2">
        <div className="text-sm font-black text-stone-900">{title}</div>
        <div className="mt-0.5 text-xs text-stone-500">{description}</div>
      </div>
    </button>
  );
}

// ── PreferenceBlock ──────────────────────────────────────────────────────────
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
  setQuery: (v: string) => void;
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
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="mt-4 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-red-400"
      />
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
        {options.map((opt) => {
          const checked = selectedIds.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
                checked ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <span className={`font-semibold ${checked ? 'text-red-900' : 'text-stone-800'}`}>{opt.label}</span>
              <input type="checkbox" checked={checked} onChange={() => onToggle(opt.id)} />
            </label>
          );
        })}
        {options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">לא נמצאו תוצאות.</div>
        ) : null}
      </div>
    </div>
  );
}
