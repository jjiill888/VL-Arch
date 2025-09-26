'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { EnvConfigType } from '../services/environment';
import { AppService } from '@/types/system';
import env from '../services/environment';

interface EnvContextType {
  envConfig: EnvConfigType;
  appService: AppService | null;
  // True when the AppService has been initialized (even if null on failure)
  appServiceReady: boolean;
}

const EnvContext = createContext<EnvContextType | undefined>(undefined);

export const EnvProvider = ({ children }: { children: ReactNode }) => {
  const [envConfig] = useState<EnvConfigType>(env);
  const [appService, setAppService] = useState<AppService | null>(null);
  const [appServiceReady, setAppServiceReady] = useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    setAppServiceReady(false);
    const errorHandler = (e: ErrorEvent) => {
      if (e.message === 'ResizeObserver loop limit exceeded') {
        e.stopImmediatePropagation();
        e.preventDefault();
        return true;
      }
      return false;
    };

    envConfig
      .getAppService()
      .then((service) => {
        if (!mounted) return;
        setAppService(service);
        setAppServiceReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAppService(null);
        setAppServiceReady(true);
      });
    window.addEventListener('error', errorHandler);
    return () => {
      mounted = false;
      window.removeEventListener('error', errorHandler);
    };
  }, [envConfig]);

  return (
    <EnvContext.Provider value={{ envConfig, appService, appServiceReady }}>
      {children}
    </EnvContext.Provider>
  );
};

export const useEnv = (): EnvContextType => {
  const context = useContext(EnvContext);
  if (!context) throw new Error('useEnv must be used within EnvProvider');
  return context;
};
