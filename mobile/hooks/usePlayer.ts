import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PlayerPayload } from '@shared/types/mobile-api';

export function usePlayer(id: string) {
  return useQuery<PlayerPayload>({
    queryKey: ['player', id],
    queryFn: () => apiClient.get<PlayerPayload>(`/players/${id}`),
    enabled: !!id,
  });
}
