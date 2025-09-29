import React, { useState, useEffect, useCallback } from 'react';
import { MdDownload, MdInfo, MdRefresh, MdBook } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { useBackHandler } from '@/hooks/useBackHandler';
import { eventDispatcher } from '@/utils/event';
import Dialog from './Dialog';
import Spinner from './Spinner';
import {
  OPDSService,
  OPDSFeed,
  OPDSBook,
  OPDSNavigationItem,
  OPDSCredentials
} from '@/services/opds';

interface OPDSLibraryViewProps {
  isOpen: boolean;
  initialUrl: string;
  credentials?: OPDSCredentials;
  onClose: () => void;
  onBookDownload: (book: OPDSBook) => Promise<void>;
}

interface BreadcrumbItem {
  title: string;
  url: string;
}

const OPDSLibraryView: React.FC<OPDSLibraryViewProps> = ({
  isOpen,
  initialUrl,
  credentials,
  onClose,
  onBookDownload,
}) => {
  const _ = useTranslation();
  const [opdsService] = useState(() => new OPDSService());

  const [currentFeed, setCurrentFeed] = useState<OPDSFeed | null>(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [books, setBooks] = useState<OPDSBook[]>([]);
  const [navigationItems, setNavigationItems] = useState<OPDSNavigationItem[]>([]);
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());

  // Cover image cache (book ID -> object URL)
  const [coverCache, setCoverCache] = useState<Map<string, string>>(new Map());

  const loadFeed = useCallback(async (url: string, addToBreadcrumbs: boolean = true) => {
    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeed(url, credentials);
      setCurrentFeed(feed);
      setCurrentUrl(url);

      const feedBooks = opdsService.getBooks(feed);
      const feedNavigation = opdsService.getNavigationItems(feed);

      setBooks(feedBooks);
      setNavigationItems(feedNavigation);

      if (addToBreadcrumbs) {
        setBreadcrumbs(prev => [...prev, { title: feed.title, url }]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载OPDS feed失败';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [opdsService, credentials]);

  const handleNavigationClick = (item: OPDSNavigationItem) => {
    loadFeed(item.href);
  };

  const handleBreadcrumbClick = useCallback((index: number) => {
    const targetBreadcrumb = breadcrumbs[index];
    if (targetBreadcrumb) {
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      loadFeed(targetBreadcrumb.url, false);
    }
  }, [breadcrumbs, loadFeed]);

  const handleBookDownload = async (book: OPDSBook) => {
    if (downloadingBooks.has(book.id)) return;

    setDownloadingBooks(prev => new Set(prev).add(book.id));

    try {
      await onBookDownload(book);
      eventDispatcher.dispatch('toast', {
        message: _('Book imported successfully: {{title}}', { title: book.title }),
        type: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载书籍失败';
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

  const handleRefresh = () => {
    loadFeed(currentUrl, false);
  };

  const handleClose = useCallback(() => {
    setCurrentFeed(null);
    setBreadcrumbs([]);
    setBooks([]);
    setNavigationItems([]);
    setError('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen && initialUrl) {
      setBreadcrumbs([]);
      loadFeed(initialUrl);
    }
  }, [isOpen, initialUrl, loadFeed]);

  // Load cover images when books change
  useEffect(() => {
    let canceled = false;

    async function loadCovers() {
      if (!credentials || books.length === 0) return;

      const newCovers = new Map(coverCache);

      for (const book of books) {
        if (!book.coverImageUrl || newCovers.has(book.id)) continue;

        try {
          const blob = await opdsService.fetchImage(book.coverImageUrl, credentials);
          if (canceled) return;
          newCovers.set(book.id, URL.createObjectURL(blob));
        } catch (err) {
          console.warn('加载封面失败:', book.title, err);
        }
      }

      if (!canceled) {
        setCoverCache(newCovers);
      }
    }

    loadCovers();

    return () => {
      canceled = true;
    };
  }, [books, credentials, opdsService]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      coverCache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Handle Android back button navigation
  const handleBackNavigation = useCallback(() => {
    if (breadcrumbs.length > 1) {
      // Go back to previous breadcrumb
      handleBreadcrumbClick(breadcrumbs.length - 2);
    } else {
      // Close the dialog if at root level
      handleClose();
    }
  }, [breadcrumbs, handleBreadcrumbClick, handleClose]);

  // Use back handler hook
  useBackHandler({
    enabled: isOpen,
    onBack: handleBackNavigation,
  });

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return _('Unknown Author');
    if (authors.length === 1) return authors[0] || '';
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0] || ''} & ${authors.length - 1} ${_('others')}`;
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={currentFeed?.title ?? _('OPDS Library')}
      className="opds-library-view"
      contentClassName="px-0"
    >
      <div className="flex flex-col h-full">
        {/* Header with breadcrumbs and controls */}
        <div className="px-6 pb-4 border-b border-base-300">
          {breadcrumbs.length > 1 && (
            <div className="flex items-center gap-2 mb-3 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className="text-base-content/50">/</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`hover:text-primary ${
                      index === breadcrumbs.length - 1
                        ? 'text-base-content font-medium'
                        : 'text-base-content/70'
                    }`}
                    disabled={loading}
                  >
                    {crumb.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-base-content/70">
              {books.length > 0 && `${books.length} ${_('books')}`}
              {navigationItems.length > 0 && books.length > 0 && ' • '}
              {navigationItems.length > 0 && `${navigationItems.length} ${_('categories')}`}
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="btn btn-sm btn-ghost"
              aria-label={_('Refresh')}
            >
              <MdRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spinner loading />
            </div>
          )}

          {error && !loading && (
            <div className="px-6 py-8">
              <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-error font-medium mb-2">
                  <MdInfo className="w-5 h-5" />
                  {_('Error')}
                </div>
                <p className="text-sm text-base-content/70">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="btn btn-sm btn-outline mt-3"
                >
                  {_('Try Again')}
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="px-6 py-4 space-y-6">
              {/* Navigation Items */}
              {navigationItems.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">{_('Browse Categories')}</h3>
                  <div className="grid gap-2">
                    {navigationItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleNavigationClick(item)}
                        className="p-3 bg-base-200 hover:bg-base-300 rounded-lg text-left transition-colors"
                      >
                        <div className="font-medium">{item.title}</div>
                        {item.summary && (
                          <div className="text-sm text-base-content/70 mt-1">
                            {item.summary}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Books */}
              {books.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">{_('Available Books')}</h3>
                  <div className="grid gap-4">
                    {books.map((book) => {
                      const coverSrc = coverCache.get(book.id);
                      return (
                        <div
                          key={book.id}
                          className="flex gap-3 p-3 bg-base-100 border border-base-300 rounded-lg hover:bg-base-200 transition-colors"
                        >
                          {/* Book Cover */}
                          <div className="w-16 h-20 bg-base-300 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {coverSrc ? (
                              <img
                                src={coverSrc}
                                alt={book.title}
                                className="w-full h-full object-cover rounded"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`${coverSrc ? 'hidden' : ''} flex items-center justify-center w-full h-full`}>
                              <MdBook className="w-8 h-8 text-base-content/30" />
                            </div>
                          </div>

                        {/* Book Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium line-clamp-2 mb-1">{book.title}</h4>
                          <p className="text-sm text-base-content/70 mb-2">
                            {formatAuthors(book.authors)}
                          </p>
                          {book.summary && (
                            <p className="text-xs text-base-content/60 line-clamp-2 mb-2">
                              {book.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-base-content/50">
                            {book.published && <span>{new Date(book.published).getFullYear()}</span>}
                            {book.language && <span>• {book.language}</span>}
                            {book.categories && book.categories.length > 0 && (
                              <span>• {book.categories[0]}</span>
                            )}
                          </div>
                        </div>

                        {/* Download Button */}
                        <div className="flex items-center">
                          <button
                            onClick={() => handleBookDownload(book)}
                            disabled={downloadingBooks.has(book.id)}
                            className="btn btn-sm btn-primary"
                            aria-label={_('Download book')}
                          >
                            {downloadingBooks.has(book.id) ? (
                              <Spinner loading />
                            ) : (
                              <MdDownload className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && books.length === 0 && navigationItems.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-base-content/70">{_('No books or categories found.')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default OPDSLibraryView;