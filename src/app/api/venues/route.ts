import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function normalizeOptionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeOptionalInt(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get('venueId');
  const query = searchParams.get('q')?.trim();

  if (venueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
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
    });

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json(venue);
  }

  const venues = await prisma.venue.findMany({
    where: query
      ? {
          OR: [
            { nameHe: { contains: query, mode: 'insensitive' } },
            { nameEn: { contains: query, mode: 'insensitive' } },
            { cityHe: { contains: query, mode: 'insensitive' } },
            { cityEn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
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
  });

  return NextResponse.json(venues);
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const nameEn = normalizeOptionalString(body.nameEn);
  const nameHe = normalizeOptionalString(body.nameHe);
  const linkedTeamIds = normalizeStringArray(body.linkedTeamIds);

  if (!nameEn || !nameHe) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const venue = await prisma.venue.create({
      data: {
        nameEn,
        nameHe,
        addressEn: normalizeOptionalString(body.addressEn),
        addressHe: normalizeOptionalString(body.addressHe),
        cityEn: normalizeOptionalString(body.cityEn),
        cityHe: normalizeOptionalString(body.cityHe),
        countryEn: normalizeOptionalString(body.countryEn),
        countryHe: normalizeOptionalString(body.countryHe),
        capacity: normalizeOptionalInt(body.capacity),
        surface: normalizeOptionalString(body.surface),
        imageUrl: normalizeOptionalString(body.imageUrl),
        additionalInfo: {
          descriptionHe: normalizeOptionalString(body.descriptionHe),
          descriptionEn: normalizeOptionalString(body.descriptionEn),
          openedYear: normalizeOptionalInt(body.openedYear),
          mapUrl: normalizeOptionalString(body.mapUrl),
        },
      },
      include: {
        uploads: true,
        teams: {
          include: {
            season: true,
          },
        },
      },
    });

    if (linkedTeamIds.length > 0) {
      await prisma.team.updateMany({
        where: { id: { in: linkedTeamIds } },
        data: { venueId: venue.id },
      });
    }

    const refreshed = await prisma.venue.findUnique({
      where: { id: venue.id },
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
    });

    return NextResponse.json(refreshed || venue, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create venue' },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const id = normalizeOptionalString(body.id);

  if (!id) {
    return NextResponse.json({ error: 'Venue ID is required' }, { status: 400 });
  }

  try {
    const existingVenue = await prisma.venue.findUnique({
      where: { id },
      select: {
        additionalInfo: true,
      },
    });

    if (!existingVenue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const linkedTeamIds = normalizeStringArray(body.linkedTeamIds);
    const currentLinkedTeams = await prisma.team.findMany({
      where: { venueId: id },
      select: { id: true },
    });
    const currentLinkedTeamIds = currentLinkedTeams.map((team) => team.id);
    const idsToDetach = currentLinkedTeamIds.filter((teamId) => !linkedTeamIds.includes(teamId));

    await prisma.venue.update({
      where: { id },
      data: {
        ...(body.nameEn !== undefined && { nameEn: normalizeOptionalString(body.nameEn) || '' }),
        ...(body.nameHe !== undefined && { nameHe: normalizeOptionalString(body.nameHe) || '' }),
        ...(body.addressEn !== undefined && { addressEn: normalizeOptionalString(body.addressEn) }),
        ...(body.addressHe !== undefined && { addressHe: normalizeOptionalString(body.addressHe) }),
        ...(body.cityEn !== undefined && { cityEn: normalizeOptionalString(body.cityEn) }),
        ...(body.cityHe !== undefined && { cityHe: normalizeOptionalString(body.cityHe) }),
        ...(body.countryEn !== undefined && { countryEn: normalizeOptionalString(body.countryEn) }),
        ...(body.countryHe !== undefined && { countryHe: normalizeOptionalString(body.countryHe) }),
        ...(body.capacity !== undefined && { capacity: normalizeOptionalInt(body.capacity) }),
        ...(body.surface !== undefined && { surface: normalizeOptionalString(body.surface) }),
        ...(body.imageUrl !== undefined && { imageUrl: normalizeOptionalString(body.imageUrl) }),
        additionalInfo: {
          ...((existingVenue.additionalInfo as Record<string, unknown> | null) || {}),
          ...(body.descriptionHe !== undefined && { descriptionHe: normalizeOptionalString(body.descriptionHe) }),
          ...(body.descriptionEn !== undefined && { descriptionEn: normalizeOptionalString(body.descriptionEn) }),
          ...(body.openedYear !== undefined && { openedYear: normalizeOptionalInt(body.openedYear) }),
          ...(body.mapUrl !== undefined && { mapUrl: normalizeOptionalString(body.mapUrl) }),
        },
      },
    });

    if (idsToDetach.length > 0) {
      await prisma.team.updateMany({
        where: { id: { in: idsToDetach } },
        data: { venueId: null },
      });
    }

    if (linkedTeamIds.length > 0) {
      await prisma.team.updateMany({
        where: { id: { in: linkedTeamIds } },
        data: { venueId: id },
      });
    }

    const refreshed = await prisma.venue.findUnique({
      where: { id },
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
    });

    return NextResponse.json(refreshed);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update venue' },
      { status: 400 }
    );
  }
}
