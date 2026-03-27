'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatCoachName, getLatestCoachAssignment } from '@/lib/coach-display';
import { formatPlayerName } from '@/lib/player-display';

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
  uploads: Upload[];
};

type Upload = {
  id: string;
  filePath: string;
  title: string | null;
  isPrimary: boolean;
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
  coachAssignments: CoachAssignment[];
  countryHe: string | null;
  cityHe: string | null;
  stadiumHe: string | null;
  additionalInfo: any;
  players: Player[];
  uploads: Upload[];
  seasonId: string;
};

type CoachAssignment = {
  id: string;
  coachNameEn: string;
  coachNameHe: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  createdAt?: string | Date;
};

type Standing = {
  id: string;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
};

type SeasonOption = {
  id: string;
  name: string;
  year: number;
};

export default function AdminTeamEditorClient({
  teamKey,
  selectedTeam,
  currentStanding,
  seasonOptions,
}: {
  teamKey: string;
  selectedTeam: Team;
  currentStanding: Standing | null;
  seasonOptions: SeasonOption[];
}) {
  const latestCoachAssignment = getLatestCoachAssignment(selectedTeam.coachAssignments || []);
  const [teamForm, setTeamForm] = useState(() => buildTeamForm(selectedTeam, latestCoachAssignment));
  const [standingForm, setStandingForm] = useState({
    pointsAdjustment: String(currentStanding?.pointsAdjustment ?? 0),
    pointsAdjustmentNoteHe: currentStanding?.pointsAdjustmentNoteHe || '',
  });
  const [players, setPlayers] = useState(() => buildPlayersState(selectedTeam.players));
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamMessage, setTeamMessage] = useState('');
  const [standingSaving, setStandingSaving] = useState(false);
  const [standingMessage, setStandingMessage] = useState('');
  const [teamUploadTitle, setTeamUploadTitle] = useState('');
  const [teamUploadFile, setTeamUploadFile] = useState<File | null>(null);
  const [teamUploadSaving, setTeamUploadSaving] = useState(false);
  const [teamUploadMessage, setTeamUploadMessage] = useState('');

  const seasonHref = useMemo(
    () => (seasonId: string) => `/admin/teams/${teamKey}?season=${seasonId}`,
    [teamKey]
  );

  useEffect(() => {
    setTeamForm(buildTeamForm(selectedTeam, latestCoachAssignment));
    setStandingForm({
      pointsAdjustment: String(currentStanding?.pointsAdjustment ?? 0),
      pointsAdjustmentNoteHe: currentStanding?.pointsAdjustmentNoteHe || '',
    });
    setPlayers(buildPlayersState(selectedTeam.players));
    setTeamMessage('');
    setStandingMessage('');
  }, [selectedTeam, latestCoachAssignment, currentStanding]);

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
        coach: teamForm.coach,
        coachHe: teamForm.coachHe,
        coachAssignmentId: teamForm.coachAssignmentId || null,
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

  async function saveStanding() {
    setStandingSaving(true);
    setStandingMessage('');

    const response = await fetch('/api/standings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: selectedTeam.id,
        seasonId: selectedTeam.seasonId,
        pointsAdjustment: Number(standingForm.pointsAdjustment || 0),
        pointsAdjustmentNoteHe: standingForm.pointsAdjustmentNoteHe,
      }),
    });

    const payload = await response.json();
    setStandingSaving(false);
    setStandingMessage(response.ok ? 'תיקון הנקודות נשמר.' : payload.error || 'שמירת תיקון הנקודות נכשלה.');

    if (response.ok) {
      setStandingForm({
        pointsAdjustment: String(payload.pointsAdjustment ?? 0),
        pointsAdjustmentNoteHe: payload.pointsAdjustmentNoteHe || '',
      });
    }
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
              error: response.ok ? '' : payload.error || 'שמירת השחקן נכשלה.',
            }
          : player
      )
    );
  }

  async function uploadTeamImage(makePrimary: boolean) {
    if (!teamUploadFile) {
      setTeamUploadMessage('יש לבחור קובץ תמונה.');
      return;
    }

    setTeamUploadSaving(true);
    setTeamUploadMessage('');
    const formData = new FormData();
    formData.set('entityType', 'team');
    formData.set('entityId', selectedTeam.id);
    formData.set('title', teamUploadTitle);
    formData.set('isPrimary', String(makePrimary));
    formData.set('file', teamUploadFile);

    const response = await fetch('/api/media', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();
    setTeamUploadSaving(false);

    if (!response.ok) {
      setTeamUploadMessage(payload.error || 'העלאת התמונה נכשלה.');
      return;
    }

    setTeamUploadMessage(makePrimary ? 'התמונה הועלתה והוגדרה כלוגו ראשי.' : 'התמונה הועלתה לגלריית הקבוצה.');
    setTeamUploadTitle('');
    setTeamUploadFile(null);
    window.location.reload();
  }

  async function uploadPlayerImage(playerId: string, makePrimary: boolean) {
    const currentPlayer = players.find((player) => player.id === playerId);
    if (!currentPlayer?.uploadFile) {
      setPlayers((current) =>
        current.map((player) =>
          player.id === playerId ? { ...player, error: 'יש לבחור קובץ תמונה להעלאה.' } : player
        )
      );
      return;
    }

    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, uploadSaving: true, error: '' } : player
      )
    );

    const formData = new FormData();
    formData.set('entityType', 'player');
    formData.set('entityId', playerId);
    formData.set('title', currentPlayer.uploadTitle || '');
    formData.set('isPrimary', String(makePrimary));
    formData.set('file', currentPlayer.uploadFile);

    const response = await fetch('/api/media', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();

    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? {
              ...player,
              uploadSaving: false,
              uploadTitle: '',
              uploadFile: null,
              error: response.ok ? '' : payload.error || 'העלאת התמונה נכשלה.',
            }
          : player
      )
    );

    if (response.ok) {
      window.location.reload();
    }
  }

  const basePoints = currentStanding?.points ?? 0;
  const adjustedPoints = basePoints + Number(standingForm.pointsAdjustment || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm font-bold text-red-800">
            חזרה לאדמין
          </Link>
          <h1 className="mt-2 text-3xl font-black text-stone-900">{selectedTeam.nameHe || selectedTeam.nameEn}</h1>
          <p className="mt-2 text-sm text-stone-600">עריכת פרטי קבוצה, שחקנים ותיקון נקודות לפי עונה.</p>
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
          <p className="mt-2 text-sm text-stone-600">כאן אפשר לעדכן שם בעברית, לוגו, אצטדיון והערות מערכת.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="שם קבוצה בעברית" value={teamForm.nameHe} onChange={(value) => setTeamForm((current) => ({ ...current, nameHe: value }))} />
          <Field label="שם קצר בעברית" value={teamForm.shortNameHe} onChange={(value) => setTeamForm((current) => ({ ...current, shortNameHe: value }))} />
          <Field label="מאמן בעברית" value={teamForm.coachHe} onChange={(value) => setTeamForm((current) => ({ ...current, coachHe: value }))} />
          <Field label="מדינה בעברית" value={teamForm.countryHe} onChange={(value) => setTeamForm((current) => ({ ...current, countryHe: value }))} />
          <Field label="עיר בעברית" value={teamForm.cityHe} onChange={(value) => setTeamForm((current) => ({ ...current, cityHe: value }))} />
          <Field label="אצטדיון בעברית" value={teamForm.stadiumHe} onChange={(value) => setTeamForm((current) => ({ ...current, stadiumHe: value }))} />
          <Field label="כתובת לוגו" value={teamForm.logoUrl} onChange={(value) => setTeamForm((current) => ({ ...current, logoUrl: value }))} />
          <Field label="Coach (EN)" value={teamForm.coach} onChange={(value) => setTeamForm((current) => ({ ...current, coach: value }))} />
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

        {selectedTeam.coachAssignments.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <h3 className="text-lg font-black text-stone-900">היסטוריית מאמנים בעונה</h3>
            <div className="mt-3 space-y-2 text-sm text-stone-700">
              {selectedTeam.coachAssignments.map((assignment) => (
                <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                  <div className="font-bold text-stone-900">{formatCoachName(assignment)}</div>
                  <div className="text-xs text-stone-500">
                    {(assignment.startDate
                      ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(assignment.startDate))
                      : 'לא ידוע')}
                    {' - '}
                    {(assignment.endDate
                      ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(assignment.endDate))
                      : 'פעיל')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-lg font-black text-stone-900">תמונות קבוצה</h3>
          <p className="mt-2 text-sm text-stone-600">אפשר להעלות לוגו ראשי או תמונות נוספות לגלריה של הקבוצה.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
            <Field label="כותרת לתמונה" value={teamUploadTitle} onChange={setTeamUploadTitle} />
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-stone-700">קובץ תמונה</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setTeamUploadFile(event.target.files?.[0] || null)}
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
              />
            </label>
            <button
              type="button"
              onClick={() => uploadTeamImage(true)}
              disabled={teamUploadSaving}
              className="self-end rounded-full bg-stone-900 px-5 py-3 font-bold text-white disabled:bg-stone-400"
            >
              לוגו ראשי
            </button>
            <button
              type="button"
              onClick={() => uploadTeamImage(false)}
              disabled={teamUploadSaving}
              className="self-end rounded-full border border-stone-300 bg-white px-5 py-3 font-bold text-stone-800 disabled:bg-stone-100"
            >
              הוסף לגלריה
            </button>
          </div>
          {teamUploadMessage ? <div className="mt-3 text-sm font-medium text-stone-600">{teamUploadMessage}</div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {selectedTeam.uploads.map((upload) => (
              <div key={upload.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <img src={upload.filePath} alt={upload.title || selectedTeam.nameEn} className="h-32 w-full object-cover" />
                <div className="p-3 text-xs text-stone-600">
                  <div className="font-semibold text-stone-900">{upload.title || 'ללא כותרת'}</div>
                  <div className="mt-1 break-all">{upload.filePath}</div>
                  {upload.isPrimary ? <div className="mt-2 font-bold text-red-700">תמונה ראשית</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-black text-stone-900">הורדה או הוספת נקודות לעונה</h2>
          <p className="mt-2 text-sm text-stone-600">אפשר להזין מספר שלילי להורדת נקודות או מספר חיובי להוספת נקודות חריגה.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="תיקון נקודות"
            value={standingForm.pointsAdjustment}
            onChange={(value) => setStandingForm((current) => ({ ...current, pointsAdjustment: value }))}
            type="number"
          />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-semibold text-amber-900">נקודות בסיס</div>
            <div className="mt-1 text-2xl font-black text-amber-950">{basePoints}</div>
            <div className="mt-3 text-sm font-semibold text-amber-900">נקודות מוצגות אחרי תיקון</div>
            <div className="mt-1 text-2xl font-black text-amber-950">{adjustedPoints}</div>
          </div>
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-bold text-stone-700">סיבה או הערה</span>
            <textarea
              value={standingForm.pointsAdjustmentNoteHe}
              onChange={(event) =>
                setStandingForm((current) => ({ ...current, pointsAdjustmentNoteHe: event.target.value }))
              }
              className="min-h-[100px] w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveStanding}
            disabled={standingSaving}
            className="rounded-full bg-red-800 px-5 py-3 font-bold text-white disabled:bg-red-400"
          >
            {standingSaving ? 'שומר...' : 'שמור תיקון נקודות'}
          </button>
          {standingMessage ? <span className="text-sm font-medium text-stone-600">{standingMessage}</span> : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-black text-stone-900">שחקנים בעונה הנבחרת</h2>
          <p className="mt-2 text-sm text-stone-600">אפשר לתרגם שמות לעברית, לעדכן תמונה, מספר חולצה והערות לכל שחקן.</p>
        </div>

        <div className="space-y-4">
          {players.map((player) => (
            <article key={player.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-stone-900">{formatPlayerName(player)}</div>
                  {formatPlayerName(player) !== player.nameEn ? <div className="text-xs text-stone-400">{player.nameEn}</div> : null}
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
                  type="number"
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
                <Field
                  label="כותרת לתמונה חדשה"
                  value={player.uploadTitle || ''}
                  onChange={(value) =>
                    setPlayers((current) =>
                      current.map((row) => (row.id === player.id ? { ...row, uploadTitle: value } : row))
                    )
                  }
                />
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-stone-700">העלאת תמונה</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setPlayers((current) =>
                        current.map((row) =>
                          row.id === player.id ? { ...row, uploadFile: event.target.files?.[0] || null } : row
                        )
                      )
                    }
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
                  />
                </label>
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => uploadPlayerImage(player.id, true)}
                  disabled={player.uploadSaving}
                  className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:bg-stone-400"
                >
                  העלה כראשית
                </button>
                <button
                  type="button"
                  onClick={() => uploadPlayerImage(player.id, false)}
                  disabled={player.uploadSaving}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 disabled:bg-stone-100"
                >
                  הוסף לגלריה
                </button>
              </div>

              {player.uploads.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {player.uploads.map((upload) => (
                    <div key={upload.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      <img src={upload.filePath} alt={upload.title || formatPlayerName(player)} className="h-28 w-full object-cover" />
                      <div className="p-3 text-xs text-stone-600">
                        <div className="font-semibold text-stone-900">{upload.title || 'ללא כותרת'}</div>
                        {upload.isPrimary ? <div className="mt-2 font-bold text-red-700">תמונה ראשית</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

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
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-red-500"
      />
    </label>
  );
}

function buildPlayersState(players: Player[]) {
  return players.map((player) => ({
    ...player,
    notesHe: player.additionalInfo?.notesHe || '',
    uploadTitle: '',
    uploadFile: null as File | null,
    uploadSaving: false,
    saving: false,
    saved: false,
    error: '',
  }));
}

function buildTeamForm(team: Team, latestCoachAssignment: CoachAssignment | null) {
  return {
    nameHe: team.nameHe || '',
    shortNameHe: team.shortNameHe || '',
    coach: latestCoachAssignment?.coachNameEn || team.coach || '',
    coachHe: latestCoachAssignment?.coachNameHe || team.coachHe || '',
    coachAssignmentId: latestCoachAssignment?.id || '',
    countryHe: team.countryHe || '',
    cityHe: team.cityHe || '',
    stadiumHe: team.stadiumHe || '',
    logoUrl: team.logoUrl || '',
    notesHe: team.additionalInfo?.notesHe || '',
  };
}
