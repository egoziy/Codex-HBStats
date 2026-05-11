import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TeamPayload } from '@shared/types/mobile-api';

export function useTeam(id: string) {
  return useQuery<TeamPayload>({
    queryKey: ['team', id],
    queryFn: () => apiClient.get<TeamPayload>(`/teams/${id}`),
    enabled: !!id,
  });
}
