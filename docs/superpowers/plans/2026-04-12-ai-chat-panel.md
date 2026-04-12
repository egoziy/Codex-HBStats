# AI Chat Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating AI chat panel that lets registered users ask questions about Israeli football data and get answers powered by Claude or OpenAI via function calling.

**Architecture:** A client-side `AiChat` component (FAB + panel) sends messages to `POST /api/ai/chat`. The API route checks auth, loads AI provider settings from `SiteSetting`, sends the conversation to the configured AI with 5 tool definitions, executes any tool calls via Prisma queries, and returns the final response. Admin configures provider/keys in `/admin`.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, `@anthropic-ai/sdk`, `openai`, Tailwind CSS, Lucide React icons.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/ai-tools.ts` | Create | 5 data-fetching functions (Prisma queries) |
| `src/lib/ai-providers.ts` | Create | Claude + OpenAI provider abstraction with tool calling |
| `src/lib/ai-settings.ts` | Create | Read/write AI settings from SiteSetting |
| `src/app/api/ai/chat/route.ts` | Create | POST endpoint — auth, rate limit, orchestrate AI call |
| `src/components/AiChat.tsx` | Create | Client component — FAB button + chat panel + state |
| `src/app/layout.tsx` | Modify | Import and render `<AiChat />` |
| `src/app/api/admin/ai-settings/route.ts` | Create | GET/PUT admin endpoint for AI config |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install AI SDK packages**

```bash
npm install @anthropic-ai/sdk openai
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@anthropic-ai/sdk'); require('openai'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @anthropic-ai/sdk and openai packages"
```

---

### Task 2: AI Settings Layer

**Files:**
- Create: `src/lib/ai-settings.ts`

- [ ] **Step 1: Create AI settings module**

```typescript
import prisma from '@/lib/prisma';

export const AI_ENABLED_KEY = 'ai_enabled';
export const AI_PROVIDER_KEY = 'ai_provider';
export const AI_API_KEY_CLAUDE = 'ai_api_key_claude';
export const AI_API_KEY_OPENAI = 'ai_api_key_openai';

export type AiProvider = 'claude' | 'openai';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  apiKeyClaude: string;
  apiKeyOpenai: string;
}

async function getSetting(key: string): Promise<unknown> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.valueJson ?? null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const [enabled, provider, keyClaude, keyOpenai] = await Promise.all([
    getSetting(AI_ENABLED_KEY),
    getSetting(AI_PROVIDER_KEY),
    getSetting(AI_API_KEY_CLAUDE),
    getSetting(AI_API_KEY_OPENAI),
  ]);

  return {
    enabled: enabled === true,
    provider: provider === 'openai' ? 'openai' : 'claude',
    apiKeyClaude: typeof keyClaude === 'string' ? keyClaude : '',
    apiKeyOpenai: typeof keyOpenai === 'string' ? keyOpenai : '',
  };
}

export async function getActiveApiKey(settings: AiSettings): Promise<string | null> {
  if (!settings.enabled) return null;
  const key = settings.provider === 'openai' ? settings.apiKeyOpenai : settings.apiKeyClaude;
  return key || null;
}

export async function updateAiSetting(key: string, value: unknown): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { valueJson: value as any },
    create: { key, valueJson: value as any },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-settings.ts
git commit -m "feat(ai): add AI settings read/write layer"
```

---

### Task 3: AI Tool Functions (Prisma Queries)

**Files:**
- Create: `src/lib/ai-tools.ts`

- [ ] **Step 1: Create the 5 tool functions**

```typescript
import prisma from '@/lib/prisma';

// ─── Tool Definitions (for AI provider) ───

