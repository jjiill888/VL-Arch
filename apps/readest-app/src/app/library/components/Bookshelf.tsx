import clsx from 'clsx';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MdDelete, MdOpenInNew, MdOutlineCancel, MdInfoOutline } from 'react-icons/md';
import { LuFolderPlus } from 'react-icons/lu';
import { PiPlus } from 'react-icons/pi';
import { Book, BooksGroup } from '@/types/book';
import { LibraryCoverFitType, LibraryViewModeType } from '@/types/settings';
import { OPDSLibrary } from '@/services/opds';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useAutoFocus } from '@/hooks/useAutoFocus';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import { navigateToLibrary, navigateToReader, showReaderWindow } from '@/utils/nav';
import { formatAuthors, formatTitle } from '@/utils/book';
import { eventDispatcher } from '@/utils/event';
import { isMd5 } from '@/utils/md5';

import Alert from '@/components/Alert';
import Spinner from '@/components/Spinner';
import ModalPortal from '@/components/ModalPortal';
import BookshelfItem, { generateBookshelfItems } from './BookshelfItem';
import GroupingModal from './GroupingModal';

interface BookshelfProps {
  libraryBooks: Book[];
  isSelectMode: boolean;
  isSelectAll: boolean;
  isSelectNone: boolean;
  handleImportBooks: () => void;
  handleBookUpload: (book: Book) => Promise<boolean>;
  handleBookDownload: (book: Book) => Promise<boolean>;
  handleBookDelete: (book: Book) => Promise<boolean>;
  handleSetSelectMode: (selectMode: boolean) => void;
  handleShowDetailsBook: (book: Book) => void;
  booksTransferProgress: { [key: string]: number | null };
  opdsLibraries?: OPDSLibrary[];
  onOpenOPDSLibrary?: (library: OPDSLibrary) => void;
  onDeleteOPDSLibrary?: (library: OPDSLibrary) => void;
}

