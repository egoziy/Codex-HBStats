import { ActivityEntityType } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function logActivity(input: {
  entityType: ActivityEntityType;
  entityId: string;
  actionHe: string;
  userId?: string | null;
  gameId?: string | null;
  details?: unknown;
}) {
  await prisma.activityLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      actionHe: input.actionHe,
      userId: input.userId || null,
      gameId: input.gameId || null,
      details: input.details as any,
    },
  });
}
