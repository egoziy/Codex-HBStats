import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminVenueEditorClient from '@/components/AdminVenueEditorClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: {
    venueId?: string;
  };
};

export default async function AdminVenuesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל כדי לערוך אצטדיונים.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              להתחברות
            </Link>
            <Link href="/admin" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">
              חזרה לאדמין
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [venues, teams] = await Promise.all([
    prisma.venue.findMany({
      include: {
        uploads: {
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        teams: {
          include: {
            season: true,
          },
          orderBy: [{ season: { year: 'desc' } }, { nameHe: 'asc' }, { nameEn: 'asc' }],
        },
      },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
    prisma.team.findMany({
      include: {
        season: true,
      },
      orderBy: [{ season: { year: 'desc' } }, { nameHe: 'asc' }, { nameEn: 'asc' }],
    }),
  ]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link href="/admin" className="text-sm font-bold text-red-800">
            חזרה לאדמין
          </Link>
          <h1 className="mt-2 text-4xl font-black text-stone-900">ניהול אצטדיונים</h1>
          <p className="mt-2 text-sm text-stone-600">
            עריכת שמות בעברית, פרטי מיקום, קיבולת, משטח, קבוצות בית וגלריית תמונות.
          </p>
        </div>

        <AdminVenueEditorClient
          venues={venues.map((venue) => ({
            id: venue.id,
            apiFootballId: venue.apiFootballId,
            nameHe: venue.nameHe,
            nameEn: venue.nameEn,
            addressHe: venue.addressHe,
            addressEn: venue.addressEn,
            cityHe: venue.cityHe,
            cityEn: venue.cityEn,
            countryHe: venue.countryHe,
            countryEn: venue.countryEn,
            capacity: venue.capacity,
            surface: venue.surface,
            imageUrl: venue.imageUrl,
            additionalInfo:
              venue.additionalInfo && typeof venue.additionalInfo === 'object' && !Array.isArray(venue.additionalInfo)
                ? {
                    descriptionHe:
                      typeof venue.additionalInfo.descriptionHe === 'string' ? venue.additionalInfo.descriptionHe : null,
                    descriptionEn:
                      typeof venue.additionalInfo.descriptionEn === 'string' ? venue.additionalInfo.descriptionEn : null,
                    openedYear:
                      typeof venue.additionalInfo.openedYear === 'number' ? venue.additionalInfo.openedYear : null,
                    mapUrl: typeof venue.additionalInfo.mapUrl === 'string' ? venue.additionalInfo.mapUrl : null,
                  }
                : null,
            uploads: venue.uploads.map((upload) => ({
              id: upload.id,
              filePath: upload.filePath,
              title: upload.title,
              isPrimary: upload.isPrimary,
            })),
            teams: venue.teams.map((team) => ({
              id: team.id,
              nameHe: team.nameHe,
              nameEn: team.nameEn,
              season: {
                id: team.season.id,
                name: team.season.name,
                year: team.season.year,
              },
            })),
          }))}
          teams={teams.map((team) => ({
            id: team.id,
            nameHe: team.nameHe,
            nameEn: team.nameEn,
            venueId: team.venueId,
            season: {
              id: team.season.id,
              name: team.season.name,
              year: team.season.year,
            },
          }))}
          initialVenueId={searchParams?.venueId || venues[0]?.id || null}
        />
      </div>
    </div>
  );
}
