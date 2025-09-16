import { Book } from '@/types/book';
import { OPDSBook, OPDSFeed } from './types';

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

  public updateLibraryBooks(libraryId: string, books: OPDSBook[]) {
    const library = this.libraries.get(libraryId);
    if (library) {
      // Sort books by published date (newest first)
      const sortedBooks = books.sort((a, b) => {
        const dateA = a.published ? new Date(a.published).getTime() : 0;
        const dateB = b.published ? new Date(b.published).getTime() : 0;
        return dateB - dateA;
      });

      library.books = sortedBooks;
      library.lastUpdated = Date.now();
      this.saveToStorage();
    }
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
    return shelf ? shelf.downloadedBooks.has(bookHash) : false;
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

  private generateId(): string {
    return `opds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const opdsLibraryManager = new OPDSLibraryManager();
