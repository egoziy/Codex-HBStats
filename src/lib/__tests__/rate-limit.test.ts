import { checkRateLimit, _resetRateLimitForTests } from '../rate-limit';

beforeEach(() => {
  _resetRateLimitForTests();
});

describe('rate-limit', () => {
  test('allows up to N requests in window', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('login:ip:1.2.3.4', 5, 60_000)).toBe(true);
    }
  });

  test('blocks the (N+1)th request in window', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 60_000);
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 60_000)).toBe(false);
  });

  test('keys are independent', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 60_000);
    expect(checkRateLimit('login:ip:5.6.7.8', 5, 60_000)).toBe(true);
  });

  test('resets after window expires', async () => {
    for (let i = 0; i < 5; i++) checkRateLimit('login:ip:1.2.3.4', 5, 100);
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 100)).toBe(false);
    await new Promise((r) => setTimeout(r, 120));
    expect(checkRateLimit('login:ip:1.2.3.4', 5, 100)).toBe(true);
  });
});
