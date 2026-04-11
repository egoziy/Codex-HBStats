'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Team = { id: string; nameHe: string | null; nameEn: string };

export default function HomeFilterBar({
  teams,
  selectedTeamIds,
}: {
  teams: Team[];
  selectedTeamIds: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedTeamIds));

  const hasSelection = selected.size > 0;

  function toggle(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function apply() {
    const params = new URLSearchParams();
    for (const id of selected) params.append('team', id);
    router.push(`/?${params.toString()}`);
    setOpen(false);
  }

  function clear() {
    setSelected(new Set());
    router.push('/');
    setOpen(false);
  }

  const selectedTeams = teams.filter((t) => selected.has(t.id));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-bold text-stone-700 transition hover:border-stone-400"
        >
          {hasSelection ? `${selected.size} קבוצות נבחרו` : 'בחר קבוצות'} {open ? '▲' : '▼'}
        </button>

        {selectedTeams.map((team) => (
          <span key={team.id} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
            {team.nameHe || team.nameEn}
            <button
              onClick={() => {
                const next = new Set(selected);
                next.delete(team.id);
                setSelected(next);
                const params = new URLSearchParams();
                for (const id of next) params.append('team', id);
                router.push(next.size ? `/?${params.toString()}` : '/');
              }}
              className="mr-1 text-red-500 hover:text-red-800"
            >
              ✕
            </button>
          </span>
        ))}

        {hasSelection && !open && (
          <button onClick={clear} className="text-xs font-bold text-stone-400 hover:text-red-700">
            נקה הכל
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            {teams.map((team) => {
              const isSelected = selected.has(team.id);
              return (
                <button
                  key={team.id}
                  onClick={() => toggle(team.id)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {team.nameHe || team.nameEn}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-stone-100 pt-2">
            <button onClick={apply} className="rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-bold text-white">
              הצג
            </button>
            <button onClick={clear} className="text-xs font-bold text-stone-400 hover:text-red-700">
              נקה הכל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
