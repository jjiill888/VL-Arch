'use client';

import clsx from 'clsx';
import * as React from 'react';
import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { ReadonlyURLSearchParams, useRouter, useSearchParams } from 'next/navigation';
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import { Book } from '@/types/book';
import { AppService, DeleteAction } from '@/types/system';
import { navigateToLogin, navigateToReader } from '@/utils/nav';
import { formatAuthors, formatTitle, getPrimaryLanguage, listFormater } from '@/utils/book';
import { eventDispatcher } from '@/utils/event';
import { ProgressPayload } from '@/utils/transfer';
import { throttle } from '@/utils/throttle';
import { getFilename } from '@/utils/path';
import { parseOpenWithFiles } from '@/helpers/openWith';
import { isTauriAppPlatform, isWebAppPlatform } from '@/services/environment';
import { checkForAppUpdates, checkAppReleaseNotes } from '@/helpers/updater';
import { BOOK_ACCEPT_FORMATS } from '@/services/constants';
import { impactFeedback } from '@tauri-apps/plugin-haptics';
import { getCurrentWebview } from '@tauri-apps/api/webview';

import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTheme } from '@/hooks/useTheme';
import { useUICSS } from '@/hooks/useUICSS';
import { useDemoBooks } from './hooks/useDemoBooks';
import { useBooksSync } from './hooks/useBooksSync';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { useOpenWithBooks } from '@/hooks/useOpenWithBooks';
import { SelectedFile, useFileSelector } from '@/hooks/useFileSelector';
import { lockScreenOrientation } from '@/utils/bridge';
import { OPDSService, OPDSBook, opdsLibraryManager, OPDSLibrary } from '@/services/opds';
import {
  tauriHandleSetAlwaysOnTop,
  tauriHandleToggleFullScreen,
  tauriQuitApp,
} from '@/utils/window';

import { AboutWindow } from '@/components/AboutWindow';
import { UpdaterWindow } from '@/components/UpdaterWindow';
import { BookMetadata } from '@/libs/document';
import { BookDetailModal } from '@/components/metadata';
import { Toast } from '@/components/Toast';
import Spinner from '@/components/Spinner';
import LibraryHeader from './components/LibraryHeader';
import Bookshelf from './components/Bookshelf';
import useShortcuts from '@/hooks/useShortcuts';
import DropIndicator from '@/components/DropIndicator';
import OPDSUrlDialog from '@/components/OPDSUrlDialog';
import OPDSCredentialsDialog from '@/components/OPDSCredentialsDialog';
import OPDSLibraryView from '@/components/OPDSLibraryView';
import OPDSShelfView from '@/components/OPDSShelfView';
import OPDSShelfMainView, { OPDSShelfMainViewHandle } from '@/components/OPDSShelfMainView';

const LibraryPageWithSearchParams = () => {
  const searchParams = useSearchParams();
  return <LibraryPageContent searchParams={searchParams} />;
};

