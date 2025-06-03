'use client';

import { useEffect, useRef } from 'react';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import { usePathname, useSearchParams } from 'next/navigation';

// Configure NProgress if needed (optional)
// NProgress.configure({ showSpinner: false });

const TopProgressBar = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPathname = useRef(pathname);
  const previousSearchParams = useRef(searchParams);

  useEffect(() => {
    NProgress.configure({ showSpinner: false });
  }, []);

  useEffect(() => {
    if (pathname !== previousPathname.current || searchParams !== previousSearchParams.current) {
      NProgress.start();
    }

    previousPathname.current = pathname;
    previousSearchParams.current = searchParams;

    // Call NProgress.done() when the new page component (that includes this TopProgressBar)
    // has mounted and this effect runs. This is an approximation.
    // A more complex solution might involve Suspense boundaries or layout loading states.
    NProgress.done();

  }, [pathname, searchParams]);

  // This component doesn't render anything itself
  return null; 
};

export default TopProgressBar; 