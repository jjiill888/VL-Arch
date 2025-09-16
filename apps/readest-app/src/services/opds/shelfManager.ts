import { Book } from '@/types/book';
import { OPDSBook, OPDSFeed } from './types';
import { useLibraryStore } from '@/store/libraryStore';

export interface OPDSLibrary {
  id: string;
  name: string;
  url: string;
  description?: string;
  books: OPDSBook[];
  lastUpdated: number;
  credentials?: {
    username: string;
    password: string;
  };
  pagination?: {
    totalResults?: number;
    currentPage: number;
    itemsPerPage: number;
    hasMore: boolean;
    totalPages?: number;
    nextLink?: string;
    prevLink?: string;
    firstLink?: string;
    lastLink?: string;
  };
}

export interface OPDSLibraryShelf {
  id: string;
  name: string;
  libraryId: string;
  books: Book[];
  downloadedBooks: Set<string>; // Set of book hashes that have been downloaded
  lastUpdated: number;
}

export class OPDSLibraryManager {
  private libraries: Map<string, OPDSLibrary> = new Map();
  private shelves: Map<string, OPDSLibraryShelf> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storedLibraries = localStorage.getItem('opds-libraries');
      if (storedLibraries) {
        const libraries = JSON.parse(storedLibraries);
        libraries.forEach((lib: OPDSLibrary) => {
          this.libraries.set(lib.id, lib);
        });
      }

