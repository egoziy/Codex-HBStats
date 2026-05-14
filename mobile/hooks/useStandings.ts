import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StandingsPayload } from '@shared/types/mobile-api';

export function useStandings() {
  return useQuery<StandingsPayload>({
    queryKey: ['standings'],
    queryFn: () => apiClient.get<StandingsPayload>('/standings'),
    staleTime: 60_000,
  });
}
