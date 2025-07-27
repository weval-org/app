'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';

// It's a good idea to set the configuration once.
NProgress.configure({ showSpinner: false });

export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);
  
  // This component doesn't render anything itself, it just handles the side effect.
  // The hook in the layout will trigger NProgress.start()
  return null;
}

export default TopProgressBar; 