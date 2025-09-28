import React, { useState, useEffect, useCallback } from 'react';
import { MdDownload, MdInfo, MdRefresh, MdBook, MdFolder, MdArrowForward } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import Spinner from './Spinner';
import {
  OPDSService,
  OPDSBook,
  OPDSNavigationItem,
  OPDSFeed,
  opdsLibraryManager,
  OPDSLibraryShelf,
  OPDSLibrary
} from '@/services/opds';

interface OPDSShelfMainViewProps {
  shelfId: string;
  onBookDownload: (book: OPDSBook) => Promise<void>;
}

const OPDSShelfMainView: React.FC<OPDSShelfMainViewProps> = ({
  shelfId,
  onBookDownload,
}) => {
  const _ = useTranslation();
  const [opdsService] = useState(() => new OPDSService());

  const [shelf, setShelf] = useState<OPDSLibraryShelf | null>(null);
  const [library, setLibrary] = useState<OPDSLibrary | null>(null);
  const [currentFeed, setCurrentFeed] = useState<OPDSFeed | null>(null);
  const [navigationItems, setNavigationItems] = useState<OPDSNavigationItem[]>([]);
  const [availableBooks, setAvailableBooks] = useState<OPDSBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{title: string, url: string}>>([]);

  // OPDS Standard Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);

  const loadShelfData = useCallback(async () => {
    const shelfData = opdsLibraryManager.getShelf(shelfId);
    if (!shelfData) {
      setError('Shelf not found');
      return;
    }

    setShelf(shelfData);

    const libraryData = opdsLibraryManager.getLibrary(shelfData.libraryId);
    if (!libraryData) {
      setError('Library not found');
      return;
    }

    setLibrary(libraryData);

    // Load first page of OPDS feed
    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(libraryData.url, libraryData.credentials);
      setCurrentFeed(feed);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);
      setCurrentPage(1); // Reset to first page when loading new data

      // Set up OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

      // Set up initial breadcrumb
      setBreadcrumbs([{ title: libraryData.name, url: libraryData.url }]);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load OPDS feed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [shelfId, opdsService]);

  const refreshLibrary = useCallback(async () => {
    if (!library) return;

    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(library.url, library.credentials);
      setCurrentFeed(feed);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);
      setCurrentPage(1); // Reset to first page when refreshing

      // Set up OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

      // Reset to root breadcrumb
      setBreadcrumbs([{ title: library.name, url: library.url }]);

      eventDispatcher.dispatch('toast', {
        message: _('Library refreshed successfully'),
        type: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh library';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [library, opdsService, _]);

  const handleNavigationClick = useCallback(async (item: OPDSNavigationItem) => {
    if (!library) return;

    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(item.href, library.credentials);
      setCurrentFeed(feed);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);
      setCurrentPage(1); // Reset to first page when navigating

      // Set up OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

      // Add to breadcrumbs
      setBreadcrumbs(prev => [...prev, { title: item.title, url: item.href }]);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load OPDS feed';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [library, opdsService]);

  const handleBreadcrumbClick = useCallback(async (index: number) => {
    if (!library) return;
    const targetBreadcrumb = breadcrumbs[index];
    if (!targetBreadcrumb) return;

    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(targetBreadcrumb.url, library.credentials);
      setCurrentFeed(feed);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);
      setCurrentPage(1); // Reset to first page when using breadcrumbs

      // Set up OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

      // Trim breadcrumbs to current position
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load OPDS feed';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [breadcrumbs, library, opdsService]);

  // Load next/previous page using OPDS standard pagination
  const loadNextPage = useCallback(async () => {
    if (!library || !currentFeed?.nextLink || loadingPage) return;

    setLoadingPage(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(currentFeed.nextLink!, library.credentials);
      setCurrentFeed(feed);
      
      // Get books from the feed
      const feedBooks = opdsService.getBooks(feed);
      setAvailableBooks(feedBooks);
      setCurrentPage(prev => prev + 1);

      // Update OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load next page';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoadingPage(false);
    }
  }, [library, currentFeed, opdsService, loadingPage, _]);

  const loadPrevPage = useCallback(async () => {
    if (!library || !currentFeed?.prevLink || loadingPage) return;

    setLoadingPage(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeedByLink(currentFeed.prevLink!, library.credentials);
      setCurrentFeed(feed);
      
      // Get books from the feed
      const feedBooks = opdsService.getBooks(feed);
      setAvailableBooks(feedBooks);
      setCurrentPage(prev => prev - 1);

      // Update OPDS standard pagination info
      setHasNextPage(!!feed.nextLink);
      setHasPrevPage(!!feed.prevLink);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load previous page';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoadingPage(false);
    }
  }, [library, currentFeed, opdsService, loadingPage, _]);

  const handleBookDownload = async (book: OPDSBook) => {
    if (downloadingBooks.has(book.id)) return;

    setDownloadingBooks(prev => new Set(prev).add(book.id));

    try {
      await onBookDownload(book);
      eventDispatcher.dispatch('toast', {
        message: _('Book imported successfully: {{title}}', { title: book.title }),
        type: 'success',
      });
      // Don't reload shelf data to avoid returning to main directory
      // Force a re-render to update downloaded books status
      setAvailableBooks([...availableBooks]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download book';
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setDownloadingBooks(prev => {
        const newSet = new Set(prev);
        newSet.delete(book.id);
        return newSet;
      });
    }
  };

  useEffect(() => {
    if (shelfId) {
      loadShelfData();
    }
  }, [shelfId, loadShelfData]);

  // OPDS Standard pagination navigation functions
  const handleNextPage = useCallback(() => {
    loadNextPage();
  }, [loadNextPage]);

  const handlePreviousPage = useCallback(() => {
    loadPrevPage();
  }, [loadPrevPage]);

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousPage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNextPage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNextPage, handlePreviousPage]);


  if (error) {
    return (
      <div className='flex flex-col items-center justify-center h-full text-center p-8'>
        <MdInfo className='text-6xl text-error mb-4' />
        <h3 className='text-xl font-semibold mb-2'>{_('Error')}</h3>
        <p className='text-base-content/70 mb-4'>{error}</p>
        <button
          onClick={loadShelfData}
          className='btn btn-primary'
        >
          {_('Retry')}
        </button>
      </div>
    );
  }

  if (!shelf || !library) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Spinner loading />
      </div>
    );
  }

  return (
    <div className='h-full flex flex-col'>
      {/* Header with breadcrumbs */}
      <div className='mb-4'>
        {/* Main title and refresh button */}
        <div className='flex items-center justify-between mb-2'>
          <h2 className='text-xl font-bold text-base-content'>{shelf?.name}</h2>
          <button
            onClick={refreshLibrary}
            disabled={loading}
            className='btn btn-outline btn-sm gap-2'
          >
            <MdRefresh className={loading ? 'animate-spin' : ''} />
            {_('Refresh')}
          </button>
        </div>
        
        {/* Breadcrumb navigation */}
        {breadcrumbs.length > 0 && (
          <div className='flex items-center gap-2 mb-2 text-sm'>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className='flex items-center gap-2'>
                {index > 0 && <MdArrowForward className='text-base-content/40' size={14} />}
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className='text-primary hover:underline hover:text-primary/80 transition-colors'
                >
                  {crumb.title}
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Statistics and pagination info */}
        <div className='flex flex-wrap items-center gap-3 text-xs text-base-content/70'>
          <div className='flex items-center gap-1'>
            <span className='font-medium'>{availableBooks.length}</span>
            <span>{_('books on this page')}</span>
          </div>
          <div className='flex items-center gap-1'>
            <span className='font-medium'>{availableBooks.filter(book => opdsLibraryManager.isBookDownloaded(shelfId, book.id) || opdsLibraryManager.isOPDSBookInLocalLibrary(book)).length}</span>
            <span>{_('downloaded')}</span>
          </div>
          {navigationItems.length > 0 && (
            <div className='flex items-center gap-1'>
              <span className='font-medium'>{navigationItems.length}</span>
              <span>{_('categories')}</span>
            </div>
          )}
          <div className='flex items-center gap-1'>
            <span className='font-medium'>{_('Page')} {currentPage}</span>
          </div>
        </div>
      </div>

      <div className='flex-grow'>
        {/* Navigation categories */}
        {navigationItems.length > 0 && (
          <div className='mb-4'>
            <h3 className='text-base font-semibold mb-2 flex items-center gap-2'>
              <MdFolder className='text-secondary' />
              {_('Browse Categories')}
            </h3>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2'>
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigationClick(item)}
                  className='bg-base-100 rounded-lg shadow hover:shadow-lg transition-shadow p-2 text-left hover:bg-base-200'
                >
                  <div className='flex items-center gap-2'>
                    <div className='w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center'>
                      <MdFolder className='text-lg text-secondary' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <h4 className='font-semibold text-xs text-base-content truncate'>{item.title}</h4>
                    </div>
                    <MdArrowForward className='text-base-content/40 text-sm' />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}


        {/* Available books */}
        {availableBooks.length > 0 && (
          <div className='mb-4'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-base font-semibold flex items-center gap-2'>
                <MdBook className='text-secondary' />
                {_('Available Books')}
              </h3>
              {loadingPage && (
                <div className='flex items-center gap-2 text-sm text-base-content/70'>
                  <Spinner loading />
                  <span>{_('Loading page...')}</span>
                </div>
              )}
            </div>
            <div className='max-w-7xl mx-auto'>
              <div className='grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-3'>
              {availableBooks.map((book) => {
                const isDownloaded = opdsLibraryManager.isBookDownloaded(shelfId, book.id) || opdsLibraryManager.isOPDSBookInLocalLibrary(book);
                const isDownloading = downloadingBooks.has(book.id);

                return (
                  <div key={book.id} className='bg-base-100 rounded-lg shadow hover:shadow-lg transition-shadow p-2 h-fit'>
                    <div className='aspect-[28/41] bg-base-300 rounded mb-2 flex items-center justify-center'>
                      <MdBook className='w-8 h-8 text-base-content/30' />
                    </div>
                    <div className='space-y-1'>
                      <h4 className='font-semibold text-xs line-clamp-2 min-h-[2rem]' title={book.title}>
                        {book.title}
                      </h4>
                      <p className='text-xs text-base-content/70 line-clamp-1'>
                        {book.authors.join(', ')}
                      </p>
                      <div className='pt-1'>
                        {isDownloaded ? (
                          <span className='text-xs bg-success text-success-content px-2 py-1 rounded block text-center'>
                            {_('Downloaded')}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleBookDownload(book)}
                            disabled={isDownloading}
                            className='btn btn-primary btn-xs w-full gap-1'
                          >
                            {isDownloading ? (
                              <Spinner loading />
                            ) : (
                              <MdDownload />
                            )}
                            {isDownloading ? _('Downloading...') : _('Download')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            {/* Bottom pagination controls */}
            {(hasNextPage || hasPrevPage) && (
              <div className='mt-4 pt-4 border-t border-base-300 flex items-center justify-center gap-3'>
                <button
                  onClick={handlePreviousPage}
                  disabled={!hasPrevPage || loadingPage}
                  className='btn btn-outline btn-sm shadow-lg'
                >
                  ← {_('上一页')}
                </button>

                <div className='flex items-center gap-2 text-xs text-base-content/70 bg-base-100 px-2 py-1 rounded shadow'>
                  <span>{_('第')} {currentPage} {_('页')}</span>
                </div>

                <button
                  onClick={handleNextPage}
                  disabled={!hasNextPage || loadingPage}
                  className='btn btn-primary btn-sm shadow-lg'
                >
                  {_('下一页')} →
                </button>
              </div>
            )}

            {/* Keyboard navigation hint */}
            {(hasNextPage || hasPrevPage) && (
              <div className='mt-2 text-center pb-4'>
                <div className='text-xs text-base-content/50'>
                  {_('使用左右方向键翻页')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {navigationItems.length === 0 && availableBooks.length === 0 && !loading && (
          <div className='flex flex-col items-center justify-center h-full text-center'>
            <MdBook className='text-6xl text-base-content/30 mb-4' />
            <h3 className='text-xl font-semibold mb-2'>{_('No Content')}</h3>
            <p className='text-base-content/70 mb-4'>
              {_('This OPDS feed appears to be empty. Try refreshing to reload content.')}
            </p>
            <button
              onClick={refreshLibrary}
              className='btn btn-primary'
            >
              {_('Refresh Library')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OPDSShelfMainView;