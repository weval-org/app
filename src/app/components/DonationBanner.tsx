'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const DonationBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // localStorage is only available on the client
    if (typeof window !== 'undefined' && localStorage.getItem('hideDonationBanner') !== 'true') {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideDonationBanner', 'true');
    }
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-accent-cta text-accent-cta-foreground p-3 text-center relative shadow-md rounded-lg mb-6">
      <p className="text-sm sm:text-base font-medium">
        Donations help us run evaluations on a wider range of AI models, including more powerful and costly ones.
        <Link href="https://github.com/sponsors/civiceval" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent-cta-foreground/80 font-semibold ml-2">
          Donate Here
        </Link>
      </p>
      <button
        onClick={handleDismiss}
        className="absolute top-1/2 right-3 transform -translate-y-1/2 text-accent-cta-foreground hover:text-accent-cta-foreground/70 transition-opacity"
        aria-label="Dismiss banner"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default DonationBanner; 