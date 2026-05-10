import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import { useHome } from '../useHome';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe('useHome', () => {
  test('returns loading state initially', () => {
    const { result } = renderHook(() => useHome(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});
