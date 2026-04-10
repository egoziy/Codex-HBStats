'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DisplayMode } from '@/lib/display-mode';

export default function DisplayModeSwitch({
  initialMode,
  compact = false,
}: {
  initialMode: DisplayMode;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const [isPending, startTransition] = useTransition();

  async function applyMode(nextMode: DisplayMode) {
    if (nextMode === mode) return;

    setMode(nextMode);

    try {
      await fetch('/api/display-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });
    } catch {
      setMode(initialMode);
      return;
    }

    const nextParams = new URLSearchParams(searchParams?.toString() || '');
    nextParams.set('view', nextMode);
    const query = nextParams.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : `${pathname}?view=${nextMode}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-full border border-white/15 bg-black/15 p-1 text-right ${
        compact ? 'w-full' : ''
      }`}
      dir="rtl"
    >
      <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.28em] text-white/60">View</div>
      <div className={`grid gap-1 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <ModeButton
          active={mode === 'classic'}
          disabled={isPending}
          onClick={() => applyMode('classic')}
          label="Classic"
          description="העיצוב הקיים"
        />
        <ModeButton
          active={mode === 'premier'}
          disabled={isPending}
          onClick={() => applyMode('premier')}
          label="Premier"
          description="פורמט חדש"
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  label,
  description,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-white text-stone-900 shadow-sm'
          : 'bg-white/5 text-white hover:bg-white/10'
      } disabled:cursor-wait disabled:opacity-70`}
    >
      <div>{label}</div>
      <div className={`text-[11px] font-medium ${active ? 'text-stone-500' : 'text-white/65'}`}>{description}</div>
    </button>
  );
}
