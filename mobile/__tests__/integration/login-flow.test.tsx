import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import LoginScreen from '@/app/login';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// MSW lifecycle is managed globally in jest.setup.ts (beforeAll/afterEach/afterAll).
// This integration test relies on the handlers registered in __tests__/msw/handlers.ts.

function ProbeUser() {
  const { user } = useAuth();
  return <Text testID="probe">{user?.email ?? 'anon'}</Text>;
}

describe('Login flow integration', () => {
  beforeEach(async () => {
    // Clear the stateful SecureStore mock between tests so auth state doesn't leak
    await SecureStore.deleteItemAsync('hbs_refresh');
    await SecureStore.deleteItemAsync('hbs_user');
    await SecureStore.deleteItemAsync('hbs_access');
  });
  test('valid credentials → user populated', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <LoginScreen />
        <ProbeUser />
      </AuthProvider>
    );

    fireEvent.changeText(getByTestId('email-input'), 'good@test.tld');
    fireEvent.changeText(getByTestId('password-input'), 'GoodPass');
    fireEvent.press(getByTestId('login-submit'));

    await waitFor(() => expect(getByTestId('probe').props.children).toBe('good@test.tld'));
  });

  test('invalid credentials → error displayed, no user', async () => {
    const { getByTestId, findByTestId } = render(
      <AuthProvider>
        <LoginScreen />
        <ProbeUser />
      </AuthProvider>
    );

    fireEvent.changeText(getByTestId('email-input'), 'good@test.tld');
    fireEvent.changeText(getByTestId('password-input'), 'WrongPass');
    fireEvent.press(getByTestId('login-submit'));

    const error = await findByTestId('login-error');
    expect(error).toBeTruthy();
    expect(getByTestId('probe').props.children).toBe('anon');
  });
});
