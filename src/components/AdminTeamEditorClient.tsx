'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Player = {
  id: string;
  nameEn: string;
  nameHe: string;
  firstNameHe: string | null;
  lastNameHe: string | null;
  jerseyNumber: number | null;
  photoUrl: string | null;
  position: string | null;
  additionalInfo: any;
};

type Team = {
  id: string;
  nameEn: string;
  nameHe: string;
  shortNameEn: string | null;
  shortNameHe: string | null;
  logoUrl: string | null;
  coach: string | null;
  coachHe: string | null;
  countryHe: string | null;
  cityHe: string | null;
  stadiumHe: string | null;
  additionalInfo: any;
  players: Player[];
  seasonId: string;
};

type SeasonOption = {
  id: string;
  name: string;
  year: number;
};

export default function AdminTeamEditorClient({
  teamKey,
  selectedTeam,
  seasonOptions,
}: {
  teamKey: string;
  selectedTeam: Team;
  seasonOptions: SeasonOption[];
}) {
  const [teamForm, setTeamForm] = useState({
    nameHe: selectedTeam.nameHe || '',
    shortNameHe: selectedTeam.shortNameHe || '',
    coachHe: selectedTeam.coachHe || '',
    countryHe: selectedTeam.countryHe || '',
    cityHe: selectedTeam.cityHe || '',
    stadiumHe: selectedTeam.stadiumHe || '',
    logoUrl: selectedTeam.logoUrl || '',
    notesHe: selectedTeam.additionalInfo?.notesHe || '',
  });
  const [players, setPlayers] = useState(
    selectedTeam.players.map((player) => ({
      ...player,
      notesHe: player.additionalInfo?.notesHe || '',
      saving: false,
      saved: false,
      error: '',
    }))
  );
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamMessage, setTeamMessage] = useState('');

  const seasonHref = useMemo(
    () => (seasonId: string) => `/admin/teams/${teamKey}?season=${seasonId}`,
    [teamKey]
  );

  async function saveTeam() {
    setTeamSaving(true);
    setTeamMessage('');

    const response = await fetch('/api/teams', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedTeam.id,
        nameHe: teamForm.nameHe,
        shortNameHe: teamForm.shortNameHe,
        coachHe: teamForm.coachHe,
        countryHe: teamForm.countryHe,
        cityHe: teamForm.cityHe,
        stadiumHe: teamForm.stadiumHe,
        logoUrl: teamForm.logoUrl,
        notesHe: teamForm.notesHe,
      }),
    });

    const payload = await response.json();
    setTeamSaving(false);
    setTeamMessage(response.ok ? 'פרטי הקבוצה נשמרו.' : payload.error || 'שמירת הקבוצה נכשלה.');
  }

  async function savePlayer(playerId: string) {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, saving: true, saved: false, error: '' } : player
      )
    );

    const currentPlayer = players.find((player) => player.id === playerId);
    if (!currentPlayer) return;

    const response = await fetch('/api/players', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentPlayer.id,
        nameHe: currentPlayer.nameHe,
        firstNameHe: currentPlayer.firstNameHe,
        lastNameHe: currentPlayer.lastNameHe,
        jerseyNumber: currentPlayer.jerseyNumber,
        position: currentPlayer.position,
        photoUrl: currentPlayer.photoUrl,
        notesHe: currentPlayer.notesHe,
      }),
    });

    const payload = await response.json();

    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? {
              ...player,
              saving: false,
              saved: response.ok,
              error: response.ok ? '' : payload.error || 'השמירה נכשלה.',
            }
          : player
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm font-bold text-red-800">
            חזרה לאדמין
          </Link>
          <h1 className="mt-2 text-3xl font-black text-stone-900">{selectedTeam.nameHe || selectedTeam.nameEn}</h1>
          <p className="mt-2 text-sm text-stone-600">עריכת פרטי קבוצה ושחקנים לפי עונה.</p>
        </div>
      </div>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-stone-900">בחירת עונה</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {seasonOptions.map((season) => (
            <Link
              key={season.id}
              href={seasonHref(season.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                selectedTeam.seasonId === season.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-stone-50 text-stone-700'
              }`}
            >
              {season.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-black text-stone-900">פרטי קבוצה</h2>
          <p className="mt-2 text-sm text-stone-600">כאן אפשר לעדכן את השם בעברית, שם קצר, לוגו והערות.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="שם קבוצה בעברית" value={teamForm.nameHe} onChange={(value) => setTeamForm((current) => ({ ...current, nameHe: value }))} />
          <Field label="שם קצר בעברית" value={teamForm.shortNameHe} onChange={(value) => setTeamForm((current) => ({ ...current, shortNameHe: value }))} />
          <Field label="מאמן בעברית" value={teamForm.coachHe} onChange={(value) => setTeamForm((current) => ({ ...current, coachHe: value }))} />
          <Field label="מדינה בעברית" value={teamForm.countryHe} onChange={(value) => setTeamForm((current) => ({ ...current, countryHe: value }))} />
          <Field label="עיר בעברית" value={teamForm.cityHe} onChange={(value) => setTeamForm((current) => ({ ...current, cityHe: value }))} />
          <Field label="אצטדיון בעברית" value={teamForm.stadiumHe} onChange={(value) => setTeamForm((current) => ({ ...current, stadiumHe: value }))} />
          <Field label="כתובת לוגו" value={teamForm.logoUrl} onChange={(value) => setTeamForm((current) => ({ ...current, logoUrl: value }))} />
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-bold text-stone-700">הערות קבוצה</span>
            <textarea
              value={teamForm.notesHe}
              onChange={(event) => setTeamForm((current) => ({ ...current, notesHe: event.target.value }))}
              className="min-h-[110px] w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveTeam}
            disabled={teamSaving}
            className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white disabled:bg-stone-400"
          >
            {teamSaving ? 'שומר...' : 'שמור קבוצה'}
          </button>
          {teamMessage ? <span className="text-sm font-medium text-stone-600">{teamMessage}</span> : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-black text-stone-900">שחקנים בעונה הנבחרת</h2>
          <p className="mt-2 text-sm text-stone-600">אפשר לתרגם שמות לעברית, לעדכן תמונה ולהוסיף הערות לכל שחקן.</p>
        </div>

        <div className="space-y-4">
          {players.map((player) => (
            <article key={player.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-stone-900">{player.nameEn}</div>
                  <div className="text-sm text-stone-500">{player.position || 'ללא עמדה'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => savePlayer(player.id)}
                  disabled={player.saving}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-900 disabled:bg-stone-200"
                >
                  {player.saving ? 'שומר...' : 'שמור שחקן'}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="שם שחקן בעברית"
                  value={player.nameHe || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, nameHe: value, saved: false } : row))
                    )
                  }
                />
                <Field
                  label="מספר חולצה"
                  value={player.jerseyNumber?.toString() || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) =>
                        row.id === player.id
                          ? { ...row, jerseyNumber: value ? Number(value) : null, saved: false }
                          : row
                      )
                    )
                  }
                />
                <Field
                  label="שם פרטי בעברית"
                  value={player.firstNameHe || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, firstNameHe: value, saved: false } : row))
                    )
                  }
                />
                <Field
                  label="שם משפחה בעברית"
                  value={player.lastNameHe || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, lastNameHe: value, saved: false } : row))
                    )
                  }
                />
                <Field
                  label="עמדה"
                  value={player.position || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, position: value, saved: false } : row))
                    )
                  }
                />
                <Field
                  label="כתובת תמונה"
                  value={player.photoUrl || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, photoUrl: value, saved: false } : row))
                    )
                  }
                />
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-bold text-stone-700">הערות</span>
                  <textarea
                    value={player.notesHe}
                    onChange={(event) =>
                      setPlayers((current) =>
                        current.map((row) =>
                          row.id === player.id ? { ...row, notesHe: event.target.value, saved: false } : row
                        )
                      )
                    }
                    className="min-h-[100px] w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-red-500"
                  />
                </label>
              </div>

              {player.error ? <div className="mt-3 text-sm font-medium text-red-700">{player.error}</div> : null}
              {player.saved ? <div className="mt-3 text-sm font-medium text-emerald-700">השחקן נשמר בהצלחה.</div> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-red-500"
      />
    </label>
  );
}
