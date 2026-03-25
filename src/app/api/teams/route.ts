import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');

  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { players: true, season: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    return NextResponse.json(team);
  }

  if (!seasonId) {
    return NextResponse.json(
      { error: 'seasonId or teamId is required' },
      { status: 400 }
    );
  }

  const teams = await prisma.team.findMany({
    where: { seasonId },
    include: { players: true },
  });

  return NextResponse.json(teams);
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { nameEn, nameHe, seasonId, coach, logoUrl } = body;

  if (!nameEn || !nameHe || !seasonId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const team = await prisma.team.create({
      data: {
        nameEn,
        nameHe,
        seasonId,
        coach: coach || null,
        logoUrl: logoUrl || null,
      },
    });

    // Create team statistics
    await prisma.teamStatistics.create({
      data: { teamId: team.id },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create team', details: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const {
    id,
    nameEn,
    nameHe,
    shortNameEn,
    shortNameHe,
    coach,
    coachHe,
    logoUrl,
    countryHe,
    cityHe,
    stadiumHe,
    notesHe,
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Team ID is required' },
      { status: 400 }
    );
  }

  try {
    const existingTeam = await prisma.team.findUnique({
      where: { id },
      select: { additionalInfo: true, apiFootballId: true, nameEn: true },
    });

    if (!existingTeam) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const familyWhere = existingTeam.apiFootballId
      ? { apiFootballId: existingTeam.apiFootballId }
      : { nameEn: existingTeam.nameEn };

    if (nameHe !== undefined || shortNameHe !== undefined) {
      await prisma.team.updateMany({
        where: familyWhere,
        data: {
          ...(nameHe !== undefined && { nameHe }),
          ...(shortNameHe !== undefined && { shortNameHe: shortNameHe || null }),
        },
      });
    }

    const team = await prisma.team.update({
      where: { id },
      data: {
        ...(nameEn && { nameEn }),
        ...(shortNameEn !== undefined && { shortNameEn: shortNameEn || null }),
        ...(coach !== undefined && { coach }),
        ...(coachHe !== undefined && { coachHe: coachHe || null }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(countryHe !== undefined && { countryHe: countryHe || null }),
        ...(cityHe !== undefined && { cityHe: cityHe || null }),
        ...(stadiumHe !== undefined && { stadiumHe: stadiumHe || null }),
        ...(notesHe !== undefined && {
          additionalInfo: {
            ...((existingTeam?.additionalInfo as Record<string, unknown> | null) || {}),
            notesHe: notesHe || null,
          },
        }),
      },
    });

    return NextResponse.json(team);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update team', details: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Team ID is required' },
      { status: 400 }
    );
  }

  try {
    await prisma.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete team', details: error.message },
      { status: 400 }
    );
  }
}
