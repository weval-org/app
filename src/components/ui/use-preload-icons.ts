'use client';

import { useEffect } from 'react';
import Icon, { type IconName } from './icon';

/**
 * Hook to preload icons when a component mounts
 * Usage: usePreloadIcons(['search', 'alert-circle', 'loader-2'])
 * 
 * Note: This is a client-side hook. Components using this must be client components.
 */
export const usePreloadIcons = (iconNames: IconName[]): void => {
  useEffect(() => {
    // Icon.preload(iconNames); //null for now
  }, [iconNames]);
}; 