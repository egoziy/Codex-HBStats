import { ChangePasswordForm } from '@/components/AuthForms';
import { requireUser } from '@/lib/auth';

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[24px] border border-white/70 bg-white/90 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Account</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900">{user.name}</h1>
          <p className="mt-2 text-stone-600">{user.email}</p>
          <p className="mt-1 text-sm text-stone-500">
            תפקיד: {user.role === 'ADMIN' ? 'אדמין' : 'משתמש רגיל'}
          </p>
        </section>

        <ChangePasswordForm />
      </div>
    </div>
  );
}
