'use client';

import React from 'react';

interface KaryaLogoProps {
  className?: string;
}

export function KaryaLogo({ className = '' }: KaryaLogoProps) {
  return (
    <img
      src="https://imagedelivery.net/zZi_VLBckmtLzucvU2-pnQ/f88f4c03-5915-4781-ae30-768a2168da00/w=64,q=90"
      alt="Karya"
      className={`${className} brightness-0 dark:invert`}
      width={32}
      height={32}
    />
  );
}
