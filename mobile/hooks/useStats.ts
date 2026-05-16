import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatsPayload } from '@shared/types/mobile-api';

export function useStats() {
  return useQuery<StatsPayload>({
    queryKey: ['stats'],
    queryFn: () => apiClient.get<StatsPayload>('/stats'),
    staleTime: 60_000,
  });
}
