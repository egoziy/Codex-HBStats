import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PreferencesPayload } from '@shared/types/mobile-api';

export function usePreferences() {
  return useQuery<PreferencesPayload>({
    queryKey: ['preferences'],
    queryFn: () => apiClient.get<PreferencesPayload>('/preferences'),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation<PreferencesPayload, Error, PreferencesPayload>({
    mutationFn: (body) => apiClient.put<PreferencesPayload>('/preferences', body),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['preferences'] });
      const prev = qc.getQueryData<PreferencesPayload>(['preferences']);
      qc.setQueryData(['preferences'], next);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      const c = context as { prev: PreferencesPayload | undefined } | undefined;
      if (c?.prev) qc.setQueryData(['preferences'], c.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] });
    },
  });
}
