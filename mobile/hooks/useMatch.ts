import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { MatchPayload } from '@shared/types/mobile-api';

export function useMatch(id: string) {
  return useQuery<MatchPayload>({
    queryKey: ['match', id],
    queryFn: () => apiClient.get<MatchPayload>(`/games/${id}`),
    enabled: !!id,
  });
}
