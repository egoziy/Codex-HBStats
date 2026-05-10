import React from 'react';
import { Text, Button } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../AuthContext';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function Probe() {
  const { user, login, logout, isLoading } = useAuth();
  if (isLoading) return <Text testID="loading">loading</Text>;
  return (
    <>
      <Text testID="user">{user ? user.email : 'anon'}</Text>
      <Button title="login" onPress={() => login('a@b.c', 'pw')} />
      <Button title="logout" onPress={() => logout()} />
    </>
  );
}

beforeEach(async () => {
  fetchMock.mockReset();
  // Drain the stateful SecureStore mock between tests
  await SecureStore.deleteItemAsync('hbs_refresh');
  await SecureStore.deleteItemAsync('hbs_user');
});

describe('AuthContext', () => {
  test('starts with no user when SecureStore has no refresh token', async () => {
    const { findByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await findByText('anon')).toBeTruthy();
  });

  test('login sets user from /auth/login response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => {
      fireEvent.press(getByText('login'));
    });

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(await findByText('me@test.tld')).toBeTruthy();
  });

  test('logout clears user state and refresh token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })); // logout

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => fireEvent.press(getByText('login')));
    await findByText('me@test.tld');

    await act(async () => fireEvent.press(getByText('logout')));

    await waitFor(async () => {
      const stored = await SecureStore.getItemAsync('hbs_refresh');
      expect(stored).toBeNull();
    });
    expect(await findByText('anon')).toBeTruthy();
  });
});