const Bookshelf: React.FC<BookshelfProps> = ({
  libraryBooks,
  isSelectMode,
  isSelectAll,
  isSelectNone,
  handleImportBooks,
  handleBookUpload,
  handleBookDownload,
  handleBookDelete,
  handleSetSelectMode,
  handleShowDetailsBook,
  booksTransferProgress,
  opdsLibraries = [],
  onOpenOPDSLibrary,
  onDeleteOPDSLibrary,
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets } = useThemeStore();
  const [loading, setLoading] = useState(false);
  const [showSelectModeActions, setShowSelectModeActions] = useState(false);
  const [bookIdsToDelete, setBookIdsToDelete] = useState<string[]>([]);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showGroupingModal, setShowGroupingModal] = useState(false);
  const [showOPDSDeleteAlert, setShowOPDSDeleteAlert] = useState(false);
  const [opdsLibraryToDelete, setOpdsLibraryToDelete] = useState<OPDSLibrary | null>(null);
  const [queryTerm, setQueryTerm] = useState<string | null>(null);
  const [navBooksGroup, setNavBooksGroup] = useState<BooksGroup | null>(null);
  const [importBookUrl] = useState(searchParams?.get('url') || '');
  const [viewMode, setViewMode] = useState(searchParams?.get('view') || settings.libraryViewMode);
  const [sortBy, setSortBy] = useState(searchParams?.get('sort') || settings.librarySortBy);
  const [sortOrder, setSortOrder] = useState(
    searchParams?.get('order') || (settings.librarySortAscending ? 'asc' : 'desc'),
  );
  const [coverFit, setCoverFit] = useState(searchParams?.get('cover') || settings.libraryCoverFit);
  const isImportingBook = useRef(false);

  const { setCurrentBookshelf, setLibrary } = useLibraryStore();
  const { setSelectedBooks, getSelectedBooks, toggleSelectedBook } = useLibraryStore();
  const allBookshelfItems = generateBookshelfItems(libraryBooks);

  const autofocusRef = useAutoFocus<HTMLDivElement>();

  useEffect(() => {
    if (isImportingBook.current) return;
    isImportingBook.current = true;

    if (importBookUrl && appService) {
      const importBook = async () => {
        console.log('Importing book from URL:', importBookUrl);
        const book = await appService.importBook(importBookUrl, libraryBooks);
        if (book) {
          setLibrary(libraryBooks);
          appService.saveLibraryBooks(libraryBooks);
          navigateToReader(router, [book.hash]);
        }
      };
      importBook();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importBookUrl, appService]);

  useEffect(() => {
    if (navBooksGroup) {
      setCurrentBookshelf(navBooksGroup.books);
    } else {
      setCurrentBookshelf(allBookshelfItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryBooks, navBooksGroup]);

  useEffect(() => {
    const group = searchParams?.get('group') || '';
    const query = searchParams?.get('q') || '';
    const view = searchParams?.get('view') || settings.libraryViewMode;
    const sort = searchParams?.get('sort') || settings.librarySortBy;
    const order = searchParams?.get('order') || (settings.librarySortAscending ? 'asc' : 'desc');
    const cover = searchParams?.get('cover') || settings.libraryCoverFit;
    const params = new URLSearchParams(searchParams?.toString());
    if (query) {
      params.set('q', query);
      setQueryTerm(query);
    } else {
      params.delete('q');
      setQueryTerm(null);
    }
    if (sort) {
      params.set('sort', sort);
      setSortBy(sort);
    } else {
      params.delete('sort');
    }
    if (order) {
      params.set('order', order);
      setSortOrder(order);
    } else {
      params.delete('order');
    }
    if (view) {
      params.set('view', view);
      setViewMode(view);
    } else {
      params.delete('view');
    }
    setCoverFit(cover);
    if (cover === 'crop') {
      params.delete('cover');
    }
    if (sort === 'updated' && order === 'desc' && view === 'grid') {
      params.delete('sort');
      params.delete('order');
      params.delete('view');
    }
    if (group) {
      const booksGroup = allBookshelfItems.find(
        (item) => 'name' in item && item.id === group,
      ) as BooksGroup;
      if (booksGroup) {
        setNavBooksGroup(booksGroup);
        params.set('group', group);
      } else {
        params.delete('group');
        navigateToLibrary(router, `${params.toString()}`);
      }
    } else {
      setNavBooksGroup(null);
      params.delete('group');
      navigateToLibrary(router, `${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, libraryBooks, showGroupingModal]);

  const toggleSelection = useCallback((id: string) => {
    toggleSelectedBook(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSelectedBooks = () => {
    handleSetSelectMode(false);
    if (appService?.hasWindow && settings.openBookInNewWindow) {
      showReaderWindow(appService, getSelectedBooks());
    } else {
      setTimeout(() => setLoading(true), 200);
      navigateToReader(router, getSelectedBooks());
    }
  };

  const openBookDetails = () => {
    handleSetSelectMode(false);
    const selectedBooks = getSelectedBooks();
    const book = libraryBooks.find((book) => book.hash === selectedBooks[0]);
    if (book) {
      handleShowDetailsBook(book);
    }
  };

  const getBooksToDelete = () => {
    const booksToDelete: Book[] = [];
    bookIdsToDelete.forEach((id) => {
      for (const book of libraryBooks.filter((book) => book.hash === id || book.groupId === id)) {
        if (book && !book.deletedAt) {
          booksToDelete.push(book);
        }
      }
    });
    return booksToDelete;
  };

  const confirmDelete = async () => {
    for (const book of getBooksToDelete()) {
      handleBookDelete(book);
    }
    setSelectedBooks([]);
    setShowDeleteAlert(false);
    setShowSelectModeActions(true);
  };

  const deleteSelectedBooks = () => {
    setBookIdsToDelete(getSelectedBooks());
    setShowSelectModeActions(false);
    setShowDeleteAlert(true);
  };

  const groupSelectedBooks = () => {
    setShowSelectModeActions(false);
    setShowGroupingModal(true);
  };

  const handleDeleteBooksIntent = (event: CustomEvent) => {
    const { ids } = event.detail;
    setBookIdsToDelete(ids);
    setShowSelectModeActions(false);
    setShowDeleteAlert(true);
  };

  const bookFilter = (item: Book, queryTerm: string) => {
    if (item.deletedAt) return false;
    const searchTerm = new RegExp(queryTerm, 'i');
    const title = formatTitle(item.title);
    const authors = formatAuthors(item.author);
    return (
      searchTerm.test(title) ||
      searchTerm.test(authors) ||
      searchTerm.test(item.format) ||
      (item.groupName && searchTerm.test(item.groupName)) ||
      (item.metadata?.description && searchTerm.test(item.metadata?.description))
    );
  };
  const bookSorter = (a: Book, b: Book) => {
    const uiLanguage = localStorage?.getItem('i18nextLng') || '';
    switch (sortBy) {
      case 'title':
        const aTitle = formatTitle(a.title);
        const bTitle = formatTitle(b.title);
        return aTitle.localeCompare(bTitle, uiLanguage || navigator.language);
      case 'author':
        const aAuthors = formatAuthors(a.author, a?.primaryLanguage || 'en', true);
        const bAuthors = formatAuthors(b.author, b?.primaryLanguage || 'en', true);
        return aAuthors.localeCompare(bAuthors, uiLanguage || navigator.language);
      case 'updated':
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case 'created':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'format':
        return a.format.localeCompare(b.format, uiLanguage || navigator.language);
      default:
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
  };
  const sortOrderMultiplier = sortOrder === 'asc' ? 1 : -1;
  const currentBookshelfItems = navBooksGroup ? navBooksGroup.books : allBookshelfItems;
  const filteredBookshelfItems = currentBookshelfItems
    .filter((item) => {
      if ('name' in item) return item.books.some((book) => bookFilter(book, queryTerm || ''));
      else if (queryTerm) return bookFilter(item, queryTerm);
      return true;
    })
    .sort((a, b) => {
      const uiLanguage = localStorage?.getItem('i18nextLng') || '';
      if (sortBy === 'updated') {
        return (
          (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sortOrderMultiplier
        );
      } else if ('name' in a || 'name' in b) {
        const aName = 'name' in a ? a.name : formatTitle(a.title);
        const bName = 'name' in b ? b.name : formatTitle(b.title);
        return aName.localeCompare(bName, uiLanguage || navigator.language) * sortOrderMultiplier;
      } else if (!('name' in a || 'name' in b)) {
        return bookSorter(a, b) * sortOrderMultiplier;
      } else {
        return 0;
      }
    });

  useEffect(() => {
    if (isSelectMode) {
      setShowSelectModeActions(true);
      if (isSelectAll) {
        setSelectedBooks(
          filteredBookshelfItems.map((item) => ('hash' in item ? item.hash : item.id)),
        );
      } else if (isSelectNone) {
        setSelectedBooks([]);
      }
    } else {
      setSelectedBooks([]);
      setShowSelectModeActions(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectMode, isSelectAll, isSelectNone]);

  const handleDeleteOPDSLibraryConfirm = useCallback(async () => {
    if (opdsLibraryToDelete && onDeleteOPDSLibrary) {
      await onDeleteOPDSLibrary(opdsLibraryToDelete);
      setOpdsLibraryToDelete(null);
      setShowOPDSDeleteAlert(false);
    }
  }, [opdsLibraryToDelete, onDeleteOPDSLibrary]);

  const handleDeleteOPDSLibraryIntent = useCallback((library: OPDSLibrary) => {
    setOpdsLibraryToDelete(library);
    setShowOPDSDeleteAlert(true);
  }, []);

  useEffect(() => {
    eventDispatcher.on('delete-books', handleDeleteBooksIntent);
    return () => {
      eventDispatcher.off('delete-books', handleDeleteBooksIntent);
    };
  }, []);

  const selectedBooks = getSelectedBooks();

  return (
    <div className='bookshelf'>
      {opdsLibraries.length > 0 && (
        <div className='mb-6 px-4'>
          <h2 className='mb-4 text-lg font-semibold text-base-content'>OPDS Libraries</h2>
          <div className={clsx(
            'grid gap-4',
            viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1'
          )}>
            {opdsLibraries.map((library) => (
              <div
                key={library.id}
                className={clsx(
                  'bg-base-100 border border-base-300 rounded-lg relative group hover:bg-base-200 transition-colors',
                  viewMode === 'list' && 'flex items-center'
                )}
              >
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-error text-error-content opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/80 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteOPDSLibraryIntent(library);
                  }}
                  aria-label={`Delete ${library.name} library`}
                  title={`Delete ${library.name}`}
                >
                  <MdDelete size={16} />
                </button>
                <button
                  className={clsx(
                    'w-full p-4 cursor-pointer text-left',
                    viewMode === 'list' && 'flex items-center gap-4'
                  )}
                  onClick={() => onOpenOPDSLibrary?.(library)}
                  aria-label={`Open ${library.name} library`}
                >
                  {viewMode === 'list' ? (
                    <>
                      <div className='w-12 h-16 bg-primary/20 rounded flex items-center justify-center'>
                        <span className='text-primary font-bold text-lg'>📚</span>
                      </div>
                      <div className='flex-1'>
                        <h3 className='font-semibold text-base-content'>{library.name}</h3>
                        <p className='text-sm text-base-content/70'>{library.description || library.url}</p>
                        <p className='text-xs text-base-content/50'>
                          Last updated: {new Date(library.lastUpdated).toLocaleDateString()}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className='text-center'>
                      <div className='w-full h-20 bg-primary/20 rounded flex items-center justify-center mb-2'>
                        <span className='text-primary font-bold text-2xl'>📚</span>
                      </div>
                      <h3 className='font-semibold text-sm text-base-content truncate'>{library.name}</h3>
                      <p className='text-xs text-base-content/70 mt-1'>
                        {library.books.length} books
                      </p>
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={autofocusRef}
        tabIndex={-1}
        className={clsx(
          'bookshelf-items transform-wrapper focus:outline-none',
          viewMode === 'grid' && 'grid flex-1 grid-cols-3 gap-x-4 px-4 sm:gap-x-0 sm:px-2',
          viewMode === 'grid' && 'sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12',
          viewMode === 'list' && 'flex flex-col',
        )}
        role='main'
        aria-label={_('Bookshelf')}
      >
        {filteredBookshelfItems.map((item) => (
          <BookshelfItem
            key={`library-item-${'hash' in item ? item.hash : item.id}`}
            item={item}
            mode={viewMode as LibraryViewModeType}
            coverFit={coverFit as LibraryCoverFitType}
            isSelectMode={isSelectMode}
            itemSelected={
              'hash' in item ? selectedBooks.includes(item.hash) : selectedBooks.includes(item.id)
            }
            setLoading={setLoading}
            toggleSelection={toggleSelection}
            handleBookUpload={handleBookUpload}
            handleBookDownload={handleBookDownload}
            handleBookDelete={handleBookDelete}
            handleSetSelectMode={handleSetSelectMode}
            handleShowDetailsBook={handleShowDetailsBook}
            transferProgress={
              'hash' in item ? booksTransferProgress[(item as Book).hash] || null : null
            }
          />
        ))}
        {viewMode === 'grid' && !navBooksGroup && allBookshelfItems.length > 0 && (
          <button
            aria-label={_('Import Books')}
            className={clsx(
              'border-1 bg-base-100 hover:bg-base-300/50 flex items-center justify-center',
              'mx-0 my-4 aspect-[28/41] sm:mx-4',
            )}
            onClick={handleImportBooks}
          >
            <PiPlus className='size-10' color='gray' />
          </button>
        )}
      </div>
      {loading && (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
          <Spinner loading />
        </div>
      )}
      <div
        className='fixed bottom-0 left-0 right-0 z-40'
        style={{
          paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px`,
        }}
      >
        {isSelectMode && showSelectModeActions && (
          <div
            className={clsx(
              'flex items-center justify-center shadow-lg',
              'bg-gray-600 text-xs text-white',
              'mx-auto w-fit space-x-6 rounded-lg p-4',
            )}
          >
            <button
              onClick={openSelectedBooks}
              className={clsx(
                'flex flex-col items-center justify-center gap-1',
                (!selectedBooks.length || !selectedBooks.every((id) => isMd5(id))) &&
                  'btn-disabled opacity-50',
              )}
            >
              <MdOpenInNew />
              <div>{_('Open')}</div>
            </button>
            <button
              onClick={groupSelectedBooks}
              className={clsx(
                'flex flex-col items-center justify-center gap-1',
                !selectedBooks.length && 'btn-disabled opacity-50',
              )}
            >
              <LuFolderPlus />
              <div>{_('Group')}</div>
            </button>
            <button
              onClick={openBookDetails}
              className={clsx(
                'flex flex-col items-center justify-center gap-1',
                (selectedBooks.length !== 1 || !selectedBooks.every((id) => isMd5(id))) &&
                  'btn-disabled opacity-50',
              )}
            >
              <MdInfoOutline />
              <div>{_('Details')}</div>
            </button>
            <button
              onClick={deleteSelectedBooks}
              className={clsx(
                'flex flex-col items-center justify-center gap-1',
                !selectedBooks.length && 'btn-disabled opacity-50',
              )}
            >
              <MdDelete className='fill-red-500' />
              <div className='text-red-500'>{_('Delete')}</div>
            </button>
            <button
              onClick={() => handleSetSelectMode(false)}
              className={clsx('flex flex-col items-center justify-center gap-1')}
            >
              <MdOutlineCancel />
              <div>{_('Cancel')}</div>
            </button>
          </div>
        )}
      </div>
      {showGroupingModal && (
        <ModalPortal>
          <GroupingModal
            libraryBooks={libraryBooks}
            selectedBooks={selectedBooks}
            onCancel={() => {
              setShowGroupingModal(false);
              setShowSelectModeActions(true);
            }}
            onConfirm={() => {
              setShowGroupingModal(false);
              handleSetSelectMode(false);
            }}
          />
        </ModalPortal>
      )}
      {showDeleteAlert && (
        <div
          className={clsx('fixed bottom-0 left-0 right-0 z-50 flex justify-center')}
          style={{
            paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px`,
          }}
        >
          <Alert
            title={_('Confirm Deletion')}
            message={_('Are you sure to delete {{count}} selected book(s)?', {
              count: getBooksToDelete().length,
            })}
            onCancel={() => {
              setShowDeleteAlert(false);
              setShowSelectModeActions(true);
            }}
            onConfirm={confirmDelete}
          />
        </div>
      )}
      {showOPDSDeleteAlert && opdsLibraryToDelete && (
        <div
          className={clsx('fixed bottom-0 left-0 right-0 z-50 flex justify-center')}
          style={{
            paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px`,
          }}
        >
          <Alert
            title={_('Confirm Deletion')}
            message={_('Are you sure you want to delete the OPDS library "{{name}}"? This will also remove any downloaded books from this library.', {
              name: opdsLibraryToDelete.name,
            })}
            onCancel={() => {
              setShowOPDSDeleteAlert(false);
              setOpdsLibraryToDelete(null);
            }}
            onConfirm={handleDeleteOPDSLibraryConfirm}
          />
        </div>
      )}
    </div>
  );
};

export default Bookshelf;
