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

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
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
      if (toolCall.type !== 'function') continue;
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
