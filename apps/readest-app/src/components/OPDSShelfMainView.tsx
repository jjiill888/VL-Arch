import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MdDownload, MdInfo, MdRefresh, MdBook, MdBookmark, MdSort, MdFolder, MdArrowForward, MdHome } from 'react-icons/md';
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
import { Book } from '@/types/book';
import { LibrarySortByType } from '@/types/settings';

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
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [navigationItems, setNavigationItems] = useState<OPDSNavigationItem[]>([]);
  const [availableBooks, setAvailableBooks] = useState<OPDSBook[]>([]);
  const [downloadedBooks, setDownloadedBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<LibrarySortByType>('created'); // Default to "Recently Added"
  const [isAscending, setIsAscending] = useState(false); // Default to descending (newest first)
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{title: string, url: string}>>([]);

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
    setDownloadedBooks(shelfData.books);

    // Load root OPDS feed inline to avoid circular dependency
    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeed(libraryData.url, libraryData.credentials);
      setCurrentFeed(feed);
      setCurrentUrl(libraryData.url);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);

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
      const feed = await opdsService.fetchFeed(library.url, library.credentials);
      setCurrentFeed(feed);
      setCurrentUrl(library.url);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);

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
      const feed = await opdsService.fetchFeed(item.href, library.credentials);
      setCurrentFeed(feed);
      setCurrentUrl(item.href);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);

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
      const feed = await opdsService.fetchFeed(targetBreadcrumb.url, library.credentials);
      setCurrentFeed(feed);
      setCurrentUrl(targetBreadcrumb.url);

      // Get navigation items and books from the feed
      const feedNavigation = opdsService.getNavigationItems(feed);
      const feedBooks = opdsService.getBooks(feed);

      setNavigationItems(feedNavigation);
      setAvailableBooks(feedBooks);

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

  const handleBookDownload = async (book: OPDSBook) => {
    if (downloadingBooks.has(book.id)) return;

    setDownloadingBooks(prev => new Set(prev).add(book.id));

    try {
      await onBookDownload(book);
      eventDispatcher.dispatch('toast', {
        message: _('Book imported successfully: {{title}}', { title: book.title }),
        type: 'success',
      });
      // Reload shelf data to update downloaded books
      loadShelfData();
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

  // Sort downloaded books
  const sortedDownloadedBooks = useMemo(() => {
    return [...downloadedBooks].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'author':
          aValue = a.authors?.[0]?.toLowerCase() || '';
          bValue = b.authors?.[0]?.toLowerCase() || '';
          break;
        case 'created':
          aValue = a.createdAt || 0;
          bValue = b.createdAt || 0;
          break;
        case 'updated':
          aValue = a.updatedAt || 0;
          bValue = b.updatedAt || 0;
          break;
        case 'format':
          aValue = a.format?.toLowerCase() || '';
          bValue = b.format?.toLowerCase() || '';
          break;
        default:
          aValue = a.createdAt || 0;
          bValue = b.createdAt || 0;
      }

      if (aValue < bValue) return isAscending ? -1 : 1;
      if (aValue > bValue) return isAscending ? 1 : -1;
      return 0;
    });
  }, [downloadedBooks, sortBy, isAscending]);

  // Sort available books
  const sortedAvailableBooks = useMemo(() => {
    return [...availableBooks].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'author':
          aValue = a.authors?.[0]?.toLowerCase() || '';
          bValue = b.authors?.[0]?.toLowerCase() || '';
          break;
        case 'created':
        case 'updated':
          // For OPDS books, use published date or fall back to title
          aValue = a.published ? new Date(a.published).getTime() : a.title?.toLowerCase() || '';
          bValue = b.published ? new Date(b.published).getTime() : b.title?.toLowerCase() || '';
          break;
        case 'format':
          // Use the first download link's format
          aValue = a.downloadLinks?.[0]?.type?.toLowerCase() || '';
          bValue = b.downloadLinks?.[0]?.type?.toLowerCase() || '';
          break;
        default:
          aValue = a.published ? new Date(a.published).getTime() : 0;
          bValue = b.published ? new Date(b.published).getTime() : 0;
      }

      if (aValue < bValue) return isAscending ? -1 : 1;
      if (aValue > bValue) return isAscending ? 1 : -1;
      return 0;
    });
  }, [availableBooks, sortBy, isAscending]);

  const sortByOptions = [
    { label: _('Title'), value: 'title' },
    { label: _('Author'), value: 'author' },
    { label: _('Date Added'), value: 'created' },
    { label: _('Date Published'), value: 'updated' },
    { label: _('Format'), value: 'format' },
  ];

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
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h2 className='text-2xl font-bold text-base-content'>{shelf?.name}</h2>
          {/* Breadcrumb navigation */}
          {breadcrumbs.length > 0 && (
            <div className='flex items-center gap-2 mt-2'>
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className='flex items-center gap-2'>
                  {index > 0 && <MdArrowForward className='text-base-content/40' />}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className='text-sm text-primary hover:underline'
                  >
                    {crumb.title}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className='text-base-content/70 mt-1'>
            {downloadedBooks.length} downloaded • {availableBooks.length} available • {navigationItems.length} categories
          </p>
        </div>
        <button
          onClick={refreshLibrary}
          disabled={loading}
          className='btn btn-outline btn-sm gap-2'
        >
          <MdRefresh className={loading ? 'animate-spin' : ''} />
          {_('Refresh')}
        </button>
      </div>

      <div className='flex-grow'>
        {/* Navigation categories */}
        {navigationItems.length > 0 && (
          <div className='mb-8'>
            <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
              <MdFolder className='text-secondary' />
              {_('Browse Categories')}
            </h3>
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigationClick(item)}
                  className='bg-base-100 rounded-lg shadow hover:shadow-lg transition-shadow p-4 text-left hover:bg-base-200'
                >
                  <div className='flex items-center gap-3'>
                    <div className='w-12 h-12 bg-secondary/20 rounded-lg flex items-center justify-center'>
                      <MdFolder className='text-2xl text-secondary' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='font-semibold text-sm text-base-content'>{item.title}</h4>
                      {item.summary && (
                        <p className='text-xs text-base-content/70 mt-1 line-clamp-2'>
                          {item.summary}
                        </p>
                      )}
                    </div>
                    <MdArrowForward className='text-base-content/40' />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Downloaded books */}
        {sortedDownloadedBooks.length > 0 && (
          <div className='mb-8'>
            <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
              <MdBookmark className='text-primary' />
              {_('Downloaded Books')}
            </h3>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
              {sortedDownloadedBooks.map((book) => (
                <div key={book.hash} className='bg-base-100 rounded-lg shadow hover:shadow-lg transition-shadow p-3'>
                  <div className='aspect-[3/4] bg-base-300 rounded mb-2 flex items-center justify-center'>
                    <MdBook className='text-3xl text-base-content/50' />
                  </div>
                  <h4 className='font-semibold text-sm truncate' title={book.title}>
                    {book.title}
                  </h4>
                  <p className='text-xs text-base-content/70 truncate'>
                    {book.authors?.join(', ')}
                  </p>
                  <div className='mt-2'>
                    <span className='text-xs bg-success text-success-content px-2 py-1 rounded'>
                      {_('Downloaded')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available books */}
        {sortedAvailableBooks.length > 0 && (
          <div className='mb-8'>
            <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
              <MdBook className='text-secondary' />
              {_('Available Books')}
            </h3>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
              {sortedAvailableBooks.map((book) => {
                const isDownloaded = downloadedBooks.some(db => db.title === book.title && db.authors?.join(', ') === book.authors.join(', '));
                const isDownloading = downloadingBooks.has(book.id);

                return (
                  <div key={book.id} className='bg-base-100 rounded-lg shadow hover:shadow-lg transition-shadow p-3'>
                    <div className='aspect-[3/4] bg-base-300 rounded mb-2 flex items-center justify-center'>
                      {book.coverImageUrl ? (
                        <img
                          src={book.coverImageUrl}
                          alt={book.title}
                          className='w-full h-full object-cover rounded'
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <MdBook className='text-3xl text-base-content/50' />
                      )}
                    </div>
                    <h4 className='font-semibold text-sm truncate' title={book.title}>
                      {book.title}
                    </h4>
                    <p className='text-xs text-base-content/70 truncate'>
                      {book.authors.join(', ')}
                    </p>
                    {book.summary && (
                      <p className='text-xs text-base-content/60 mt-1 line-clamp-2'>
                        {book.summary}
                      </p>
                    )}
                    <div className='mt-2'>
                      {isDownloaded ? (
                        <span className='text-xs bg-success text-success-content px-2 py-1 rounded'>
                          {_('Downloaded')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBookDownload(book)}
                          disabled={isDownloading}
                          className='btn btn-primary btn-xs w-full gap-1'
                        >
                          {isDownloading ? (
                            <Spinner loading size='xs' />
                          ) : (
                            <MdDownload />
                          )}
                          {isDownloading ? _('Downloading...') : _('Download')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {navigationItems.length === 0 && availableBooks.length === 0 && downloadedBooks.length === 0 && !loading && (
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