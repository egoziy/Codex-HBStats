import { MediaAssetKind } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { storeUploadedImage } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const entityType = String(formData.get('entityType') || '');
  const entityId = String(formData.get('entityId') || '');
  const title = String(formData.get('title') || '').trim();
  const isPrimary = String(formData.get('isPrimary') || '') === 'true';
  const file = formData.get('file');

  if (!entityId || (entityType !== 'team' && entityType !== 'player') || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing upload fields.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }

  if (entityType === 'team') {
    const team = await prisma.team.findUnique({
      where: { id: entityId },
      include: { season: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const filePath = await storeUploadedImage({
      file,
      entityType: 'teams',
      seasonYear: team.season.year,
      folderName: team.nameEn,
      entityId: team.id,
      label: title || team.nameEn,
    });

    const currentCount = await prisma.mediaAsset.count({
      where: { teamId: team.id },
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        kind: MediaAssetKind.TEAM_LOGO,
        title: title || null,
        originalName: file.name,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        isPrimary,
        displayOrder: currentCount,
        teamId: team.id,
      },
    });

    if (isPrimary || !team.logoUrl) {
      await prisma.team.update({
        where: { id: team.id },
        data: { logoUrl: filePath },
      });
    }

    return NextResponse.json({ asset, filePath });
  }

  const player = await prisma.player.findUnique({
    where: { id: entityId },
    include: {
      team: {
        include: { season: true },
      },
    },
  });

  if (!player) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  const filePath = await storeUploadedImage({
    file,
    entityType: 'players',
    seasonYear: player.team.season.year,
    folderName: player.team.nameEn,
    entityId: player.id,
    label: title || player.nameEn,
  });

  const currentCount = await prisma.mediaAsset.count({
    where: { playerId: player.id },
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: MediaAssetKind.PLAYER_PHOTO,
      title: title || null,
      originalName: file.name,
      filePath,
      mimeType: file.type,
      sizeBytes: file.size,
      isPrimary,
      displayOrder: currentCount,
      playerId: player.id,
    },
  });

  if (isPrimary || !player.photoUrl) {
    await prisma.player.update({
      where: { id: player.id },
      data: { photoUrl: filePath },
    });
  }

  return NextResponse.json({ asset, filePath });
}