export const toolDefinitions = [
  {
    name: 'searchPlayers',
    description: 'Search for players by name (Hebrew or English). Returns player id, name, team, position, season.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name to search (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Optional season year to filter (e.g. 2025)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPlayerEvents',
    description: 'Get match events for a player — goals, yellow cards, red cards, substitutions. Returns event type, minute, and match details.',
    parameters: {
      type: 'object' as const,
      properties: {
        playerId: { type: 'string', description: 'Player ID' },
        seasonYear: { type: 'number', description: 'Optional season year filter' },
        eventType: {
          type: 'string',
          description: 'Filter by event type',
          enum: ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION_IN', 'SUBSTITUTION_OUT', 'OWN_GOAL', 'PENALTY_GOAL'],
        },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'searchGames',
    description: 'Search for games by team name, season, or date range. Returns match date, teams, scores, competition.',
    parameters: {
      type: 'object' as const,
      properties: {
        teamName: { type: 'string', description: 'Team name (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Season year' },
        dateFrom: { type: 'string', description: 'Start date (ISO format, e.g. 2025-08-01)' },
        dateTo: { type: 'string', description: 'End date (ISO format)' },
      },
    },
  },
  {
    name: 'getStandings',
    description: 'Get league standings table for a season. Returns position, team, played, wins, draws, losses, goals for/against, points.',
    parameters: {
      type: 'object' as const,
      properties: {
        seasonYear: { type: 'number', description: 'Season year (e.g. 2025)' },
        competitionId: { type: 'string', description: 'Optional competition ID (defaults to Israeli Premier League)' },
      },
      required: ['seasonYear'],
    },
  },
  {
    name: 'getLeaderboard',
    description: 'Get leaderboard — top scorers, assists, yellow cards, red cards, substitutions in/out.',
    parameters: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Leaderboard category',
          enum: ['TOP_SCORERS', 'TOP_ASSISTS', 'TOP_YELLOW_CARDS', 'TOP_RED_CARDS', 'TOP_SUBSTITUTED_IN', 'TOP_SUBSTITUTED_OUT'],
        },
        seasonYear: { type: 'number', description: 'Season year' },
      },
      required: ['category'],
    },
  },
];

// ─── Tool Implementations ───

export async function searchPlayers(args: { name: string; seasonYear?: number }) {
  const where: any = {
    OR: [
      { nameHe: { contains: args.name, mode: 'insensitive' } },
      { nameEn: { contains: args.name, mode: 'insensitive' } },
      { firstNameHe: { contains: args.name, mode: 'insensitive' } },
      { lastNameHe: { contains: args.name, mode: 'insensitive' } },
    ],
  };
  if (args.seasonYear) {
    where.team = { season: { year: args.seasonYear } };
  }

  const players = await prisma.player.findMany({
    where,
    include: {
      team: { select: { nameHe: true, nameEn: true } },
      playerStats: {
        select: { goals: true, assists: true, yellowCards: true, redCards: true, gamesPlayed: true, minutesPlayed: true },
        take: 1,
        orderBy: { season: { year: 'desc' } },
      },
    },
    take: 10,
  });

  return players.map((p) => ({
    id: p.id,
    nameHe: p.nameHe,
    nameEn: p.nameEn,
    position: p.position,
    team: p.team?.nameHe || p.team?.nameEn,
    stats: p.playerStats[0] || null,
  }));
}

export async function getPlayerEvents(args: { playerId: string; seasonYear?: number; eventType?: string }) {
  const where: any = { playerId: args.playerId };
  if (args.eventType) {
    where.type = args.eventType;
  }
  if (args.seasonYear) {
    where.game = { season: { year: args.seasonYear } };
  }

  const events = await prisma.gameEvent.findMany({
    where,
    include: {
      game: {
        select: {
          dateTime: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { nameHe: true } },
          awayTeam: { select: { nameHe: true } },
          competition: { select: { nameHe: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'desc' } },
    take: 50,
  });

  return events.map((e) => ({
    type: e.type,
    minute: e.minute,
    extraMinute: e.extraMinute,
    date: e.game.dateTime.toISOString().split('T')[0],
    match: `${e.game.homeTeam.nameHe} ${e.game.homeScore ?? '?'}-${e.game.awayScore ?? '?'} ${e.game.awayTeam.nameHe}`,
    competition: e.game.competition?.nameHe || '',
  }));
}

export async function searchGames(args: { teamName?: string; seasonYear?: number; dateFrom?: string; dateTo?: string }) {
  const where: any = {};

  if (args.teamName) {
    where.OR = [
      { homeTeam: { OR: [{ nameHe: { contains: args.teamName, mode: 'insensitive' } }, { nameEn: { contains: args.teamName, mode: 'insensitive' } }] } },
      { awayTeam: { OR: [{ nameHe: { contains: args.teamName, mode: 'insensitive' } }, { nameEn: { contains: args.teamName, mode: 'insensitive' } }] } },
    ];
  }
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }
  if (args.dateFrom || args.dateTo) {
    where.dateTime = {};
    if (args.dateFrom) where.dateTime.gte = new Date(args.dateFrom);
    if (args.dateTo) where.dateTime.lte = new Date(args.dateTo);
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      competition: { select: { nameHe: true } },
      season: { select: { year: true } },
    },
    orderBy: { dateTime: 'desc' },
    take: 20,
  });

  return games.map((g) => ({
    id: g.id,
    date: g.dateTime.toISOString().split('T')[0],
    homeTeam: g.homeTeam.nameHe,
    awayTeam: g.awayTeam.nameHe,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    competition: g.competition?.nameHe || '',
    season: g.season.year,
  }));
}

