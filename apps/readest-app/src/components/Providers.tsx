'use client';

import { useEffect } from 'react';
import clsx from 'clsx';
import { IconContext } from 'react-icons';
import { AuthProvider } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { SyncProvider } from '@/context/SyncContext';
import { initSystemThemeListener, loadDataTheme } from '@/store/themeStore';
import { useDefaultIconSize } from '@/hooks/useResponsiveSize';
import { useSafeAreaInsets } from '@/hooks/useSafeAreaInsets';
import { getLocale } from '@/utils/misc';
import i18n from '@/i18n/i18n';
import { useTranslation } from '@/hooks/useTranslation';

const Providers = ({ children }: { children: React.ReactNode }) => {
  const { appService, appServiceReady } = useEnv();
  const _ = useTranslation();
  const iconSize = useDefaultIconSize();
  useSafeAreaInsets(); // Initialize safe area insets

  useEffect(() => {
    const handlerLanguageChanged = (lng: string) => {
      document.documentElement.lang = lng;
    };

    const locale = getLocale();
    handlerLanguageChanged(locale);
    i18n.on('languageChanged', handlerLanguageChanged);
    return () => {
      i18n.off('languageChanged', handlerLanguageChanged);
    };
  }, []);

  useEffect(() => {
    loadDataTheme();
    if (appService) {
      initSystemThemeListener(appService);
    }
  }, [appService]);

  // Do not early-return — show a loading overlay until the environment is ready

  return (
    <AuthProvider>
      <IconContext.Provider value={{ size: `${iconSize}px` }}>
        <SyncProvider>
          {children}
          {!appServiceReady && (
            <div
              className={clsx(
                'fixed inset-0 z-[1000] flex items-center justify-center',
                !appService?.isLinuxApp && 'bg-base-200',
              )}
            >
              <span className='loading loading-spinner text-primary'></span>
              <span className='sr-only'>{_('Loading...')}</span>
            </div>
          )}
        </SyncProvider>
      </IconContext.Provider>
    </AuthProvider>
  );
};

export default Providers;
