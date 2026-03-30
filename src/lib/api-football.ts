const MIN_REQUEST_INTERVAL_MS = 250;
const MAX_RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 3000;
const API_FOOTBALL_RATE_LIMIT_CODE = 'API_FOOTBALL_RATE_LIMIT';

let lastRequestStartedAt = 0;
let requestQueue = Promise.resolve();

export class ApiFootballRateLimitError extends Error {
  code = API_FOOTBALL_RATE_LIMIT_CODE;
  statusCode = 429;

  constructor(message: string) {
    super(message);
    this.name = 'ApiFootballRateLimitError';
  }
}

function hasApiErrors(errors: unknown) {
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  if (errors && typeof errors === 'object') {
    return Object.keys(errors as Record<string, unknown>).length > 0;
  }

  return Boolean(errors);
}

function extractApiErrorMessage(payload: any) {
  if (!payload) {
    return 'API-Football request failed.';
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors.join(', ');
  }

  if (payload.errors && typeof payload.errors === 'object') {
    const firstValue = Object.values(payload.errors)[0];
    if (typeof firstValue === 'string' && firstValue.trim()) {
      return firstValue;
    }
  }

  return 'API-Football request failed.';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTemporaryRateLimitMessage(message: string) {
  return /too many requests|rate limit/i.test(message || '');
}

function isDailyLimitExceededMessage(message: string) {
  return /request limit|limit for the day|upgrade your plan/i.test(message || '');
}

async function scheduleRequest() {
  const queueTurn = requestQueue.catch(() => undefined);
  let releaseQueue: () => void = () => undefined;

  requestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await queueTurn;

  const now = Date.now();
  const waitMs = Math.max(0, lastRequestStartedAt + MIN_REQUEST_INTERVAL_MS - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestStartedAt = Date.now();

  return () => {
    releaseQueue();
  };
}

async function performApiFootballFetch(path: string, attempt = 0): Promise<any[]> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  const host = process.env.API_FOOTBALL_HOST;

  if (!apiKey) {
    throw new Error('API_FOOTBALL_KEY is missing.');
  }

  const headers: Record<string, string> = {
    'x-apisports-key': apiKey,
  };

  if (host) {
    headers['x-rapidapi-host'] = host;
  }

  const releaseQueue = await scheduleRequest();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers,
      cache: 'no-store',
    });
    const payload = await response.json();

    const errorMessage = extractApiErrorMessage(payload);
    const isTemporaryRateLimited = response.status === 429 || isTemporaryRateLimitMessage(errorMessage);
    const isDailyLimitExceeded = isDailyLimitExceededMessage(errorMessage);

    if (isDailyLimitExceeded) {
      throw new ApiFootballRateLimitError(errorMessage);
    }

    if (isTemporaryRateLimited && attempt < MAX_RETRY_ATTEMPTS) {
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      return performApiFootballFetch(path, attempt + 1);
    }

    if (isTemporaryRateLimited) {
      throw new ApiFootballRateLimitError(errorMessage);
    }

    if (!response.ok || hasApiErrors(payload.errors)) {
      throw new Error(errorMessage);
    }

    return payload.response || [];
  } finally {
    releaseQueue();
  }
}

export async function apiFootballFetch(path: string) {
  return performApiFootballFetch(path);
}

export function isApiFootballRateLimitError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === API_FOOTBALL_RATE_LIMIT_CODE
  );
}
