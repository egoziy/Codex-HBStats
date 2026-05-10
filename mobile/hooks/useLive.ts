import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { LivePayload } from '@shared/types/mobile-api';

export function useLive() {
  return useQuery<LivePayload>({
    queryKey: ['live'],
    queryFn: () => apiClient.get<LivePayload>('/live'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
