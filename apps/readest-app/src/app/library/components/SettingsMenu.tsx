import clsx from 'clsx';
import React, { useState } from 'react';
import { TbSunMoon } from 'react-icons/tb';
import { BiMoon, BiSun } from 'react-icons/bi';

import { setAboutDialogVisible } from '@/components/AboutWindow';
import { isTauriAppPlatform, isWebAppPlatform } from '@/services/environment';
import { DOWNLOAD_VLARCH_URL } from '@/services/constants';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { tauriHandleSetAlwaysOnTop, tauriHandleToggleFullScreen } from '@/utils/window';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface SettingsMenuProps {
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ setIsDropdownOpen }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { themeMode, setThemeMode } = useThemeStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const [isAutoCheckUpdates, setIsAutoCheckUpdates] = useState(settings.autoCheckUpdates);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(settings.alwaysOnTop);
  const [isAlwaysShowStatusBar, setIsAlwaysShowStatusBar] = useState(settings.alwaysShowStatusBar);
  const [isScreenWakeLock, setIsScreenWakeLock] = useState(settings.screenWakeLock);
  const [isOpenLastBooks, setIsOpenLastBooks] = useState(settings.openLastBooks);
  const [isAutoImportBooksOnOpen, setIsAutoImportBooksOnOpen] = useState(
    settings.autoImportBooksOnOpen,
  );

  const showAboutReadest = () => {
    setAboutDialogVisible(true);
    setIsDropdownOpen?.(false);
  };

  const downloadReadest = () => {
    window.open(DOWNLOAD_VLARCH_URL, '_blank');
    setIsDropdownOpen?.(false);
  };


  const cycleThemeMode = () => {
    const nextMode = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
    setThemeMode(nextMode);
  };

  const handleReloadPage = () => {
    window.location.reload();
    setIsDropdownOpen?.(false);
  };

  const handleFullScreen = () => {
    tauriHandleToggleFullScreen();
    setIsDropdownOpen?.(false);
  };

  const toggleOpenInNewWindow = () => {
    settings.openBookInNewWindow = !settings.openBookInNewWindow;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsDropdownOpen?.(false);
  };

  const toggleAlwaysOnTop = () => {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsAlwaysOnTop(settings.alwaysOnTop);
    tauriHandleSetAlwaysOnTop(settings.alwaysOnTop);
    setIsDropdownOpen?.(false);
  };

  const toggleAlwaysShowStatusBar = () => {
    settings.alwaysShowStatusBar = !settings.alwaysShowStatusBar;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsAlwaysShowStatusBar(settings.alwaysShowStatusBar);
  };


  const toggleAutoImportBooksOnOpen = () => {
    settings.autoImportBooksOnOpen = !settings.autoImportBooksOnOpen;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsAutoImportBooksOnOpen(settings.autoImportBooksOnOpen);
  };

  const toggleAutoCheckUpdates = () => {
    settings.autoCheckUpdates = !settings.autoCheckUpdates;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsAutoCheckUpdates(settings.autoCheckUpdates);
  };

  const toggleScreenWakeLock = () => {
    settings.screenWakeLock = !settings.screenWakeLock;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsScreenWakeLock(settings.screenWakeLock);
  };

  const toggleOpenLastBooks = () => {
    settings.openLastBooks = !settings.openLastBooks;
    setSettings(settings);
    saveSettings(envConfig, settings);
    setIsOpenLastBooks(settings.openLastBooks);
  };



  const themeModeLabel =
    themeMode === 'dark'
      ? _('Dark Mode')
      : themeMode === 'light'
        ? _('Light Mode')
        : _('Auto Mode');

  return (
    <Menu
      label={_('Settings Menu')}
      className={clsx(
        'settings-menu dropdown-content no-triangle border-base-100',
        'z-20 mt-2 max-w-[90vw] shadow-2xl',
      )}
    >
      {isTauriAppPlatform() && !appService?.isMobile && (
        <MenuItem
          label={_('Auto Import on File Open')}
          toggled={isAutoImportBooksOnOpen}
          onClick={toggleAutoImportBooksOnOpen}
        />
      )}
      {isTauriAppPlatform() && (
        <MenuItem
          label={_('Open Last Book on Start')}
          toggled={isOpenLastBooks}
          onClick={toggleOpenLastBooks}
        />
      )}
      {appService?.hasUpdater && (
        <MenuItem
          label={_('Check Updates on Start')}
          toggled={isAutoCheckUpdates}
          onClick={toggleAutoCheckUpdates}
        />
      )}
      <hr className='border-base-200 my-1' />
      {appService?.hasWindow && (
        <MenuItem
          label={_('Open Book in New Window')}
          toggled={settings.openBookInNewWindow}
          onClick={toggleOpenInNewWindow}
        />
      )}
      {appService?.hasWindow && <MenuItem label={_('Fullscreen')} onClick={handleFullScreen} />}
      {appService?.hasWindow && (
        <MenuItem label={_('Always on Top')} toggled={isAlwaysOnTop} onClick={toggleAlwaysOnTop} />
      )}
      {appService?.isMobileApp && (
        <MenuItem
          label={_('Always Show Status Bar')}
          toggled={isAlwaysShowStatusBar}
          onClick={toggleAlwaysShowStatusBar}
        />
      )}
      <MenuItem
        label={_('Keep Screen Awake')}
        toggled={isScreenWakeLock}
        onClick={toggleScreenWakeLock}
      />
      <MenuItem label={_('Reload Page')} onClick={handleReloadPage} />
      <MenuItem
        label={themeModeLabel}
        Icon={themeMode === 'dark' ? BiMoon : themeMode === 'light' ? BiSun : TbSunMoon}
        onClick={cycleThemeMode}
      />
      <hr className='border-base-200 my-1' />
      {isWebAppPlatform() && <MenuItem label={_('Download Readest')} onClick={downloadReadest} />}
      <MenuItem label={_('About VL-Arch')} onClick={showAboutReadest} />
    </Menu>
  );
};

export default SettingsMenu;
