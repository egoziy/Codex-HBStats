export type TelegramChannelMessage = {
  id: string;
  text: string;
  url: string;
  publishedAt: Date | null;
  imageUrl?: string | null;
};

const TELEGRAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(input: string) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

function extractMessageText(chunk: string) {
  const textMatch =
    chunk.match(/<div class="tgme_widget_message_text[^"]*"[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    chunk.match(/<div class="tgme_widget_message_caption[^"]*"[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i);

  if (!textMatch) return '';
  return stripHtml(textMatch[1]);
}

function extractMessageUrl(chunk: string) {
  return chunk.match(/<a class="tgme_widget_message_date" href="([^"]+)"/i)?.[1] || null;
}

function extractPublishedAt(chunk: string) {
  const raw = chunk.match(/<time datetime="([^"]+)"/i)?.[1] || null;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTelegramMediaUrl(value: string | null | undefined) {
  const decoded = decodeHtmlEntities((value || '').trim());
  if (!decoded) return null;
  if (decoded.startsWith('//')) return `https:${decoded}`;
  return decoded;
}

function extractImageUrl(chunk: string) {
  const candidates = [
    chunk.match(/tgme_widget_message_photo_wrap[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_photo[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_grouped_layer[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_video_thumb[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_video_player[^>]*poster="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_photo_wrap[^>]*data-content-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_photo_wrap[^>]*data-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*data-content-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*data-cover="([^"]+)"/i)?.[1],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTelegramMediaUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export async function fetchTelegramChannelMessages(channelSlug: string, limit = 5): Promise<TelegramChannelMessage[]> {
  const response = await fetch(`https://t.me/s/${channelSlug}`, {
    cache: 'no-store',
    headers: {
      'user-agent': TELEGRAM_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Telegram request failed with status ${response.status}`);
  }

  const html = await response.text();
  const chunks = html
    .split('<div class="tgme_widget_message_wrap')
    .slice(1)
    .map((chunk) => `<div class="tgme_widget_message_wrap${chunk}`);

  const messages: TelegramChannelMessage[] = [];

  for (const chunk of chunks) {
    const url = extractMessageUrl(chunk);
    const text = extractMessageText(chunk);
    if (!url || !text) continue;

    messages.push({
      id: url.split('/').pop() || url,
      text,
      url,
      publishedAt: extractPublishedAt(chunk),
      imageUrl: extractImageUrl(chunk),
    });
  }

  return messages
    .sort((a, b) => {
      const dateDiff = (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0);
      if (dateDiff !== 0) return dateDiff;

      const aId = Number(a.id);
      const bId = Number(b.id);
      if (Number.isFinite(aId) && Number.isFinite(bId)) {
        return bId - aId;
      }

      return b.id.localeCompare(a.id);
    })
    .slice(0, limit);
}
