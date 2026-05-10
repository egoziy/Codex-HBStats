import { queryClient, persister } from '../queryClient';

describe('queryClient persister', () => {
  test('persister is configured', () => {
    expect(persister).toBeDefined();
  });

  test('queryClient has 60s staleTime default', () => {
    const opts = queryClient.getDefaultOptions();
    expect(opts.queries?.staleTime).toBe(60_000);
  });
});
