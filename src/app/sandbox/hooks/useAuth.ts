'use client';

import { useState, useEffect, useCallback } from 'react';

export interface User {
  isLoggedIn: boolean;
  username?: string;
  avatarUrl?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const clearAuth = useCallback(() => {
    console.log('[useAuth] Clearing auth state due to backend mismatch');
    setUser({ isLoggedIn: false });
  }, []);

  useEffect(() => {
    const fetchUserStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/github/user/status');
        if (!response.ok) {
          throw new Error('Failed to fetch user status');
        }
        const data: User = await response.json();
        setUser(data);
      } catch (e: any) {
        setError(e);
        setUser({ isLoggedIn: false });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserStatus();
  }, []);

  return { user, isLoading, error, clearAuth };
} 