export async function getStandings(args: { seasonYear: number; competitionId?: string }) {
  const where: any = { season: { year: args.seasonYear } };
  if (args.competitionId) {
    where.competitionId = args.competitionId;
  }

  const standings = await prisma.standing.findMany({
    where,
    include: { team: { select: { nameHe: true } } },
    orderBy: { position: 'asc' },
    take: 30,
  });

  return standings.map((s) => ({
    position: s.position,
    team: s.team.nameHe,
    played: s.played,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalsDiff: s.goalsDiff,
    points: s.points,
  }));
}

export async function getLeaderboard(args: { category: string; seasonYear?: number }) {
  const where: any = { category: args.category as any };
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }

  const entries = await prisma.competitionLeaderboardEntry.findMany({
    where,
    include: {
      season: { select: { year: true } },
    },
    orderBy: { rank: 'asc' },
    take: 20,
  });

  return entries.map((e) => ({
    rank: e.rank,
    playerName: e.playerNameHe || e.playerNameEn,
    teamName: e.teamNameHe || e.teamNameEn,
    value: e.value,
    gamesPlayed: e.gamesPlayed,
    season: e.season.year,
  }));
}

// ─── Tool Dispatcher ───

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'searchPlayers':
      return searchPlayers(args as any);
    case 'getPlayerEvents':
      return getPlayerEvents(args as any);
    case 'searchGames':
      return searchGames(args as any);
    case 'getStandings':
      return getStandings(args as any);
    case 'getLeaderboard':
      return getLeaderboard(args as any);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-tools.ts
git commit -m "feat(ai): add 5 data tool functions for AI chat"
```

---

### Task 4: AI Provider Abstraction

**Files:**
- Create: `src/lib/ai-providers.ts`

- [ ] **Step 1: Create the provider module**

This module takes a conversation + tool definitions and runs a full tool-calling loop with either Claude or OpenAI, returning the final text response.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { toolDefinitions, executeTool } from '@/lib/ai-tools';

const SYSTEM_PROMPT = `אתה עוזר סטטיסטיקות כדורגל ישראלי. התפקיד שלך לענות על שאלות על שחקנים, קבוצות, משחקים, טבלאות וסטטיסטיקות מהכדורגל הישראלי.

כללים:
- ענה רק על שאלות הקשורות לנתוני כדורגל ישראלי
- השתמש ב-tools כדי לשלוף נתונים לפני שאתה עונה — אל תמציא מידע
- ענה בעברית תמיד
- אם אין נתונים מתאימים — אמור בכנות שאין מידע במערכת
- תן תשובות קצרות וברורות
- אם השאלה לא קשורה לכדורגל ישראלי, הסבר בנימוס שאתה יכול לעזור רק בנושאי כדורגל`;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const MAX_TOOL_ROUNDS = 5;

// ─── Claude ───

export async function chatWithClaude(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const client = new Anthropic({ apiKey });

  const anthropicTools: Anthropic.Tool[] = toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));

  let anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock ? textBlock.text : 'לא הצלחתי לייצר תשובה.';
    }

    if (response.stop_reason === 'tool_use') {
      anthropicMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason
    const fallback = response.content.find((b) => b.type === 'text');
    return fallback ? fallback.text : 'לא הצלחתי לייצר תשובה.';
  }

  return 'השאילתה מורכבת מדי. נסה לפשט את השאלה.';
}

// ─── OpenAI ───

export async function chatWithOpenAI(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey });

  const openaiTools: OpenAI.ChatCompletionTool[] = toolDefinitions.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      tools: openaiTools,
      messages: openaiMessages,
    });

    const choice = response.choices[0];
    if (!choice) return 'לא הצלחתי לייצר תשובה.';

    const msg = choice.message;

    if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
      return msg.content || 'לא הצלחתי לייצר תשובה.';
    }

    // Tool calls
    openaiMessages.push(msg);
    for (const toolCall of msg.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await executeTool(toolCall.function.name, args);
      openaiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return 'השאילתה מורכבת מדי. נסה לפשט את השאלה.';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-providers.ts
git commit -m "feat(ai): add Claude + OpenAI provider abstraction with tool calling loop"
```

