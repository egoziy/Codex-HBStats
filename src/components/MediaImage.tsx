'use client';

import { useState } from 'react';

export function TeamLogo({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  const initials = alt.trim().slice(0, 2);

  if (!src || broken) {
    return (
      <div
        className={
          fallbackClassName ||
          'flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700'
        }
        aria-label={alt}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}

export function PlayerPhoto({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        className={
          fallbackClassName ||
          'flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-400'
        }
        aria-label={alt}
      >
        PL
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
