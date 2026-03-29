'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || 'ההתחברות נכשלה.');
      return;
    }

    router.push(payload.user?.role === 'ADMIN' ? '/admin' : '/');
    router.refresh();
  }

  return (
    <AuthShell
      title="התחברות"
      subtitle="התחברו כדי לצפות בנתונים האישיים שלכם ולהיכנס לאזור האדמין אם יש לכם הרשאה מתאימה."
      footer={
        <span>
          אין לכם חשבון?{' '}
          <Link href="/register" className="font-bold text-red-700 transition hover:text-red-800">
            להרשמה
          </Link>
        </span>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField label="אימייל" value={email} onChange={setEmail} type="email" />
        <AuthField label="סיסמה" value={password} onChange={setPassword} type="password" />
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-stone-900 px-4 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {loading ? 'מתחבר...' : 'התחברות'}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, email, password }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || 'ההרשמה נכשלה.');
      return;
    }

    router.push(payload.user?.role === 'ADMIN' ? '/admin' : '/');
    router.refresh();
  }

  return (
    <AuthShell
      title="פתיחת חשבון"
      subtitle="משתמש רגיל יכול לצפות ולנתח נתונים. הרשאת אדמין ניתנת רק על ידי מנהל מערכת."
      footer={
        <span>
          כבר רשומים?{' '}
          <Link href="/login" className="font-bold text-red-700 transition hover:text-red-800">
            להתחברות
          </Link>
        </span>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField label="שם מלא" value={name} onChange={setName} />
        <AuthField label="אימייל" value={email} onChange={setEmail} type="email" />
        <AuthField
          label="סיסמה"
          value={password}
          onChange={setPassword}
          type="password"
          hint="לפחות 8 תווים"
        />
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-stone-900 px-4 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {loading ? 'יוצר חשבון...' : 'הרשמה'}
        </button>
      </form>
    </AuthShell>
  );
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change-password',
        currentPassword,
        nextPassword,
      }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || 'לא ניתן לשנות סיסמה.');
      return;
    }

    setCurrentPassword('');
    setNextPassword('');
    setMessage('הסיסמה עודכנה בהצלחה.');
  }

  return (
    <form
      className="space-y-4 rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-2xl font-black text-stone-900">שינוי סיסמה</h2>
        <p className="mt-2 text-sm text-stone-600">
          הסיסמה נשמרת בצורה מאובטחת כמחרוזת מוצפנת, ולא נשמרת במערכת כטקסט גלוי.
        </p>
      </div>
      <AuthField
        label="סיסמה נוכחית"
        value={currentPassword}
        onChange={setCurrentPassword}
        type="password"
      />
      <AuthField
        label="סיסמה חדשה"
        value={nextPassword}
        onChange={setNextPassword}
        type="password"
      />
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-2xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
      >
        {loading ? 'מעדכן...' : 'עדכון סיסמה'}
      </button>
    </form>
  );
}

function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_60px_rgba(98,72,27,0.12)] backdrop-blur">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{subtitle}</p>
      </div>
      {children}
      <div className="mt-6 text-sm text-stone-600">{footer}</div>
    </div>
  );
}

function AuthField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-stone-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-red-500"
      />
      {hint ? <span className="mt-2 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}
