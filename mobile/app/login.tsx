import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setError('יש למלא אימייל וסיסמה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError('שם משתמש או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-white p-6 justify-center">
      <Text className="text-3xl font-bold mb-8 text-center">HBStats</Text>

      <Text className="mb-2 text-base">אימייל</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-3 py-3 mb-4"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
        testID="email-input"
      />

      <Text className="mb-2 text-base">סיסמה</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-3 py-3 mb-4"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        testID="password-input"
      />

      {error && <Text className="text-red-600 mb-3 text-center" testID="login-error">{error}</Text>}

      <Pressable
        className="bg-blue-600 py-3 rounded-md items-center"
        onPress={submit}
        disabled={busy}
        testID="login-submit"
      >
        {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">התחבר</Text>}
      </Pressable>
    </View>
  );
}
