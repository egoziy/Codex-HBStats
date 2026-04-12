import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI, type ChatMessage } from '@/lib/ai-providers';

// Rate limiting: 10 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  // Auth check
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'יש להתחבר כדי להשתמש בעוזר' }, { status: 401 });
  }

  // Rate limit
  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד דקה.' }, { status: 429 });
  }

  // Parse body
  const body = await request.json().catch(() => null);
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 });
  }

  // Validate messages
  const messages: ChatMessage[] = body.messages
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20); // Max 20 messages for context

  if (messages.length === 0) {
    return NextResponse.json({ error: 'חסרות הודעות תקינות' }, { status: 400 });
  }

  // Check last message length
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.content.length > 500) {
    return NextResponse.json({ error: 'ההודעה ארוכה מדי (מקסימום 500 תווים)' }, { status: 400 });
  }

  // Load AI settings
  const settings = await getAiSettings();
  const apiKey = await getActiveApiKey(settings);

  if (!apiKey) {
    return NextResponse.json({ error: 'עוזר הAI אינו פעיל כרגע' }, { status: 503 });
  }

  try {
    const reply =
      settings.provider === 'openai'
        ? await chatWithOpenAI(apiKey, messages)
        : await chatWithClaude(apiKey, messages);

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('AI chat error:', err?.message || err);
    return NextResponse.json({ error: 'שגיאה בעיבוד השאלה. נסה שוב.' }, { status: 500 });
  }
}