const LibraryPageContent = ({ searchParams }: { searchParams: ReadonlyURLSearchParams | null }) => {
  const router = useRouter();
  const { envConfig, appService, appServiceReady } = useEnv();
  const { token, user } = useAuth();
  const {
    library: libraryBooks,
    updateBook,
    setLibrary,
    checkOpenWithBooks,
    checkLastOpenBooks,
    setCheckOpenWithBooks,
    setCheckLastOpenBooks,
  } = useLibraryStore();
  const _ = useTranslation();
  const { selectFiles } = useFileSelector(appService, _);
  const { safeAreaInsets: insets, isRoundedWindow } = useThemeStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const [loading, setLoading] = useState(false);
  const isInitiating = useRef(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [isSelectNone, setIsSelectNone] = useState(false);
  const [showDetailsBook, setShowDetailsBook] = useState<Book | null>(null);
  const [booksTransferProgress, setBooksTransferProgress] = useState<{
    [key: string]: number | null;
  }>({});
  const [pendingNavigationBookIds, setPendingNavigationBookIds] = useState<string[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showOPDSUrlDialog, setShowOPDSUrlDialog] = useState(false);
  const [showOPDSCredentialsDialog, setShowOPDSCredentialsDialog] = useState(false);
  const [showOPDSLibraryView, setShowOPDSLibraryView] = useState(false);
  const [showOPDSShelfView, setShowOPDSShelfView] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'shelf'>('home');
  const [opdsUrl, setOpdsUrl] = useState('');
  const [opdsCredentials, setOpdsCredentials] = useState<{ username: string; password: string } | undefined>();
  const [currentShelfId, setCurrentShelfId] = useState<string>('');
  const [currentLibrary, setCurrentLibrary] = useState<OPDSLibrary | null>(null);
  const [opdsLibraries, setOpdsLibraries] = useState<OPDSLibrary[]>([]);
  const demoBooks = useDemoBooks();
  const osRef = useRef<OverlayScrollbarsComponentRef>(null);
  const containerRef: React.MutableRefObject<HTMLDivElement | null> = useRef(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const opdsShelfRef = useRef<OPDSShelfMainViewHandle>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll detection for infinite loading
  const handleScroll = useCallback(() => {
    console.log('🔄 Scroll event triggered, currentView:', currentView);
    
    if (currentView !== 'shelf') {
      console.log('❌ Not in shelf view, skipping scroll detection');
      return;
    }
    
    if (!opdsShelfRef.current) {
      console.log('❌ opdsShelfRef.current is null');
      return;
    }

    const { isInfiniteScrollEnabled, hasNextPage, isLoadingMore, loadingPage, triggerLoadNextPage } = opdsShelfRef.current;
    
    console.log('📊 Scroll state:', {
      isInfiniteScrollEnabled,
      hasNextPage,
      isLoadingMore,
      loadingPage
    });
    
    if (!isInfiniteScrollEnabled) {
      console.log('❌ Infinite scroll is disabled');
      return;
    }
    
    if (!hasNextPage) {
      console.log('❌ No next page available');
      return;
    }
    
    if (isLoadingMore || loadingPage) {
      console.log('❌ Already loading, skipping');
      return;
    }

    const scrollContainer = osRef.current?.osInstance()?.elements().viewport;
    if (!scrollContainer) {
      console.log('❌ Scroll container not found');
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    
    console.log('📏 Scroll metrics:', {
      scrollTop,
      scrollHeight,
      clientHeight,
      scrollPercentage: Math.round(scrollPercentage * 100) + '%'
    });
    
    // Trigger loading when user scrolls to 60% of the content
    if (scrollPercentage >= 0.6) {
      console.log('🚀 Triggering load at', Math.round(scrollPercentage * 100) + '%');
      
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Debounce the loading to prevent multiple rapid calls
      scrollTimeoutRef.current = setTimeout(() => {
        console.log('📚 Executing infinite scroll load at', Math.round(scrollPercentage * 100) + '%');
        triggerLoadNextPage();
      }, 150); // 150ms debounce
    }
  }, [currentView]);

  // Add scroll event listener
  useEffect(() => {
    console.log('🔧 Setting up scroll listener, currentView:', currentView);
    
    if (currentView !== 'shelf') {
      console.log('❌ Not in shelf view, skipping scroll listener setup');
      return;
    }

    // Add a small delay to ensure OverlayScrollbars is fully initialized
    const setupScrollListener = (): (() => void) | null => {
      const scrollContainer = osRef.current?.osInstance()?.elements().viewport;
      if (!scrollContainer) {
        console.log('❌ Scroll container not found for event listener setup');
        return null;
      }

      console.log('✅ Adding scroll event listener to container');
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      
      return () => {
        console.log('🧹 Cleaning up scroll event listener');
        scrollContainer.removeEventListener('scroll', handleScroll);
        // Clean up timeout on unmount
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    };

    // Try to setup immediately, if that fails, try again after a short delay
    const cleanup = setupScrollListener();
    if (!cleanup) {
      console.log('⏳ Retrying scroll listener setup after delay');
      const timeoutId = setTimeout(() => {
        setupScrollListener();
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }

    return cleanup;
  }, [currentView, handleScroll]);

  useTheme({ systemUIVisible: true, appThemeColor: 'base-200' });
  useUICSS();

  useOpenWithBooks();

  const { pullLibrary, pushLibrary } = useBooksSync({
    onSyncStart: () => setLoading(true),
    onSyncEnd: () => setLoading(false),
  });

  usePullToRefresh(containerRef, pullLibrary);
  useScreenWakeLock(settings.screenWakeLock);

  useShortcuts({
    onToggleFullscreen: async () => {
      if (isTauriAppPlatform()) {
        await tauriHandleToggleFullScreen();
      }
    },
    onQuitApp: async () => {
      if (isTauriAppPlatform()) {
        await tauriQuitApp();
      }
    },
  });

  useEffect(() => {
    const doCheckAppUpdates = async () => {
      if (appService?.hasUpdater && settings.autoCheckUpdates) {
        await checkForAppUpdates(_);
      } else if (appService?.hasUpdater === false) {
        checkAppReleaseNotes();
      }
    };
    if (settings.alwaysOnTop) {
      tauriHandleSetAlwaysOnTop(settings.alwaysOnTop);
    }
    doCheckAppUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService?.hasUpdater, settings]);

  useEffect(() => {
    if (appService?.isMobileApp) {
      lockScreenOrientation({ orientation: 'auto' });
    }
  }, [appService]);

  const handleNativeBackKeyDown = useCallback(
    (event: CustomEvent): boolean => {
      if (!appService?.isAndroidApp) {
        return false;
      }

      const detail = event.detail as { keyName?: string } | undefined;

      if (detail?.keyName !== 'Back' || currentView !== 'shelf') {
        return false;
      }

      const handledByShelf = opdsShelfRef.current?.handleBack?.() ?? false;

      if (!handledByShelf) {
        setCurrentView('home');
        setCurrentShelfId('');
        setCurrentLibrary(null);
      }

      return true;
    },
    [appService?.isAndroidApp, currentView],
  );

  useEffect(() => {
    if (!appService?.isAndroidApp || currentView !== 'shelf') {
      return;
    }

    acquireBackKeyInterception();
    eventDispatcher.onSync('native-key-down', handleNativeBackKeyDown);

    return () => {
      eventDispatcher.offSync('native-key-down', handleNativeBackKeyDown);
      releaseBackKeyInterception();
    };
  }, [
    appService?.isAndroidApp,
    currentView,
    acquireBackKeyInterception,
    releaseBackKeyInterception,
    handleNativeBackKeyDown,
  ]);

  const handleDropedFiles = async (files: File[] | string[]) => {
    if (files.length === 0) return;
    const supportedFiles = files.filter((file) => {
      let fileExt;
      if (typeof file === 'string') {
        fileExt = file.split('.').pop()?.toLowerCase();
      } else {
        fileExt = file.name.split('.').pop()?.toLowerCase();
      }
      return BOOK_ACCEPT_FORMATS.includes(`.${fileExt}`);
    });
    if (supportedFiles.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No supported files found. Supported formats: {{formats}}', {
          formats: BOOK_ACCEPT_FORMATS,
        }),
        type: 'error',
      });
      return;
    }

    if (appService?.hasHaptics) {
      impactFeedback('medium');
    }

    const selectedFiles = supportedFiles.map(
      (file) =>
        ({
          file: typeof file === 'string' ? undefined : file,
          path: typeof file === 'string' ? file : undefined,
        }) as SelectedFile,
    );
    await importBooks(selectedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files);
      handleDropedFiles(files);
    }
  };

  const handleRefreshLibrary = useCallback(async () => {
    const appService = await envConfig.getAppService();
    const settings = await appService.loadSettings();
    const library = await appService.loadLibraryBooks();
    setSettings(settings);
    setLibrary(library);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig, appService]);

  useEffect(() => {
    if (appService?.hasWindow) {
      const currentWebview = getCurrentWebview();
      const unlisten = currentWebview.listen('close-reader-window', async () => {
        handleRefreshLibrary();
      });
      return () => {
        unlisten.then((fn) => fn());
      };
    }
    return;
  }, [appService, handleRefreshLibrary]);

  useEffect(() => {
    const libraryPage = document.querySelector('.library-page');
    if (!appService?.isMobile) {
      libraryPage?.addEventListener('dragover', handleDragOver as unknown as EventListener);
      libraryPage?.addEventListener('dragleave', handleDragLeave as unknown as EventListener);
      libraryPage?.addEventListener('drop', handleDrop as unknown as EventListener);
    }

    if (isTauriAppPlatform()) {
      const unlisten = getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragging(true);
        } else if (event.payload.type === 'drop') {
          setIsDragging(false);
          handleDropedFiles(event.payload.paths);
        } else {
          setIsDragging(false);
        }
      });
      return () => {
        unlisten.then((fn) => fn());
      };
    }

    return () => {
      if (!appService?.isMobile) {
        libraryPage?.removeEventListener('dragover', handleDragOver as unknown as EventListener);
        libraryPage?.removeEventListener('dragleave', handleDragLeave as unknown as EventListener);
        libraryPage?.removeEventListener('drop', handleDrop as unknown as EventListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRef.current]);

  useEffect(() => {
    if (!libraryBooks.some((book) => !book.deletedAt)) {
      handleSetSelectMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryBooks]);

  // Load OPDS libraries on component mount
  useEffect(() => {
    const libraries = opdsLibraryManager.getAllLibraries();
    setOpdsLibraries(libraries);
  }, []);

  const processOpenWithFiles = React.useCallback(
    async (appService: AppService, openWithFiles: string[], libraryBooks: Book[]) => {
      const settings = await appService.loadSettings();
      const bookIds: string[] = [];
      for (const file of openWithFiles) {
        console.log('Open with book:', file);
        try {
          const temp = appService.isMobile ? false : !settings.autoImportBooksOnOpen;
          const book = await appService.importBook(file, libraryBooks, true, true, false, temp);
          if (book) {
            bookIds.push(book.hash);
          }
        } catch (error) {
          console.log('Failed to import book:', file, error);
        }
      }
      setLibrary(libraryBooks);
      appService.saveLibraryBooks(libraryBooks);

      console.log('Opening books:', bookIds);
      if (bookIds.length > 0) {
        setPendingNavigationBookIds(bookIds);
        return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOpenLastBooks = async (
    appService: AppService,
    lastBookIds: string[],
    libraryBooks: Book[],
  ) => {
    if (lastBookIds.length === 0) return false;
    const bookIds: string[] = [];
    for (const bookId of lastBookIds) {
      const book = libraryBooks.find((b) => b.hash === bookId);
      if (book && (await appService.isBookAvailable(book))) {
        bookIds.push(book.hash);
      }
    }
    console.log('Opening last books:', bookIds);
    if (bookIds.length > 0) {
      setPendingNavigationBookIds(bookIds);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (pendingNavigationBookIds) {
      const bookIds = pendingNavigationBookIds;
      setPendingNavigationBookIds(null);
      if (bookIds.length > 0) {
        navigateToReader(router, bookIds);
      }
    }
  }, [pendingNavigationBookIds, appService, router]);

  useEffect(() => {
    if (isInitiating.current) return;
    isInitiating.current = true;

    const initLogin = async () => {
      const appService = await envConfig.getAppService();
      const settings = await appService.loadSettings();
      if (token && user) {
        if (!settings.keepLogin) {
          settings.keepLogin = true;
          setSettings(settings);
          saveSettings(envConfig, settings);
        }
      } else if (settings.keepLogin) {
        router.push('/auth');
      }
    };

    const loadingTimeout = setTimeout(() => setLoading(true), 200);
    const initLibrary = async () => {
      const appService = await envConfig.getAppService();
      const [settings, fetchedLibrary] = await Promise.all([
        appService.loadSettings(),
        libraryBooks.length > 0 ? Promise.resolve(libraryBooks) : appService.loadLibraryBooks(),
      ]);

    const library = libraryBooks.length > 0 ? libraryBooks : fetchedLibrary;
      setSettings(settings);
      let opened = false;
      if (checkOpenWithBooks) {
        opened = await handleOpenWithBooks(appService, library);
      }
      setCheckOpenWithBooks(opened);
      if (!opened && checkLastOpenBooks && settings.openLastBooks) {
        opened = await handleOpenLastBooks(appService, settings.lastOpenBooks, library);
      }
      setCheckLastOpenBooks(opened);

      setLibrary(library);
      setLibraryLoaded(true);
      if (loadingTimeout) clearTimeout(loadingTimeout);
      setLoading(false);
    };

    const handleOpenWithBooks = async (appService: AppService, library: Book[]) => {
      const openWithFiles = (await parseOpenWithFiles()) || [];

      if (openWithFiles.length > 0) {
        return await processOpenWithFiles(appService, openWithFiles, library);
      }
      return false;
    };

    initLogin();
    initLibrary();
    return () => {
      setCheckOpenWithBooks(false);
      setCheckLastOpenBooks(false);
      isInitiating.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (demoBooks.length > 0 && libraryLoaded) {
      const newLibrary = [...libraryBooks];
      for (const book of demoBooks) {
        const idx = newLibrary.findIndex((b) => b.hash === book.hash);
        if (idx === -1) {
          newLibrary.push(book);
        } else {
          newLibrary[idx] = book;
        }
      }
      setLibrary(newLibrary);
      appService?.saveLibraryBooks(newLibrary);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoBooks, libraryLoaded]);

  useEffect(() => {
    if (!appService || libraryBooks.length === 0) return;

    const booksWithoutCovers = libraryBooks.filter(
      (book) => !book.coverImageUrl && !book.metadata?.coverImageUrl,
    );

    if (booksWithoutCovers.length === 0) return;

    let isCancelled = false;

    const fetchCoverImages = async () => {
      const results = await Promise.allSettled(
        booksWithoutCovers.map(async (book) => ({
          hash: book.hash,
          coverImageUrl: await appService.generateCoverImageUrl(book),
        })),
      );

      if (isCancelled) return;

      const coverUpdates = new Map<string, string>();

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.coverImageUrl) {
          coverUpdates.set(result.value.hash, result.value.coverImageUrl);
        } else if (result.status === 'rejected') {
          console.warn('Failed to generate cover image:', result.reason);
        }
      });

      if (coverUpdates.size === 0) {
        return;
      }

      const currentLibrary = useLibraryStore.getState().library;
      let hasChanges = false;
      const updatedLibrary = currentLibrary.map((book) => {
        const coverImageUrl = coverUpdates.get(book.hash);
        if (!coverImageUrl || book.coverImageUrl === coverImageUrl) {
          return book;
        }
        hasChanges = true;
        return { ...book, coverImageUrl };
      });

      if (!hasChanges) {
        return;
      }

      setLibrary(updatedLibrary);

      try {
        await appService.saveLibraryBooks(updatedLibrary);
      } catch (error) {
        console.error('Failed to persist library cover updates:', error);
      }
    };

    fetchCoverImages();

    return () => {
      isCancelled = true;
    };
  }, [appService, libraryBooks, setLibrary]);

  const importBooks = async (files: SelectedFile[]) => {
    setLoading(true);
    const failedFiles = [];
    const errorMap: [string, string][] = [
      ['No chapters detected.', _('No chapters detected.')],
      ['Failed to parse EPUB.', _('Failed to parse the EPUB file.')],
      ['Unsupported format.', _('This book format is not supported.')],
    ];
    const { library } = useLibraryStore.getState();
    for (const selectedFile of files) {
      const file = selectedFile.file || selectedFile.path;
      if (!file) continue;
      try {
        const book = await appService?.importBook(file, library);
        setLibrary([...library]);
        if (user && book && !book.uploadedAt && settings.autoUpload) {
          console.log('Uploading book:', book.title);
          handleBookUpload(book);
        }
      } catch (error) {
        const filename = typeof file === 'string' ? file : file.name;
        const baseFilename = getFilename(filename);
        failedFiles.push(baseFilename);
        const errorMessage =
          error instanceof Error
            ? errorMap.find(([substring]) => error.message.includes(substring))?.[1] || ''
            : '';
        eventDispatcher.dispatch('toast', {
          message:
            _('Failed to import book(s): {{filenames}}', {
              filenames: listFormater(false).format(failedFiles),
            }) + (errorMessage ? `\n${errorMessage}` : ''),
          type: 'error',
        });
        console.error('Failed to import book:', filename, error);
      }
    }
    appService?.saveLibraryBooks(library);
    setLoading(false);
  };

  const updateBookTransferProgress = throttle((bookHash: string, progress: ProgressPayload) => {
    if (progress.total === 0) return;
    const progressPct = (progress.progress / progress.total) * 100;
    setBooksTransferProgress((prev) => ({
      ...prev,
      [bookHash]: progressPct,
    }));
  }, 500);

  const handleBookUpload = useCallback(
    async (book: Book) => {
      try {
        await appService?.uploadBook(book, (progress) => {
          updateBookTransferProgress(book.hash, progress);
        });
        await updateBook(envConfig, book);
        pushLibrary();
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: _('Book uploaded: {{title}}', {
            title: book.title,
          }),
        });
        return true;
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('Not authenticated') && settings.keepLogin) {
            settings.keepLogin = false;
            setSettings(settings);
            navigateToLogin(router);
            return false;
          } else if (err.message.includes('Insufficient storage quota')) {
            eventDispatcher.dispatch('toast', {
              type: 'error',
              message: _('Insufficient storage quota'),
            });
            return false;
          }
        }
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Failed to upload book: {{title}}', {
            title: book.title,
          }),
        });
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService],
  );

  const handleBookDownload = useCallback(
    async (book: Book, redownload = false) => {
      try {
        await appService?.downloadBook(book, false, redownload, (progress) => {
          updateBookTransferProgress(book.hash, progress);
        });
        await updateBook(envConfig, book);
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: _('Book downloaded: {{title}}', {
            title: book.title,
          }),
        });
        return true;
      } catch {
        eventDispatcher.dispatch('toast', {
          message: _('Failed to download book: {{title}}', {
            title: book.title,
          }),
          type: 'error',
        });
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService],
  );

  const handleBookDelete = (deleteAction: DeleteAction) => {
    return async (book: Book) => {
      const deletionMessages = {
        both: _('Book deleted: {{title}}', { title: book.title }),
        cloud: _('Deleted cloud backup of the book: {{title}}', { title: book.title }),
        local: _('Deleted local copy of the book: {{title}}', { title: book.title }),
      };
      const deletionFailMessages = {
        both: _('Failed to delete book: {{title}}', { title: book.title }),
        cloud: _('Failed to delete cloud backup of the book: {{title}}', { title: book.title }),
        local: _('Failed to delete local copy of the book: {{title}}', { title: book.title }),
      };
      try {
        await appService?.deleteBook(book, deleteAction);
        await updateBook(envConfig, book);
        pushLibrary();
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: deletionMessages[deleteAction],
        });
        return true;
      } catch {
        eventDispatcher.dispatch('toast', {
          message: deletionFailMessages[deleteAction],
          type: 'error',
        });
        return false;
      }
    };
  };

  const handleUpdateMetadata = async (book: Book, metadata: BookMetadata) => {
    book.metadata = metadata;
    book.title = formatTitle(metadata.title);
    book.author = formatAuthors(metadata.author);
    book.primaryLanguage = getPrimaryLanguage(metadata.language);
    book.updatedAt = Date.now();
    if (metadata.coverImageBlobUrl || metadata.coverImageUrl || metadata.coverImageFile) {
      book.coverImageUrl = metadata.coverImageBlobUrl || metadata.coverImageUrl;
      try {
        await appService?.updateCoverImage(
          book,
          metadata.coverImageBlobUrl || metadata.coverImageUrl,
          metadata.coverImageFile,
        );
      } catch (error) {
        console.warn('Failed to update cover image:', error);
      }
    }
    if (isWebAppPlatform()) {
      // Clear HTTP cover image URL if cover is updated with a local file
      if (metadata.coverImageBlobUrl) {
        metadata.coverImageUrl = undefined;
      }
    } else {
      metadata.coverImageUrl = undefined;
    }
    metadata.coverImageBlobUrl = undefined;
    metadata.coverImageFile = undefined;
    await updateBook(envConfig, book);
  };

  const handleImportBooks = async () => {
    setIsSelectMode(false);
    console.log('Importing books...');
    selectFiles({ type: 'books', multiple: true }).then((result) => {
      if (result.files.length === 0 || result.error) return;
      importBooks(result.files);
    });
  };

  const handleImportFromOPDS = async () => {
    setIsSelectMode(false);
    console.log('Starting OPDS import flow...');
    setShowOPDSUrlDialog(true);
  };

  const handleOPDSUrlSubmit = (url: string) => {
    setOpdsUrl(url);
    setShowOPDSCredentialsDialog(true);
  };

  const handleOPDSCredentialsSubmit = async (username: string, password: string) => {
    setShowOPDSCredentialsDialog(false);
    setOpdsCredentials({ username, password });
    
    // Create OPDS library and shelf
    try {
      const opdsService = new OPDSService();
      const feed = await opdsService.fetchFeed(opdsUrl, { username, password });
      const books = opdsService.getBooks(feed);
      
      // Create library
      const library = opdsLibraryManager.createLibrary(feed, opdsUrl, { username, password });
      opdsLibraryManager.updateLibraryBooks(library.id, books);

        // Create shelf
        const shelf = opdsLibraryManager.createShelf(library.id, library.name);
        setCurrentShelfId(shelf.id);
        setCurrentLibrary(library);

        // Update OPDS libraries list
        const updatedLibraries = opdsLibraryManager.getAllLibraries();
        setOpdsLibraries(updatedLibraries);

        // Navigate to shelf view to show the OPDS library
        setCurrentView('shelf');
    } catch (error) {
      console.error('Failed to create OPDS library:', error);

      // Extract detailed error message
      let errorMessage = '创建OPDS图书馆失败';
      if (error instanceof Error) {
        // If it's a network error (API route not found), provide helpful guidance
        if (error.message.includes('404') || error.message.includes('Not Found')) {
          errorMessage = '无法访问OPDS代理服务。请确保应用程序正确安装。';
        } else if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
          errorMessage = '网络连接失败。请检查URL和网络连接。';
        } else {
          // Include the actual error message for debugging
          errorMessage = `创建OPDS图书馆失败: ${error.message}`;
        }
      }

      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
        timeout: 10000, // Show error longer for debugging
      });
    }
  };

  const handleTryOPDSWithoutAuth = async () => {
    setShowOPDSCredentialsDialog(false);
    setOpdsCredentials(undefined);

    // Try to create OPDS library without credentials
    try {
      console.log('Trying OPDS without authentication for:', opdsUrl);
      const opdsService = new OPDSService();
      const feed = await opdsService.fetchFeed(opdsUrl); // No credentials
      const books = opdsService.getBooks(feed);

      // Create library
      const library = opdsLibraryManager.createLibrary(feed, opdsUrl);
      opdsLibraryManager.updateLibraryBooks(library.id, books);

      // Create shelf
      const shelf = opdsLibraryManager.createShelf(library.id, library.name);
      setCurrentShelfId(shelf.id);
      setCurrentLibrary(library);

      // Update OPDS libraries list
      const updatedLibraries = opdsLibraryManager.getAllLibraries();
      setOpdsLibraries(updatedLibraries);

      // Navigate to shelf view to show the OPDS library
      setCurrentView('shelf');

      eventDispatcher.dispatch('toast', {
        message: `成功连接到OPDS书库: ${library.name}`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to create OPDS library without auth:', error);

      // If it fails, fall back to showing the library view for manual testing
      setShowOPDSLibraryView(true);

      let errorMessage = '连接OPDS书库失败';
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Authentication') || error.message.includes('认证')) {
          errorMessage = '此OPDS服务器需要身份验证。请返回提供用户名和密码。';
        } else {
          errorMessage = `连接失败: ${error.message}`;
        }
      }

      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'warning',
        timeout: 8000,
      });
    }
  };

  const handleOpenOPDSLibrary = async (library: OPDSLibrary) => {
    try {
      setOpdsUrl(library.url);
      setOpdsCredentials(library.credentials);
      setCurrentLibrary(library);

      // Get the shelf for this library
      const shelf = opdsLibraryManager.getShelfByLibraryId(library.id);
      if (shelf) {
        setCurrentShelfId(shelf.id);
        setCurrentView('shelf');
      } else {
        // If no shelf exists, show the library view as modal for setup
        setShowOPDSLibraryView(true);
      }
    } catch (error) {
      console.error('Failed to open OPDS library:', error);
      eventDispatcher.dispatch('toast', {
        message: '打开OPDS图书馆失败',
        type: 'error',
      });
    }
  };

  const handleDeleteOPDSLibrary = async (library: OPDSLibrary) => {
    try {
      opdsLibraryManager.deleteLibrary(library.id);
      // Update the OPDS libraries list
      setOpdsLibraries(opdsLibraryManager.getAllLibraries());
      eventDispatcher.dispatch('toast', {
        message: `已删除OPDS书库: ${library.name}`,
        type: 'info',
        timeout: 3000,
      });
    } catch (error) {
      console.error('Failed to delete OPDS library:', error);
      eventDispatcher.dispatch('toast', {
        message: '删除OPDS书库失败',
        type: 'error',
      });
    }
  };

  const handleOPDSBookDownload = async (book: OPDSBook) => {
    console.log('Downloading OPDS book:', book.title);
    const opdsService = new OPDSService();

    try {
      // Download the book file
      const arrayBuffer = await opdsService.downloadBook(book, opdsCredentials);

      // Create a temporary file-like object
      const blob = new Blob([arrayBuffer]);
      const file = new File([blob], `${book.title}.epub`, { type: 'application/epub+zip' });

      // Import the book using the existing import functionality
      await importBooks([{ file }]);

      // Add to OPDS shelf if we have a current shelf
      if (currentShelfId) {
        const { library } = useLibraryStore.getState();
        const downloadedBook = library.find(b => b.title === book.title);
        if (downloadedBook) {
          opdsLibraryManager.addDownloadedBook(currentShelfId, downloadedBook);
        }
      }

      console.log('OPDS book imported successfully:', book.title);
    } catch (error) {
      console.error('Failed to download OPDS book:', error);
      throw error;
    }
  };

  const handleSetSelectMode = (selectMode: boolean) => {
    if (selectMode && appService?.hasHaptics) {
      impactFeedback('medium');
    }
    setIsSelectMode(selectMode);
    setIsSelectAll(false);
    setIsSelectNone(false);
  };

  const handleSelectAll = () => {
    setIsSelectAll(true);
    setIsSelectNone(false);
  };

  const handleDeselectAll = () => {
    setIsSelectNone(true);
    setIsSelectAll(false);
  };

  const handleShowDetailsBook = (book: Book) => {
    setShowDetailsBook(book);
  };

  const shouldShowSkeleton =
    !appServiceReady || !appService || !insets;

  const isInitializing = checkOpenWithBooks || checkLastOpenBooks;

  if (shouldShowSkeleton) {
    return (
      <div
        className={clsx(
          'flex h-[100vh] w-full items-center justify-center',
          !appService?.isLinuxApp && 'bg-base-200',
        )}
      >
        <span className='loading loading-dots loading-lg'></span>
        <span className='sr-only'>{_('Loading...')}</span>
      </div>
    );
  }

  const showBookshelf = libraryLoaded || libraryBooks.length > 0;

  return (
    <div
      ref={pageRef}
      aria-label='VL-Arch Library'
      className={clsx(
        'library-page bg-base-200 text-base-content flex select-none flex-col overflow-hidden min-h-0',
        appService?.isIOSApp ? 'h-[100vh]' : 'h-dvh',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className='top-0 z-40 w-full'
        role='banner'
        tabIndex={-1}
        aria-label={_('Library Header')}
      >
        <LibraryHeader
          isSelectMode={isSelectMode}
          isSelectAll={isSelectAll}
          onImportBooks={handleImportBooks}
          onImportFromOPDS={handleImportFromOPDS}
          onToggleSelectMode={() => handleSetSelectMode(!isSelectMode)}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      </div>
      {(loading || isInitializing) && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-base-200/80 backdrop-blur-sm'>
          <Spinner loading />
        </div>
      )}
      {currentView === 'home' && showBookshelf &&
        (libraryBooks.some((book) => !book.deletedAt) ? (
          <OverlayScrollbarsComponent
            defer
            aria-label=''
            ref={osRef}
            className='flex-grow min-h-0 overflow-y-auto overflow-x-hidden'
            options={{ 
              scrollbars: { 
                autoHide: 'scroll'
              }
            }}
            events={{
              initialized: (instance) => {
                const { content } = instance.elements();
                if (content) {
                  containerRef.current = content as HTMLDivElement;
                }
              },
            }}
          >
            <div
              className={clsx(
                'scroll-container drop-zone flex-grow min-h-0 overflow-y-auto overflow-x-hidden',
                isDragging && 'drag-over',
              )}
              style={{
                paddingTop: '0px',
                paddingRight: `${insets.right}px`,
                paddingBottom: `${insets.bottom}px`,
                paddingLeft: `${insets.left}px`,
              }}
            >
              <DropIndicator />
              <Bookshelf
                libraryBooks={libraryBooks}
                isSelectMode={isSelectMode}
                isSelectAll={isSelectAll}
                isSelectNone={isSelectNone}
                handleImportBooks={handleImportBooks}
                handleBookUpload={handleBookUpload}
                handleBookDownload={handleBookDownload}
                handleBookDelete={handleBookDelete('both')}
                handleSetSelectMode={handleSetSelectMode}
                handleShowDetailsBook={handleShowDetailsBook}
                booksTransferProgress={booksTransferProgress}
                opdsLibraries={opdsLibraries}
                onOpenOPDSLibrary={handleOpenOPDSLibrary}
                onDeleteOPDSLibrary={handleDeleteOPDSLibrary}
              />
            </div>
          </OverlayScrollbarsComponent>
        ) : (
          <div className='hero drop-zone h-screen items-center justify-center'>
            <DropIndicator />
            <div className='hero-content text-neutral-content text-center'>
              <div className='max-w-md'>
                <h1 className='mb-5 text-5xl font-bold'>{_('VL-Arch Library')}</h1>
                <p className='mb-5'>
                  {_(
                    'Welcome to VL-Arch. You can import your books here and read them anytime.',
                  )}
                </p>
                <button className='btn btn-primary rounded-xl' onClick={handleImportBooks}>
                  {_('Import Books')}
                </button>
              </div>
            </div>
          </div>
        ))}
      {currentView === 'shelf' && currentShelfId && (
        <div className='flex-grow flex flex-col min-h-0'>
          <div className='flex items-center gap-4 p-4 bg-base-200 border-b border-base-300'>
            <button
              onClick={() => setCurrentView('home')}
              className='btn btn-ghost btn-sm'
            >
              ← {_('Back to Library')}
            </button>
            <h1 className='text-xl font-semibold'>{currentLibrary?.name || _('OPDS Library')}</h1>
          </div>
          <OverlayScrollbarsComponent
            ref={osRef}
            defer
            aria-label=''
            className='flex-grow min-h-0 overflow-y-auto overflow-x-hidden'
            options={{ 
              scrollbars: { 
                autoHide: 'scroll'
              }
            }}
          >
            <div
              className='scroll-container flex-grow min-h-0 overflow-y-auto overflow-x-hidden p-4'
              style={{
                paddingTop: '16px',
                paddingRight: `${insets.right + 16}px`,
                paddingBottom: `${insets.bottom + 16}px`,
                paddingLeft: `${insets.left + 16}px`,
              }}
            >
              <OPDSShelfMainView
                ref={opdsShelfRef}
                shelfId={currentShelfId}
                onBookDownload={handleOPDSBookDownload}
                onBackToHome={() => setCurrentView('home')}
              />
            </div>
          </OverlayScrollbarsComponent>
        </div>
      )}
      {showDetailsBook && (
        <BookDetailModal
          isOpen={!!showDetailsBook}
          book={showDetailsBook}
          onClose={() => setShowDetailsBook(null)}
          handleBookUpload={handleBookUpload}
          handleBookDownload={handleBookDownload}
          handleBookDelete={handleBookDelete('both')}
          handleBookDeleteCloudBackup={handleBookDelete('cloud')}
          handleBookDeleteLocalCopy={handleBookDelete('local')}
          handleBookMetadataUpdate={handleUpdateMetadata}
        />
      )}
      <AboutWindow />
      <UpdaterWindow />
      <Toast />
      <OPDSUrlDialog
        isOpen={showOPDSUrlDialog}
        onClose={() => setShowOPDSUrlDialog(false)}
        onSubmit={handleOPDSUrlSubmit}
      />
      <OPDSCredentialsDialog
        isOpen={showOPDSCredentialsDialog}
        url={opdsUrl}
        onClose={() => setShowOPDSCredentialsDialog(false)}
        onSubmit={handleOPDSCredentialsSubmit}
        onTryWithoutAuth={handleTryOPDSWithoutAuth}
      />
      <OPDSLibraryView
        isOpen={showOPDSLibraryView}
        initialUrl={opdsUrl}
        credentials={opdsCredentials}
        onClose={() => {
          setShowOPDSLibraryView(false);
          if (currentShelfId) {
            setCurrentView('shelf');
          }
        }}
        onBookDownload={handleOPDSBookDownload}
      />
      <OPDSShelfView
        isOpen={showOPDSShelfView}
        shelfId={currentShelfId}
        onClose={() => setShowOPDSShelfView(false)}
        onBookDownload={handleOPDSBookDownload}
      />
    </div>
  );
};

const LibraryPage = () => {
  return (
    <Suspense fallback={<div className='h-[100vh]' />}>
      <LibraryPageWithSearchParams />
    </Suspense>
  );
};

export default LibraryPage;
