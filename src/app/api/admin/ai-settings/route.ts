import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  getAiSettings,
  updateAiSetting,
  AI_ENABLED_KEY,
  AI_PROVIDER_KEY,
  AI_API_KEY_CLAUDE,
  AI_API_KEY_OPENAI,
} from '@/lib/ai-settings';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getAiSettings();
  return NextResponse.json({
    enabled: settings.enabled,
    provider: settings.provider,
    hasClaudeKey: settings.apiKeyClaude.length > 0,
    hasOpenaiKey: settings.apiKeyOpenai.length > 0,
  });
}

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const updates: Promise<void>[] = [];

  if (typeof body.enabled === 'boolean') {
    updates.push(updateAiSetting(AI_ENABLED_KEY, body.enabled));
  }
  if (body.provider === 'claude' || body.provider === 'openai') {
    updates.push(updateAiSetting(AI_PROVIDER_KEY, body.provider));
  }
  if (typeof body.apiKeyClaude === 'string' && body.apiKeyClaude.length > 0) {
    updates.push(updateAiSetting(AI_API_KEY_CLAUDE, body.apiKeyClaude));
  }
  if (typeof body.apiKeyOpenai === 'string' && body.apiKeyOpenai.length > 0) {
    updates.push(updateAiSetting(AI_API_KEY_OPENAI, body.apiKeyOpenai));
  }

  await Promise.all(updates);

  const settings = await getAiSettings();
  return NextResponse.json({
    ok: true,
    enabled: settings.enabled,
    provider: settings.provider,
    hasClaudeKey: settings.apiKeyClaude.length > 0,
    hasOpenaiKey: settings.apiKeyOpenai.length > 0,
  });
}
