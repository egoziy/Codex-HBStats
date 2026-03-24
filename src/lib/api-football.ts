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

export async function apiFootballFetch(path: string) {
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

  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    cache: 'no-store',
  });
  const payload = await response.json();

  if (!response.ok || hasApiErrors(payload.errors)) {
    throw new Error(extractApiErrorMessage(payload));
  }

  return payload.response || [];
}
