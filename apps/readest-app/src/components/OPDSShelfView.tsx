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
  const [downloadedBooks, setDownloadedBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());

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
    setDownloadedBooks(opdsLibraryManager.getDownloadedBooks(shelfId));
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
      const feed = await opdsService.fetchFeed(library.url, library.credentials);
      const books = opdsService.getBooks(feed);
      
      opdsLibraryManager.updateLibraryBooks(library.id, books);
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

  const handleBookDownload = async (book: OPDSBook) => {
    if (downloadingBooks.has(book.id)) return;

    setDownloadingBooks(prev => new Set(prev).add(book.id));

    try {
      await onBookDownload(book);
      
      // Update shelf with downloaded book
      const downloadedBook = opdsLibraryManager.getDownloadedBooks(shelfId).find(b => b.title === book.title);
      if (downloadedBook) {
        opdsLibraryManager.addDownloadedBook(shelfId, downloadedBook);
        setDownloadedBooks(opdsLibraryManager.getDownloadedBooks(shelfId));
        setAvailableBooks(opdsLibraryManager.getAvailableBooks(shelfId));
      }

      eventDispatcher.dispatch('toast', {
        message: _('书籍下载成功: {{title}}', { title: book.title }),
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

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return _('未知作者');
    if (authors.length === 1) return authors[0] || '';
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0] || ''} & ${authors.length - 1} ${_('其他')}`;
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
              <span>{availableBooks.length} {_('可下载')}</span>
            </div>
            <div className="flex items-center gap-1">
              <MdBookmark className="w-4 h-4" />
              <span>{downloadedBooks.length} {_('已下载')}</span>
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
                  <h3 className="text-lg font-semibold mb-3">{_('可下载的书籍')}</h3>
                  <div className="grid gap-4">
                    {availableBooks.map((book) => (
                      <div
                        key={book.id}
                        className="flex gap-3 p-3 bg-base-100 border border-base-300 rounded-lg hover:bg-base-200 transition-colors"
                      >
                        {/* Cover Image */}
                        <div className="w-16 h-20 bg-base-300 rounded overflow-hidden flex-shrink-0">
                          {book.coverImageUrl ? (
                            <img
                              src={book.coverImageUrl}
                              alt={book.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-base-content/30">
                              <MdBook className="w-6 h-6" />
                            </div>
                          )}
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
                            aria-label={_('下载书籍')}
                          >
                            {downloadingBooks.has(book.id) ? (
                              <Spinner loading />
                            ) : (
                              <MdDownload className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Downloaded Books */}
              {downloadedBooks.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">{_('已下载的书籍')}</h3>
                  <div className="grid gap-4">
                    {downloadedBooks.map((book) => (
                      <div
                        key={book.hash}
                        className="flex gap-3 p-3 bg-base-100 border border-base-300 rounded-lg hover:bg-base-200 transition-colors"
                      >
                        {/* Cover Image */}
                        <div className="w-16 h-20 bg-base-300 rounded overflow-hidden flex-shrink-0">
                          {book.coverImageUrl ? (
                            <img
                              src={book.coverImageUrl}
                              alt={book.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-base-content/30">
                              <MdBook className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        {/* Book Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium line-clamp-2 mb-1">{book.title}</h4>
                          <p className="text-sm text-base-content/70 mb-2">{book.author}</p>
                          <div className="flex items-center gap-2 text-xs text-base-content/50">
                            <span>{book.format}</span>
                            <span>• {new Date(book.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center">
                          <span className="text-xs text-success font-medium">{_('已下载')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && availableBooks.length === 0 && downloadedBooks.length === 0 && (
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

