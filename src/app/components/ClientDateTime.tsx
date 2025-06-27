'use client';

import { useState, useEffect } from 'react';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

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

const ClientDateTime: React.FC<ClientDateTimeProps> = ({ timestamp, options }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const finalOptions = { ...defaultOptions, ...options };

  if (!isMounted || !timestamp) {
    // Return an empty time tag as a consistent placeholder to avoid DOM structure changes.
    return <time />;
  }
  
  const dateObj = new Date(fromSafeTimestamp(timestamp));
  if (isNaN(dateObj.getTime())) {
    return <time>Invalid Date</time>;
  }

  // Forcing 'en-GB' locale to ensure consistent output between server and client.
  // This prevents hydration errors caused by differing locales.
  return <time dateTime={dateObj.toISOString()}>{dateObj.toLocaleDateString('en-GB', finalOptions)}</time>;
};

export default ClientDateTime; 