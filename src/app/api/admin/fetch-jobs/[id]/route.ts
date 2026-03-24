import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'אין הרשאה.' }, { status: 403 });
  }

  const job = await prisma.fetchJob.findUnique({
    where: { id: params.id },
  });

  if (!job) {
    return NextResponse.json({ error: 'העבודה לא נמצאה.' }, { status: 404 });
  }

  return NextResponse.json(job);
}
