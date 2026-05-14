import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from '@/design-system/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { brand } = useTheme();
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
    } catch {
      setError('שם משתמש או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          {/* Logo + tagline */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View
              style={{
                width: 88,
                height: 56,
                borderRadius: 12,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowOffset: { width: 0, height: 6 },
                shadowRadius: 14,
              }}
            >
              <Text style={{ color: brand.accent, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>HBS</Text>
            </View>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '800' }}>HBStats</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 }}>
              סטטיסטיקות הכדורגל הישראלי
            </Text>
          </View>

          {/* Card with form */}
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 20,
              padding: 22,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowOffset: { width: 0, height: 8 },
              shadowRadius: 20,
            }}
          >
            <Text style={{ color: theme.ink[900], fontSize: 18, fontWeight: '800', textAlign: 'right', marginBottom: 14 }}>
              התחברות
            </Text>

            <Text style={{ color: theme.ink[700], fontSize: 13, fontWeight: '700', marginBottom: 6, textAlign: 'right' }}>
              אימייל
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.ink[200],
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 14,
                color: theme.ink[900],
                backgroundColor: theme.ink[50],
                textAlign: 'right',
                fontSize: 14,
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              testID="email-input"
              placeholderTextColor={theme.ink[500]}
            />

            <Text style={{ color: theme.ink[700], fontSize: 13, fontWeight: '700', marginBottom: 6, textAlign: 'right' }}>
              סיסמה
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.ink[200],
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 14,
                color: theme.ink[900],
                backgroundColor: theme.ink[50],
                textAlign: 'right',
                fontSize: 14,
              }}
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              testID="password-input"
            />

            {error ? (
              <View
                style={{
                  backgroundColor: '#FEE2E2',
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '600', textAlign: 'right' }} testID="login-error">
                  {error}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              testID="login-submit"
              style={{
                backgroundColor: brand.accent,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 }}>התחבר</Text>
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}
