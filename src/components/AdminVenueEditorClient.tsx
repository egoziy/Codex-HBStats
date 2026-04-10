'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Upload = {
  id: string;
  filePath: string;
  title: string | null;
  isPrimary: boolean;
};

type VenueTeam = {
  id: string;
  nameHe: string;
  nameEn: string;
  season: {
    id: string;
    name: string;
    year: number;
  };
};

type VenueRecord = {
  id: string;
  apiFootballId: number | null;
  nameHe: string;
  nameEn: string;
  addressHe: string | null;
  addressEn: string | null;
  cityHe: string | null;
  cityEn: string | null;
  countryHe: string | null;
  countryEn: string | null;
  capacity: number | null;
  surface: string | null;
  imageUrl: string | null;
  additionalInfo: {
    descriptionHe?: string | null;
    descriptionEn?: string | null;
    openedYear?: number | null;
    mapUrl?: string | null;
  } | null;
  uploads: Upload[];
  teams: VenueTeam[];
};

type TeamOption = {
  id: string;
  nameHe: string;
  nameEn: string;
  season: {
    id: string;
    name: string;
    year: number;
  };
  venueId: string | null;
};

type VenueFormState = {
  id: string;
  nameHe: string;
  nameEn: string;
  addressHe: string;
  addressEn: string;
  cityHe: string;
  cityEn: string;
  countryHe: string;
  countryEn: string;
  capacity: string;
  surface: string;
  imageUrl: string;
  descriptionHe: string;
  descriptionEn: string;
  openedYear: string;
  mapUrl: string;
  linkedTeamIds: string[];
};

function buildVenueForm(venue: VenueRecord | null): VenueFormState {
  return {
    id: venue?.id || '',
    nameHe: venue?.nameHe || '',
    nameEn: venue?.nameEn || '',
    addressHe: venue?.addressHe || '',
    addressEn: venue?.addressEn || '',
    cityHe: venue?.cityHe || '',
    cityEn: venue?.cityEn || '',
    countryHe: venue?.countryHe || '',
    countryEn: venue?.countryEn || '',
    capacity: venue?.capacity?.toString() || '',
    surface: venue?.surface || '',
    imageUrl: venue?.imageUrl || '',
    descriptionHe: venue?.additionalInfo?.descriptionHe || '',
    descriptionEn: venue?.additionalInfo?.descriptionEn || '',
    openedYear: venue?.additionalInfo?.openedYear?.toString() || '',
    mapUrl: venue?.additionalInfo?.mapUrl || '',
    linkedTeamIds: venue?.teams.map((team) => team.id) || [],
  };
}

function buildCreateForm(): VenueFormState {
  return buildVenueForm(null);
}