      const storedShelves = localStorage.getItem('opds-shelves');
      if (storedShelves) {
        const shelves = JSON.parse(storedShelves);
        shelves.forEach((shelf: OPDSLibraryShelf) => {
          shelf.downloadedBooks = new Set(shelf.downloadedBooks);
          this.shelves.set(shelf.id, shelf);
        });
      }
    } catch (error) {
      console.error('Failed to load OPDS libraries from storage:', error);
    }
  }

  private saveToStorage() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const libraries = Array.from(this.libraries.values());
      localStorage.setItem('opds-libraries', JSON.stringify(libraries));

      const shelves = Array.from(this.shelves.values()).map(shelf => ({
        ...shelf,
        downloadedBooks: Array.from(shelf.downloadedBooks)
      }));
      localStorage.setItem('opds-shelves', JSON.stringify(shelves));
    } catch (error) {
      console.error('Failed to save OPDS libraries to storage:', error);
    }
  }

  public createLibrary(feed: OPDSFeed, url: string, credentials?: { username: string; password: string }): OPDSLibrary {
    const libraryId = this.generateId();
    const library: OPDSLibrary = {
      id: libraryId,
      name: feed.title || 'Unknown Library',
      url,
      description: feed.subtitle,
      books: [],
      lastUpdated: Date.now(),
      credentials
    };

    this.libraries.set(libraryId, library);
    this.saveToStorage();
    return library;
  }

  public createShelf(libraryId: string, libraryName: string): OPDSLibraryShelf {
    const shelfId = this.generateId();
    const shelf: OPDSLibraryShelf = {
      id: shelfId,
      name: `${libraryName} 书架`,
      libraryId,
      books: [],
      downloadedBooks: new Set(),
      lastUpdated: Date.now()
    };

    this.shelves.set(shelfId, shelf);
    this.saveToStorage();
    return shelf;
  }

  public updateLibraryBooks(libraryId: string, books: OPDSBook[], feed?: OPDSFeed, append: boolean = false) {
    const library = this.libraries.get(libraryId);
    if (library) {
      // Sort books by published date (newest first)
      const sortedBooks = books.sort((a, b) => {
        const dateA = a.published ? new Date(a.published).getTime() : 0;
        const dateB = b.published ? new Date(b.published).getTime() : 0;
        return dateB - dateA;
      });

      if (append) {
        // Append new books to existing ones, avoiding duplicates
        const existingIds = new Set(library.books.map(book => book.id));
        const newBooks = sortedBooks.filter(book => !existingIds.has(book.id));
        library.books = [...library.books, ...newBooks];
      } else {
        library.books = sortedBooks;
      }

      // Update pagination info if available
      if (feed) {
        const itemsPerPage = feed.opensearchItemsPerPage || 20;
        const currentPage = feed.opensearchStartIndex ? Math.floor(feed.opensearchStartIndex / itemsPerPage) + 1 : 1;
        const totalPages = feed.opensearchTotalResults ? Math.ceil(feed.opensearchTotalResults / itemsPerPage) : undefined;
        
        library.pagination = {
          totalResults: feed.opensearchTotalResults,
          currentPage: currentPage,
          itemsPerPage: itemsPerPage,
          hasMore: this.calculateHasMore(feed),
          totalPages: totalPages,
          nextLink: feed.nextLink,
          prevLink: feed.prevLink,
          firstLink: feed.firstLink,
          lastLink: feed.lastLink
        };
      }

      library.lastUpdated = Date.now();
      this.saveToStorage();
    }
  }

  private calculateHasMore(feed: OPDSFeed): boolean {
    console.log('Calculating hasMore for feed:', {
      totalResults: feed.opensearchTotalResults,
      startIndex: feed.opensearchStartIndex,
      itemsPerPage: feed.opensearchItemsPerPage,
      entriesCount: feed.entries.length,
      nextLink: feed.nextLink,
      prevLink: feed.prevLink
    });

    // First priority: check if we have a nextLink
    if (feed.nextLink) {
      console.log('Has nextLink, assuming there are more books');
      return true;
    }

    // Second priority: use OpenSearch pagination info
    if (feed.opensearchTotalResults && feed.opensearchStartIndex !== undefined && feed.opensearchItemsPerPage) {
      const currentPage = Math.floor(feed.opensearchStartIndex / feed.opensearchItemsPerPage) + 1;
      const totalPages = Math.ceil(feed.opensearchTotalResults / feed.opensearchItemsPerPage);
      const hasMore = currentPage < totalPages;
      console.log('OpenSearch hasMore (page-based):', hasMore, `(page ${currentPage} of ${totalPages})`);
      return hasMore;
    }

    // Fallback: if we got fewer entries than requested, assume no more pages
    // This is a heuristic - if we requested 20 items but only got 12, there might be more
    // But if we got exactly what we requested, there might be more
    const requestedItems = 20; // Default page size
    const hasMoreByCount = feed.entries.length >= requestedItems;
    console.log('Fallback hasMore by count:', hasMoreByCount, `(${feed.entries.length} >= ${requestedItems})`);
    
    // If we don't have OpenSearch info, be more aggressive about showing pagination
    // Many OPDS servers don't provide proper pagination info, so we should try to load more
    if (!feed.opensearchTotalResults && !feed.opensearchStartIndex && !feed.opensearchItemsPerPage) {
      console.log('No OpenSearch info available, assuming there might be more books');
      return true; // Always show pagination if no OpenSearch info
    }
    
    return hasMoreByCount;
  }

  public addDownloadedBook(shelfId: string, book: Book) {
    const shelf = this.shelves.get(shelfId);
    if (shelf) {
      // Check if book already exists in shelf
      const existingIndex = shelf.books.findIndex(b => b.hash === book.hash);
      if (existingIndex >= 0) {
        shelf.books[existingIndex] = book;
      } else {
        shelf.books.push(book);
      }
      
      shelf.downloadedBooks.add(book.hash);
      shelf.lastUpdated = Date.now();
      this.saveToStorage();
    }
  }

  public getLibrary(libraryId: string): OPDSLibrary | undefined {
    return this.libraries.get(libraryId);
  }

  public getShelf(shelfId: string): OPDSLibraryShelf | undefined {
    return this.shelves.get(shelfId);
  }

  public getShelfByLibraryId(libraryId: string): OPDSLibraryShelf | undefined {
    return Array.from(this.shelves.values()).find(shelf => shelf.libraryId === libraryId);
  }

  public getAllLibraries(): OPDSLibrary[] {
    return Array.from(this.libraries.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  public getAllShelves(): OPDSLibraryShelf[] {
    return Array.from(this.shelves.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  public deleteLibrary(libraryId: string) {
    this.libraries.delete(libraryId);
    // Also delete associated shelf
    const shelf = this.getShelfByLibraryId(libraryId);
    if (shelf) {
      this.shelves.delete(shelf.id);
    }
    this.saveToStorage();
  }

  public deleteShelf(shelfId: string) {
    this.shelves.delete(shelfId);
    this.saveToStorage();
  }

  public isBookDownloaded(shelfId: string, bookHash: string): boolean {
    const shelf = this.shelves.get(shelfId);
    if (shelf && shelf.downloadedBooks.has(bookHash)) {
      return true;
    }
    
    // Also check if the book exists in the local library
    return this.isBookInLocalLibrary(bookHash);
  }

  public isOPDSBookInLocalLibrary(opdsBook: OPDSBook): boolean {
    try {
      // Get the current library state from the store
      const library = useLibraryStore.getState().getVisibleLibrary();
      
      // Try to match by hash first (if OPDS book ID matches local book hash)
      if (library.some(book => book.hash === opdsBook.id)) {
        return true;
      }
      
      // Try to match by title and author
      const normalizedTitle = opdsBook.title.toLowerCase().trim();
      const normalizedAuthors = opdsBook.authors.map(author => author.toLowerCase().trim()).join(', ');
      
      return library.some(book => {
        const bookTitle = book.title.toLowerCase().trim();
        const bookAuthor = book.author.toLowerCase().trim();
        
        // Check if titles match (allowing for some variations)
        const titleMatch = bookTitle === normalizedTitle || 
                          bookTitle.includes(normalizedTitle) || 
                          normalizedTitle.includes(bookTitle);
        
        // Check if authors match
        const authorMatch = bookAuthor === normalizedAuthors ||
                           bookAuthor.includes(normalizedAuthors) ||
                           normalizedAuthors.includes(bookAuthor);
        
        return titleMatch && authorMatch;
      });
    } catch (error) {
      console.warn('Failed to check local library:', error);
      return false;
    }
  }

  private isBookInLocalLibrary(bookHash: string): boolean {
    try {
      // Get the current library state from the store
      const library = useLibraryStore.getState().getVisibleLibrary();
      return library.some(book => book.hash === bookHash);
    } catch (error) {
      console.warn('Failed to check local library:', error);
      return false;
    }
  }

  public getDownloadedBooks(shelfId: string): Book[] {
    const shelf = this.shelves.get(shelfId);
    return shelf ? shelf.books.filter(book => shelf.downloadedBooks.has(book.hash)) : [];
  }

  public getAvailableBooks(shelfId: string): OPDSBook[] {
    const shelf = this.shelves.get(shelfId);
    if (!shelf) return [];
    
    const library = this.libraries.get(shelf.libraryId);
    if (!library) return [];

    // Return books that haven't been downloaded yet
    return library.books.filter(book => !shelf.downloadedBooks.has(book.id));
  }

  public hasMoreBooks(libraryId: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) {
      console.log('hasMoreBooks: No library found for', libraryId);
      return false;
    }
    
    console.log('hasMoreBooks check:', {
      libraryId,
      booksCount: library.books.length,
      pagination: library.pagination,
      hasMoreFromPagination: library.pagination?.hasMore
    });
    
    // Check if we have pagination info
    if (library.pagination?.hasMore !== undefined) {
      console.log('hasMoreBooks: Using pagination info:', library.pagination.hasMore);
      return library.pagination.hasMore;
    }
    
    // Fallback: if we have books and no pagination info, assume there might be more
    // This is a heuristic - we'll try to load more and see what happens
    // Be more aggressive: if we have any books, show pagination
    const fallbackResult = library.books.length > 0;
    console.log('hasMoreBooks: Using fallback logic:', fallbackResult, `(books: ${library.books.length})`);
    
    // If we have books but no pagination info, always show pagination
    // This allows users to try loading more books even if the server doesn't provide proper pagination info
    if (library.books.length > 0 && !library.pagination) {
      console.log('hasMoreBooks: No pagination info but have books, showing pagination');
      return true;
    }
    
    return fallbackResult;
  }

  public getNextPageNumber(libraryId: string): number {
    const library = this.libraries.get(libraryId);
    if (!library) return 1;
    
    // If we have pagination info, use it
    if (library.pagination) {
      return library.pagination.currentPage + 1;
    }
    
    // Fallback: calculate page based on current books count
    const itemsPerPage = 20; // Default page size
    return Math.floor(library.books.length / itemsPerPage) + 1;
  }

  public getNextPageLink(libraryId: string): string | null {
    const library = this.libraries.get(libraryId);
    if (!library?.pagination?.nextLink) return null;
    return library.pagination.nextLink;
  }

  private generateId(): string {
    return `opds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const opdsLibraryManager = new OPDSLibraryManager();
