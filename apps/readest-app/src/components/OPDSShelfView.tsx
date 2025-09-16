import React, { useState, useEffect, useCallback } from 'react';
import { MdDownload, MdInfo, MdRefresh, MdBook, MdBookmark } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import Dialog from './Dialog';
import Spinner from './Spinner';
import {
  OPDSService,
  OPDSBook,
  opdsLibraryManager,
  OPDSLibraryShelf,
  OPDSLibrary
} from '@/services/opds';
import { Book } from '@/types/book';

interface DownloadProgress {
  bookId: string;
  progress: number; // 0-100
  totalSize: number; // in bytes
  downloadedSize: number; // in bytes
  status: 'downloading' | 'completed' | 'error';
}

interface OPDSShelfViewProps {
  isOpen: boolean;
  shelfId: string;
  onClose: () => void;
  onBookDownload: (book: OPDSBook) => Promise<void>;
}

const OPDSShelfView: React.FC<OPDSShelfViewProps> = ({
  isOpen,
  shelfId,
  onClose,
  onBookDownload,
}) => {
  const _ = useTranslation();
  const [opdsService] = useState(() => new OPDSService());
  
  const [shelf, setShelf] = useState<OPDSLibraryShelf | null>(null);
  const [library, setLibrary] = useState<OPDSLibrary | null>(null);
  const [availableBooks, setAvailableBooks] = useState<OPDSBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [loadingMore, setLoadingMore] = useState(false);

  const loadShelfData = useCallback(async () => {
    const shelfData = opdsLibraryManager.getShelf(shelfId);
    if (!shelfData) {
      setError('书架不存在');
      return;
    }

    setShelf(shelfData);
    
    const libraryData = opdsLibraryManager.getLibrary(shelfData.libraryId);
    if (!libraryData) {
      setError('图书馆不存在');
      return;
    }

    setLibrary(libraryData);
    setAvailableBooks(opdsLibraryManager.getAvailableBooks(shelfId));
  }, [shelfId]);

  useEffect(() => {
    if (isOpen && shelfId) {
      loadShelfData();
    }
  }, [isOpen, shelfId, loadShelfData]);

  const handleRefresh = async () => {
    if (!library) return;

    setLoading(true);
    setError('');

    try {
      const feed = await opdsService.fetchFeed(library.url, library.credentials, undefined, 1, 50);
      const books = opdsService.getBooks(feed);
      
      opdsLibraryManager.updateLibraryBooks(library.id, books, feed);
      setAvailableBooks(opdsLibraryManager.getAvailableBooks(shelfId));
      
      eventDispatcher.dispatch('toast', {
        message: _('书架已更新'),
        type: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '刷新书架失败';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPagination = async () => {
    if (!library) return;
    
    console.log('Testing pagination for library:', library.id);
    await opdsService.testPagination(library.url, library.credentials);
  };

  const handleLoadMore = async () => {
    if (!library || loadingMore) return;

    setLoadingMore(true);
    setError('');

    try {
      // Try to use nextLink first, fallback to page-based pagination
      const nextLink = opdsLibraryManager.getNextPageLink(library.id);
      const nextPage = opdsLibraryManager.getNextPageNumber(library.id);
      
      console.log('Loading more books:', {
        libraryId: library.id,
        nextPage,
        nextLink,
        currentBooksCount: availableBooks.length
      });

      let feed;
      if (nextLink) {
        console.log('Using nextLink for pagination:', nextLink);
        feed = await opdsService.fetchFeedByLink(nextLink, library.credentials);
      } else {
        console.log('Using page-based pagination:', nextPage);
        feed = await opdsService.fetchFeed(
          library.url, 
          library.credentials, 
          undefined, 
          nextPage, 
          50 // Load 50 more books
        );
      }
      
      console.log('Received feed:', {
        entriesCount: feed.entries.length,
        totalResults: feed.opensearchTotalResults,
        startIndex: feed.opensearchStartIndex,
        itemsPerPage: feed.opensearchItemsPerPage
      });

      const books = opdsService.getBooks(feed);
      console.log('Parsed books:', books.length);
      
      if (books.length === 0) {
        console.log('No new books found, might have reached the end');
        eventDispatcher.dispatch('toast', {
          message: _('没有更多书籍了'),
          type: 'info',
        });
        return;
      }
      
      opdsLibraryManager.updateLibraryBooks(library.id, books, feed, true);
      setAvailableBooks(opdsLibraryManager.getAvailableBooks(shelfId));
      
      eventDispatcher.dispatch('toast', {
        message: _('已加载更多书籍'),
        type: 'success',
      });
    } catch (err) {
      console.error('Error loading more books:', err);
      const errorMessage = err instanceof Error ? err.message : '加载更多书籍失败';
      setError(errorMessage);
      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleBookDownload = async (book: OPDSBook) => {
    if (downloadProgress.has(book.id)) return;

    // Initialize download progress
    setDownloadProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(book.id, {
        bookId: book.id,
        progress: 0,
        totalSize: 0,
        downloadedSize: 0,
        status: 'downloading'
      });
      return newMap;
    });

    try {
      // Get file size first
      const downloadLink = book.downloadLinks.find(link =>
        link.type === 'application/epub+zip' ||
        link.type === 'application/x-mobipocket-ebook' ||
        link.type === 'application/pdf'
      );

      if (downloadLink) {
        try {
          // Try to get file size via HEAD request
          const response = await fetch(downloadLink.href, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            const totalSize = parseInt(contentLength, 10);
            setDownloadProgress(prev => {
              const newMap = new Map(prev);
              const progress = newMap.get(book.id);
              if (progress) {
                newMap.set(book.id, { ...progress, totalSize });
              }
              return newMap;
            });
          }
        } catch (error) {
          console.warn('Could not get file size:', error);
        }
      }

      // Start download with progress tracking
      await onBookDownload(book);
      
      // Update progress to completed
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        const progress = newMap.get(book.id);
        if (progress) {
          newMap.set(book.id, { ...progress, progress: 100, status: 'completed' });
        }
        return newMap;
      });

      // Mark book as downloaded in the library manager
      const now = Date.now();
      opdsLibraryManager.addDownloadedBook(shelfId, {
        hash: book.id,
        title: book.title,
        author: book.authors.join(', '),
        format: book.downloadLinks[0]?.type || 'unknown',
        createdAt: now,
        updatedAt: now,
        coverImageUrl: book.coverImageUrl
      } as Book);
      
      // Update the available books list to reflect download status
      setAvailableBooks(opdsLibraryManager.getAvailableBooks(shelfId));

      eventDispatcher.dispatch('toast', {
        message: _('书籍下载成功: {{title}}', { title: book.title }),
        type: 'success',
      });

      // Clear progress after a delay
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(book.id);
          return newMap;
        });
      }, 2000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载书籍失败';
      
      // Update progress to error
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        const progress = newMap.get(book.id);
        if (progress) {
          newMap.set(book.id, { ...progress, status: 'error' });
        }
        return newMap;
      });

      eventDispatcher.dispatch('toast', {
        message: errorMessage,
        type: 'error',
      });

      // Clear error progress after a delay
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(book.id);
          return newMap;
        });
      }, 3000);
    }
  };

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return _('未知作者');
    if (authors.length === 1) return authors[0] || '';
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0] || ''} & ${authors.length - 1} ${_('其他')}`;
  };

  const cleanSummary = (summary: string): string => {
    if (!summary) return '';
    
    // Remove HTML tags
    const withoutHtml = summary.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = withoutHtml;
    const decoded = tempDiv.textContent || tempDiv.innerText || '';
    
    // Remove extra whitespace and limit length
    const cleaned = decoded.replace(/\s+/g, ' ').trim();
    
    // Limit to 200 characters
    return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!shelf || !library) {
    return null;
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={shelf.name}
      className="opds-shelf-view"
      contentClassName="px-0"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pb-4 border-b border-base-300">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">{shelf.name}</h2>
              <p className="text-sm text-base-content/70">{library.description}</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="btn btn-sm btn-ghost"
              aria-label={_('刷新')}
            >
              <MdRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm text-base-content/70">
            <div className="flex items-center gap-1">
              <MdBook className="w-4 h-4" />
              <span>{availableBooks.length} {_('书籍')}</span>
            </div>
            <div className="flex items-center gap-1">
              <MdBookmark className="w-4 h-4" />
              <span>{availableBooks.filter(book => opdsLibraryManager.isBookDownloaded(shelfId, book.id) || opdsLibraryManager.isOPDSBookInLocalLibrary(book)).length} {_('已下载')}</span>
            </div>
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
                  {_('错误')}
                </div>
                <p className="text-sm text-base-content/70">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="btn btn-sm btn-outline mt-3"
                >
                  {_('重试')}
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="px-6 py-4 space-y-6">
              {/* Available Books */}
              {availableBooks.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">{_('书籍')}</h3>
                  <div className="grid gap-4">
                    {availableBooks.map((book) => (
                      <div
                        key={book.id}
                        className="flex gap-3 p-3 bg-base-100 border border-base-300 rounded-lg hover:bg-base-200 transition-colors"
                      >
                        {/* Book Icon */}
                        <div className="w-16 h-20 bg-base-300 rounded flex items-center justify-center flex-shrink-0">
                          <MdBook className="w-8 h-8 text-base-content/30" />
                        </div>

                        {/* Book Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium line-clamp-2 mb-1">{book.title}</h4>
                          <p className="text-sm text-base-content/70 mb-2">
                            {formatAuthors(book.authors)}
                          </p>
                          {book.summary && (
                            <p className="text-xs text-base-content/60 line-clamp-2 mb-2">
                              {cleanSummary(book.summary)}
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

                        {/* Download Button and Progress */}
                        <div className="flex flex-col items-end gap-2">
                          {downloadProgress.has(book.id) ? (
                            <div className="flex flex-col items-end gap-1 min-w-[120px]">
                              {(() => {
                                const progress = downloadProgress.get(book.id)!;
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <Spinner loading />
                                      <span className="text-xs text-base-content/70">
                                        {progress.status === 'downloading' && `${progress.progress}%`}
                                        {progress.status === 'completed' && _('完成')}
                                        {progress.status === 'error' && _('错误')}
                                      </span>
                                    </div>
                                    {progress.totalSize > 0 && (
                                      <div className="text-xs text-base-content/50">
                                        {formatFileSize(progress.downloadedSize)} / {formatFileSize(progress.totalSize)}
                                      </div>
                                    )}
                                    <div className="w-full bg-base-300 rounded-full h-1">
                                      <div 
                                        className="bg-primary h-1 rounded-full transition-all duration-300"
                                        style={{ width: `${progress.progress}%` }}
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (opdsLibraryManager.isBookDownloaded(shelfId, book.id) || opdsLibraryManager.isOPDSBookInLocalLibrary(book)) ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1 text-success">
                                <MdBookmark className="w-4 h-4" />
                                <span className="text-xs font-medium">{_('已下载')}</span>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleBookDownload(book)}
                              className="btn btn-sm btn-primary"
                              aria-label={_('下载书籍')}
                            >
                              <MdDownload className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Pagination Controls */}
                  {library && (
                    <div className="mt-4 text-center">
                      {/* Page Info */}
                      {library.pagination && (
                        <div className="mb-2 text-sm text-base-content/70">
                          {_('第')} {library.pagination.currentPage} {_('页')}
                          {library.pagination.totalPages && ` / ${library.pagination.totalPages} ${_('页')}`}
                          {library.pagination.totalResults && ` (${library.pagination.totalResults} ${_('本书')})`}
                        </div>
                      )}
                      
                      {/* Test Pagination Button */}
                      <button
                        onClick={handleTestPagination}
                        className="btn btn-ghost btn-xs mr-2"
                        title="测试分页功能"
                      >
                        {_('测试分页')}
                      </button>
                      
                      {/* Load More Button */}
                      {opdsLibraryManager.hasMoreBooks(library.id) && (
                        <button
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="btn btn-outline btn-sm"
                        >
                          {loadingMore ? (
                            <>
                              <Spinner loading />
                              <span className="ml-2">{_('加载中...')}</span>
                            </>
                          ) : (
                            <>
                              {_('加载第')} {opdsLibraryManager.getNextPageNumber(library.id)} {_('页')}
                            </>
                          )}
                        </button>
                      )}
                      
                      {/* No More Books Message */}
                      {!opdsLibraryManager.hasMoreBooks(library.id) && library.pagination && (
                        <div className="text-sm text-base-content/50">
                          {_('已加载所有书籍')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* Empty State */}
              {!loading && !error && availableBooks.length === 0 && (
                <div className="text-center py-8">
                  <MdBook className="w-12 h-12 text-base-content/30 mx-auto mb-3" />
                  <p className="text-base-content/70">{_('书架为空')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default OPDSShelfView;

