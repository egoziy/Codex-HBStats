'use client';

import Link from 'next/link';
import { useState } from 'react';
import ApiFetchForm from '@/components/ApiFetchForm';

type TeamGroup = {
  key: string;
  displayNameHe: string | null;
  displayNameEn: string;
  logoUrl: string | null;
  seasons: string[];
  latestSeasonYear: number;
};

type FetchJob = {
  id: string;
  labelHe: string;
  status: string;
  progressPercent: number;
  createdAt: Date | string;
};

type FetchTeam = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  logoUrl: string | null;
};

type Season = {
  id: string;
  year: number;
  name: string;
};

export default function AdminManagerClient({
  teams,
  fetchTeams,
  fetchJobs,
  seasons,
}: {
  teams: TeamGroup[];
  fetchTeams: FetchTeam[];
  fetchJobs: FetchJob[];
  seasons: Season[];
}) {
  const [openSection, setOpenSection] = useState<'fetch' | 'teams' | 'jobs'>('fetch');

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] p-8 text-white shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
        <h1 className="text-3xl font-black md:text-4xl">אזור אדמין</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 md:text-base">
          מכאן אפשר למשוך נתונים, לנהל קבוצות ושחקנים, ולעבור לדפי עריכה לפי עונה.
        </p>
      </section>

      <Accordion
        title="משיכת נתונים"
        open={openSection === 'fetch'}
        onToggle={() => setOpenSection(openSection === 'fetch' ? 'teams' : 'fetch')}
      >
        <ApiFetchForm teams={fetchTeams} />
      </Accordion>

      <Accordion
        title="קבוצות במערכת"
        open={openSection === 'teams'}
        onToggle={() => setOpenSection(openSection === 'teams' ? 'jobs' : 'teams')}
      >
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          כל קבוצה מוצגת פעם אחת בלבד. לחיצה על קבוצה תוביל למיני-סייט עריכה שבו בוחרים עונה ומנהלים
          את פרטי הקבוצה והשחקנים.
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.key}
              href={`/admin/teams/${team.key}`}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-red-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    alt={team.displayNameHe || team.displayNameEn}
                    className="h-12 w-12 rounded-full border border-stone-200 bg-white object-contain p-1"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate font-bold text-stone-900">{team.displayNameHe || team.displayNameEn}</div>
                  <div className="truncate text-sm text-stone-500">{team.displayNameEn}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {team.seasons.slice(0, 4).map((season) => (
                  <span key={season} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                    {season}
                  </span>
                ))}
                {team.seasons.length > 4 ? (
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                    +{team.seasons.length - 4}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
          {teams.length === 0 ? <EmptyAdminState text="עדיין אין קבוצות שנשמרו במערכת." /> : null}
        </div>
      </Accordion>

      <Accordion
        title="עבודות משיכה אחרונות"
        open={openSection === 'jobs'}
        onToggle={() => setOpenSection(openSection === 'jobs' ? 'fetch' : 'jobs')}
      >
        <div className="mb-4 text-sm text-stone-500">עונות זמינות במערכת: {seasons.map((season) => season.name).join(', ')}</div>
        <div className="space-y-3">
          {fetchJobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-stone-900">{job.labelHe}</div>
                  <div className="text-xs text-stone-500">
                    {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(
                      new Date(job.createdAt)
                    )}
                  </div>
                </div>
                <div className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-700">
                  {job.status} | {job.progressPercent}%
                </div>
              </div>
            </article>
          ))}
          {fetchJobs.length === 0 ? <EmptyAdminState text="עדיין אין עבודות משיכה שמורות." /> : null}
        </div>
      </Accordion>
    </div>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-right"
      >
        <span className="text-xl font-black text-stone-900">{title}</span>
        <span className="text-2xl font-bold text-stone-500">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function EmptyAdminState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
