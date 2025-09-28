'use client';

import { useEffect } from 'react';
import { isTauriAppPlatform } from '@/services/environment';

/**
 * Provider component to initialize Android back key handling
 * This ensures the global back key listener is set up when the app starts
 */
export const AndroidBackKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    if (!isTauriAppPlatform()) {
      return;
    }

    console.log('AndroidBackKeyProvider: Initializing Android back key handling');

    // The global event listener is already set up in useGlobalBackHandler.ts
    // This component just ensures it's initialized when the app starts

    return () => {
      console.log('AndroidBackKeyProvider: Cleaning up Android back key handling');
    };
  }, []);

  return <>{children}</>;
};

export default AndroidBackKeyProvider;