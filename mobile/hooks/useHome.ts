import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { HomePayload } from '@shared/types/mobile-api';

export function useHome() {
  return useQuery<HomePayload>({
    queryKey: ['home'],
    queryFn: () => apiClient.get<HomePayload>('/home'),
  });
}
