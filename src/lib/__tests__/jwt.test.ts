import { signAccessToken, verifyAccessToken } from '../jwt';

const ORIGINAL_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx';
});

afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe('jwt helpers', () => {
  test('signAccessToken returns a string with three dots-separated parts', () => {
    const token = signAccessToken('user-123');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verifyAccessToken returns the userId from a freshly-signed token', () => {
    const token = signAccessToken('user-123');
    const result = verifyAccessToken(token);
    expect(result).toEqual({ userId: 'user-123' });
  });

  test('verifyAccessToken returns null for a malformed token', () => {
    expect(verifyAccessToken('not-a-jwt')).toBeNull();
  });

  test('verifyAccessToken returns null for a token with wrong signature', () => {
    const token = signAccessToken('user-123');
    const tampered = token.slice(0, -2) + 'XX';
    expect(verifyAccessToken(tampered)).toBeNull();
  });
});
