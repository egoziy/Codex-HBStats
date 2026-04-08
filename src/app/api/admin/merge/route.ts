import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { previewMerge, executeMerge, rollbackMerge } from '@/lib/merge-engine';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  try {
    // Preview what would change
    if (action === 'preview') {
      const source = body?.source || 'sport5';
      const mergeType = body?.mergeType || 'players';
      const season = body?.season || undefined;
      const preview = await previewMerge(source, mergeType, { season });

      const merge = await prisma.mergeOperation.create({
        data: {
          source,
          mergeType,
          status: 'preview',
          description: `${source} / ${mergeType}${season ? ' / ' + season : ''}: ${preview.summary.updates} עדכונים, ${preview.summary.creates} חדשים, ${preview.summary.skips} דולגו`,
          previewJson: preview as any,
          recordsMatched: preview.summary.updates + preview.summary.creates + preview.summary.skips,
          recordsSkipped: preview.summary.skips,
          userId: auth.id,
        },
      });

      return NextResponse.json({
        success: true,
        mergeId: merge.id,
        preview: preview.summary,
        changes: preview.changes.filter((c) => c.type === 'update' || c.type === 'create').slice(0, 100),
      });
    }

    // Approve a preview
    if (action === 'approve') {
      const mergeId = body?.mergeId;
      if (!mergeId) return NextResponse.json({ error: 'mergeId required' }, { status: 400 });

      const merge = await prisma.mergeOperation.findUnique({ where: { id: mergeId } });
      if (!merge || merge.status !== 'preview') {
        return NextResponse.json({ error: 'Merge must be in preview status' }, { status: 400 });
      }

      await prisma.mergeOperation.update({
        where: { id: mergeId },
        data: { status: 'approved', approvedAt: new Date() },
      });

      return NextResponse.json({ success: true, status: 'approved' });
    }

    // Execute an approved merge
    if (action === 'execute') {
      const mergeId = body?.mergeId;
      if (!mergeId) return NextResponse.json({ error: 'mergeId required' }, { status: 400 });

      const result = await executeMerge(mergeId);
      return NextResponse.json({ success: true, ...result });
    }

    // Rollback an executed merge
    if (action === 'rollback') {
      const mergeId = body?.mergeId;
      if (!mergeId) return NextResponse.json({ error: 'mergeId required' }, { status: 400 });

      const result = await rollbackMerge(mergeId);
      return NextResponse.json({ success: true, ...result });
    }

    // Delete a merge (only preview/rolled_back)
    if (action === 'delete') {
      const mergeId = body?.mergeId;
      if (!mergeId) return NextResponse.json({ error: 'mergeId required' }, { status: 400 });

      const merge = await prisma.mergeOperation.findUnique({ where: { id: mergeId } });
      if (!merge) return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
      if (merge.status === 'executed') {
        return NextResponse.json({ error: 'Cannot delete executed merge — rollback first' }, { status: 400 });
      }

      await prisma.mergeOperation.delete({ where: { id: mergeId } });
      return NextResponse.json({ success: true });
    }

    // List all merge operations
    if (action === 'list') {
      const merges = await prisma.mergeOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true } } },
      });
      return NextResponse.json({ merges });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