export default function AdminVenueEditorClient({
  venues,
  teams,
  initialVenueId,
}: {
  venues: VenueRecord[];
  teams: TeamOption[];
  initialVenueId: string | null;
}) {
  const router = useRouter();
  const [selectedVenueId, setSelectedVenueId] = useState(initialVenueId || venues[0]?.id || '');
  const [venueSearch, setVenueSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [form, setForm] = useState(() => buildVenueForm(venues.find((venue) => venue.id === (initialVenueId || venues[0]?.id)) || venues[0] || null));
  const [createForm, setCreateForm] = useState(() => buildCreateForm());

  const deferredVenueSearch = useDeferredValue(venueSearch);
  const deferredTeamSearch = useDeferredValue(teamSearch);
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) || null;

  useEffect(() => {
    setForm(buildVenueForm(selectedVenue));
    setSaveMessage('');
    setUploadMessage('');
  }, [selectedVenueId]);

  const visibleVenues = venues.filter((venue) => {
    const query = deferredVenueSearch.trim().toLocaleLowerCase('he-IL');
    if (!query) return true;

    const haystack = [venue.nameHe, venue.nameEn, venue.cityHe, venue.cityEn, venue.countryHe, venue.countryEn]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('he-IL');

    return haystack.includes(query);
  });

  const visibleTeams = teams.filter((team) => {
    const query = deferredTeamSearch.trim().toLocaleLowerCase('he-IL');
    if (!query) return true;

    const haystack = [team.nameHe, team.nameEn, team.season.name]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('he-IL');

    return haystack.includes(query);
  });

  function toggleLinkedTeam(teamId: string) {
    setForm((current) => ({
      ...current,
      linkedTeamIds: current.linkedTeamIds.includes(teamId)
        ? current.linkedTeamIds.filter((value) => value !== teamId)
        : [...current.linkedTeamIds, teamId],
    }));
  }

  async function saveVenue() {
    if (!form.id) return;

    setSaving(true);
    setSaveMessage('');

    const response = await fetch('/api/venues', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const payload = await response.json();
    setSaving(false);
    setSaveMessage(response.ok ? 'פרטי האצטדיון נשמרו.' : payload.error || 'שמירת האצטדיון נכשלה.');

    if (response.ok) {
      router.refresh();
    }
  }

  async function createVenue() {
    setCreateSaving(true);
    setCreateMessage('');

    const response = await fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });

    const payload = await response.json();
    setCreateSaving(false);
    setCreateMessage(response.ok ? 'האצטדיון נוצר בהצלחה.' : payload.error || 'יצירת האצטדיון נכשלה.');

    if (response.ok) {
      setCreateForm(buildCreateForm());
      setSelectedVenueId(payload.id);
      router.refresh();
    }
  }

  async function uploadVenueImage(makePrimary: boolean) {
    if (!selectedVenue || !uploadFile) {
      setUploadMessage('יש לבחור קובץ תמונה לפני ההעלאה.');
      return;
    }

    setUploadSaving(true);
    setUploadMessage('');

    const formData = new FormData();
    formData.set('entityType', 'venue');
    formData.set('entityId', selectedVenue.id);
    formData.set('title', uploadTitle);
    formData.set('isPrimary', String(makePrimary));
    formData.set('file', uploadFile);

    const response = await fetch('/api/media', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();
    setUploadSaving(false);

    if (!response.ok) {
      setUploadMessage(payload.error || 'העלאת התמונה נכשלה.');
      return;
    }

    setUploadTitle('');
    setUploadFile(null);
    setUploadMessage(makePrimary ? 'התמונה נשמרה כתמונה ראשית.' : 'התמונה נוספה לגלריית האצטדיון.');
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-stone-900">אצטדיונים</h2>
              <p className="mt-1 text-sm text-stone-600">בחירת איצטדיון לעריכה מהירה.</p>
            </div>
            <Link href="/admin" className="text-sm font-bold text-red-800">
              חזרה
            </Link>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-stone-700">חיפוש</span>
            <input
              type="search"
              value={venueSearch}
              onChange={(event) => setVenueSearch(event.target.value)}
              placeholder="שם איצטדיון או עיר"
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
            />
          </label>

          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {visibleVenues.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => setSelectedVenueId(venue.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-right transition ${
                  venue.id === selectedVenueId
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100'
                }`}
              >
                <div className="font-bold">{venue.nameHe || venue.nameEn}</div>
                <div className={`mt-1 text-xs ${venue.id === selectedVenueId ? 'text-white/80' : 'text-stone-500'}`}>
                  {venue.cityHe || venue.cityEn || 'ללא עיר'} • {venue.teams.length} קבוצות בית
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">אצטדיון חדש</h2>
          <p className="mt-2 text-sm text-stone-600">אפשר להוסיף איצטדיון ידני גם בלי להמתין לייבוא.</p>
          <div className="mt-4 grid gap-3">
            <Field label="שם בעברית" value={createForm.nameHe} onChange={(value) => setCreateForm((current) => ({ ...current, nameHe: value }))} />
            <Field label="שם באנגלית" value={createForm.nameEn} onChange={(value) => setCreateForm((current) => ({ ...current, nameEn: value }))} />
            <Field label="עיר בעברית" value={createForm.cityHe} onChange={(value) => setCreateForm((current) => ({ ...current, cityHe: value }))} />
            <Field label="קיבולת" value={createForm.capacity} type="number" onChange={(value) => setCreateForm((current) => ({ ...current, capacity: value }))} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={createVenue}
              disabled={createSaving}
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white disabled:bg-stone-400"
            >
              {createSaving ? 'יוצר...' : 'הוסף איצטדיון'}
            </button>
            {createMessage ? <span className="text-sm text-stone-600">{createMessage}</span> : null}
          </div>
        </section>
      </aside>

      <div className="space-y-6">
        {!selectedVenue ? (
          <section className="rounded-[24px] border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500 shadow-sm">
            אין עדיין אצטדיון נבחר לעריכה.
          </section>
        ) : (
          <>
            <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-stone-900">{selectedVenue.nameHe || selectedVenue.nameEn}</h1>
                  <p className="mt-2 text-sm text-stone-600">עריכת פרטי איצטדיון, שמות בעברית, גלריה ושיוך קבוצות בית.</p>
                </div>
                <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                  API: {selectedVenue.apiFootballId || 'ידני'}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="שם האצטדיון בעברית" value={form.nameHe} onChange={(value) => setForm((current) => ({ ...current, nameHe: value }))} />
                <Field label="שם האצטדיון באנגלית" value={form.nameEn} onChange={(value) => setForm((current) => ({ ...current, nameEn: value }))} />
                <Field label="עיר בעברית" value={form.cityHe} onChange={(value) => setForm((current) => ({ ...current, cityHe: value }))} />
                <Field label="עיר באנגלית" value={form.cityEn} onChange={(value) => setForm((current) => ({ ...current, cityEn: value }))} />
                <Field label="מדינה בעברית" value={form.countryHe} onChange={(value) => setForm((current) => ({ ...current, countryHe: value }))} />
                <Field label="מדינה באנגלית" value={form.countryEn} onChange={(value) => setForm((current) => ({ ...current, countryEn: value }))} />
                <Field label="כתובת בעברית" value={form.addressHe} onChange={(value) => setForm((current) => ({ ...current, addressHe: value }))} />
                <Field label="כתובת באנגלית" value={form.addressEn} onChange={(value) => setForm((current) => ({ ...current, addressEn: value }))} />
                <Field label="קיבולת" value={form.capacity} type="number" onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
                <Field label="משטח" value={form.surface} onChange={(value) => setForm((current) => ({ ...current, surface: value }))} />
                <Field label="שנת פתיחה" value={form.openedYear} type="number" onChange={(value) => setForm((current) => ({ ...current, openedYear: value }))} />
                <Field label="תמונה ראשית / URL" value={form.imageUrl} onChange={(value) => setForm((current) => ({ ...current, imageUrl: value }))} />
                <div className="md:col-span-2">
                  <Field label="קישור מפה" value={form.mapUrl} onChange={(value) => setForm((current) => ({ ...current, mapUrl: value }))} />
                </div>
                <TextArea label="תיאור בעברית" value={form.descriptionHe} onChange={(value) => setForm((current) => ({ ...current, descriptionHe: value }))} />
                <TextArea label="Description (EN)" value={form.descriptionEn} onChange={(value) => setForm((current) => ({ ...current, descriptionEn: value }))} />
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveVenue}
                  disabled={saving}
                  className="rounded-full bg-stone-900 px-5 py-3 font-bold text-white disabled:bg-stone-400"
                >
                  {saving ? 'שומר...' : 'שמור איצטדיון'}
                </button>
                {saveMessage ? <span className="text-sm text-stone-600">{saveMessage}</span> : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-stone-900">קבוצות בית</h2>
                  <p className="mt-2 text-sm text-stone-600">ניתן לשייך כמה קבוצות בית לאותו איצטדיון, גם מכמה עונות.</p>
                </div>
                <label className="block w-full max-w-sm">
                  <span className="mb-2 block text-sm font-bold text-stone-700">חיפוש קבוצה</span>
                  <input
                    type="search"
                    value={teamSearch}
                    onChange={(event) => setTeamSearch(event.target.value)}
                    placeholder="שם קבוצה או עונה"
                    className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
                  />
                </label>
              </div>

              <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {visibleTeams.map((team) => {
                    const checked = form.linkedTeamIds.includes(team.id);
                    return (
                      <label
                        key={team.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
                          checked ? 'border-stone-900 bg-white' : 'border-stone-200 bg-white/80'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-stone-900">{team.nameHe || team.nameEn}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {team.nameEn} • {team.season.name}
                            {team.venueId && team.venueId !== selectedVenue.id ? ' • משויך לאצטדיון אחר' : ''}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLinkedTeam(team.id)}
                          className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-stone-900">תמונות אצטדיון</h2>
              <p className="mt-2 text-sm text-stone-600">אפשר להעלות תמונה ראשית או להוסיף תמונות נוספות לגלריה.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
                <Field label="כותרת לתמונה" value={uploadTitle} onChange={setUploadTitle} />
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-stone-700">קובץ תמונה</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => uploadVenueImage(true)}
                  disabled={uploadSaving}
                  className="self-end rounded-full bg-stone-900 px-5 py-3 font-bold text-white disabled:bg-stone-400"
                >
                  תמונה ראשית
                </button>
                <button
                  type="button"
                  onClick={() => uploadVenueImage(false)}
                  disabled={uploadSaving}
                  className="self-end rounded-full border border-stone-300 bg-white px-5 py-3 font-bold text-stone-800 disabled:bg-stone-100"
                >
                  הוסף לגלריה
                </button>
              </div>

              {uploadMessage ? <div className="mt-3 text-sm text-stone-600">{uploadMessage}</div> : null}

              <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                {selectedVenue.uploads.map((upload) => (
                  <div key={upload.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                    <img src={upload.filePath} alt={upload.title || selectedVenue.nameEn} className="h-36 w-full object-cover" />
                    <div className="p-3 text-xs text-stone-600">
                      <div className="font-semibold text-stone-900">{upload.title || 'ללא כותרת'}</div>
                      <div className="mt-1 break-all">{upload.filePath}</div>
                      {upload.isPrimary ? <div className="mt-2 font-bold text-red-700">תמונה ראשית</div> : null}
                    </div>
                  </div>
                ))}

                {selectedVenue.uploads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
                    עדיין לא הועלו תמונות לאצטדיון הזה.
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
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
        className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
      />
    </label>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[120px] w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
      />
    </label>
  );
}