---

### Task 5: Chat API Route

**Files:**
- Create: `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Create the POST endpoint**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ai/chat/route.ts
git commit -m "feat(ai): add POST /api/ai/chat endpoint with auth and rate limiting"
```

---

### Task 6: Admin Settings API

**Files:**
- Create: `src/app/api/admin/ai-settings/route.ts`

- [ ] **Step 1: Create the admin API for AI settings**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/ai-settings/route.ts
git commit -m "feat(ai): add admin AI settings GET/PUT endpoint"
```

---

### Task 7: AiChat Client Component

**Files:**
- Create: `src/components/AiChat.tsx`

- [ ] **Step 1: Create the full chat component (FAB + Panel)**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

type Viewer = { id: string; name: string; role: string } | null;

export default function AiChat() {
  const [viewer, setViewer] = useState<Viewer>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch current user
  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => setViewer(d.user || null))
      .catch(() => setViewer(null));
  }, []);

  // Check if AI is enabled (once, when panel opens for the first time)
  useEffect(() => {
    if (isOpen && aiEnabled === null && viewer) {
      fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
      })
        .then((r) => {
          setAiEnabled(r.status !== 503);
        })
        .catch(() => setAiEnabled(false));
    }
  }, [isOpen, aiEnabled, viewer]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Don't render for unauthenticated users
  if (!viewer) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: data.error || 'שגיאה בעיבוד השאלה.' },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'שגיאת רשת. נסה שוב.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-800 to-slate-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        title="עוזר סטטיסטיקות"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 left-5 z-[60] flex h-[500px] w-[380px] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-l from-red-800 to-slate-900 px-4 py-3 text-white">
            <span className="text-sm font-bold">עוזר סטטיסטיקות</span>
            <button onClick={() => setIsOpen(false)} className="rounded p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="mt-8 text-center text-sm text-stone-400">
                שאל אותי על כדורגל ישראלי — שחקנים, משחקים, טבלאות ועוד
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-2 text-stone-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">חושב...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-stone-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="שאל שאלה..."
                rows={1}
                maxLength={500}
                disabled={isLoading}
                className="flex-1 resize-none rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-red-800 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-800 text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AiChat.tsx
git commit -m "feat(ai): add AiChat floating panel component"
```

---

### Task 8: Wire AiChat into Layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add AiChat import and render**

Add the import at the top of `layout.tsx` (after the existing Navbar import on line 3):

```typescript
import AiChat from '@/components/AiChat';
```

Then add `<AiChat />` inside the `<body>` tag, right after `<Navbar />` (after line 18):

```tsx
<AiChat />
```

The full file should look like:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import AiChat from '@/components/AiChat';

export const metadata: Metadata = {
  title: 'ליגת הסטטיסטיקות',
  description: 'מערכת עברית לסטטיסטיקות כדורגל, ניתוח נתונים, משחקים, שחקנים וקבוצות.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-[#f4f6fb] text-slate-950">
        <Navbar />
        <AiChat />
        <div className="border-b border-stone-200 bg-black">
          <div className="mx-auto max-w-7xl px-4 py-4">
            <img
              src="/banner-stats.png"
              alt="הדופק של טרנר במספרים"
              className="h-24 w-full rounded-[24px] border border-white/10 object-cover shadow-[0_18px_40px_rgba(0,0,0,0.28)] md:h-28"
            />
          </div>
        </div>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ai): wire AiChat component into root layout"
```

---

### Task 9: Admin UI — AI Settings Section

**Files:**
- Modify: whichever admin page renders `/admin` settings (to be identified — likely `src/app/admin/page.tsx`)

- [ ] **Step 1: Identify the admin settings page**

```bash
grep -r "הגדרות\|Settings\|SiteSetting" src/app/admin/page.tsx --include="*.tsx" -l
```

- [ ] **Step 2: Add AI settings section to the admin page**

Add a new section to the existing admin dashboard. The exact insertion point depends on the file layout, but the section renders:

```tsx
// AI Settings state (add to component top)
const [aiSettings, setAiSettings] = useState({ enabled: false, provider: 'claude', hasClaudeKey: false, hasOpenaiKey: false });
const [aiKeyInput, setAiKeyInput] = useState({ claude: '', openai: '' });
const [aiSaving, setAiSaving] = useState(false);

