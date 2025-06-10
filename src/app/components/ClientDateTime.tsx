'use client';

import { useState, useEffect } from 'react';
import { fromSafeTimestamp } from '@/app/utils/timestampUtils';

interface ClientDateTimeProps {
  timestamp: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
}

const defaultOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const ClientDateTime: React.FC<ClientDateTimeProps> = ({ timestamp, options = defaultOptions }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !timestamp) {
    // On the server, or on the initial client render, or if no timestamp, return null or a placeholder.
    // Returning null avoids any hydration mismatch.
    return null;
  }
  
  const dateObj = new Date(fromSafeTimestamp(timestamp));
  if (isNaN(dateObj.getTime())) {
    return <>Invalid Date</>;
  }

  return <>{dateObj.toLocaleDateString([], options)}</>;
};

export default ClientDateTime; 