// Fetch AI settings on mount (add to useEffect)
useEffect(() => {
  fetch('/api/admin/ai-settings')
    .then((r) => r.json())
    .then((d) => { if (!d.error) setAiSettings(d); })
    .catch(() => {});
}, []);

// Save handler
async function saveAiSettings() {
  setAiSaving(true);
  const payload: any = { enabled: aiSettings.enabled, provider: aiSettings.provider };
  if (aiKeyInput.claude) payload.apiKeyClaude = aiKeyInput.claude;
  if (aiKeyInput.openai) payload.apiKeyOpenai = aiKeyInput.openai;

  const res = await fetch('/api/admin/ai-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    setAiSettings(data);
    setAiKeyInput({ claude: '', openai: '' });
  }
  setAiSaving(false);
}
```

JSX section to render (insert within the admin page's settings area):

```tsx
{/* AI Settings */}
<div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
  <h3 className="mb-3 text-lg font-bold text-stone-800">הגדרות עוזר AI</h3>

  <label className="flex items-center gap-2 mb-3">
    <input
      type="checkbox"
      checked={aiSettings.enabled}
      onChange={(e) => setAiSettings({ ...aiSettings, enabled: e.target.checked })}
      className="h-4 w-4 accent-red-800"
    />
    <span className="text-sm">עוזר AI פעיל</span>
  </label>

  <div className="mb-3">
    <label className="mb-1 block text-sm font-medium text-stone-600">ספק AI</label>
    <select
      value={aiSettings.provider}
      onChange={(e) => setAiSettings({ ...aiSettings, provider: e.target.value })}
      className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm"
    >
      <option value="claude">Claude (Anthropic)</option>
      <option value="openai">ChatGPT (OpenAI)</option>
    </select>
  </div>

  <div className="mb-3">
    <label className="mb-1 block text-sm font-medium text-stone-600">
      מפתח Claude API {aiSettings.hasClaudeKey && <span className="text-green-600">(מוגדר)</span>}
    </label>
    <input
      type="password"
      value={aiKeyInput.claude}
      onChange={(e) => setAiKeyInput({ ...aiKeyInput, claude: e.target.value })}
      placeholder={aiSettings.hasClaudeKey ? '••••••••' : 'sk-ant-...'}
      className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm"
    />
  </div>

  <div className="mb-3">
    <label className="mb-1 block text-sm font-medium text-stone-600">
      מפתח OpenAI API {aiSettings.hasOpenaiKey && <span className="text-green-600">(מוגדר)</span>}
    </label>
    <input
      type="password"
      value={aiKeyInput.openai}
      onChange={(e) => setAiKeyInput({ ...aiKeyInput, openai: e.target.value })}
      placeholder={aiSettings.hasOpenaiKey ? '••••••••' : 'sk-...'}
      className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm"
    />
  </div>

  <button
    onClick={saveAiSettings}
    disabled={aiSaving}
    className="rounded-lg bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
  >
    {aiSaving ? 'שומר...' : 'שמור הגדרות AI'}
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(ai): add AI settings section to admin dashboard"
```

---

### Task 10: Manual Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev -- --port 8011
```

- [ ] **Step 2: Test — unauthenticated user should NOT see FAB**

Open `http://localhost:8011` in an incognito/private window. Verify no floating button appears in the bottom-left corner.

- [ ] **Step 3: Test — logged-in user sees FAB**

Log in as a registered user. Verify the chat FAB button appears in the bottom-left corner.

- [ ] **Step 4: Test — open chat panel**

Click the FAB. Verify the chat panel opens with the welcome message "שאל אותי על כדורגל ישראלי..."

- [ ] **Step 5: Test — admin settings**

Log in as admin. Navigate to `/admin`. Find the AI settings section. Set provider to Claude, paste an API key, enable AI, click save. Verify the green "(מוגדר)" indicator appears.

- [ ] **Step 6: Test — ask a question**

Open the chat panel. Type "מי מלך השערים בעונת 2025?" and press Enter. Verify:
- User message appears on the right
- Loading indicator shows
- AI response appears on the left with real data

- [ ] **Step 7: Test — rate limiting**

Send 11 messages rapidly. Verify the 11th returns an error about too many requests.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(ai): complete AI chat panel with tools, admin settings, and FAB"
```
