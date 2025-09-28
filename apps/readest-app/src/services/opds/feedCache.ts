import { OPDSFeed, OPDSBook, OPDSNavigationItem } from './types';

interface CachedFeedData {
  feed: OPDSFeed;
  books: OPDSBook[];
  navigationItems: OPDSNavigationItem[];
  lastUpdated: number;
  lastAccessed: number;
}

interface CachedShelfData {
  feed: OPDSFeed;
  books: OPDSBook[];
  navigationItems: OPDSNavigationItem[];
  parentUrl?: string; // URL of parent shelf for navigation
  breadcrumb?: Array<{ title: string; url: string }>; // Navigation breadcrumb
  lastUpdated: number;
  lastAccessed: number;
}

interface FeedCacheOptions {
  maxAge?: number; // Maximum age in milliseconds (default: 5 minutes)
  staleAge?: number; // Age after which data is stale but still usable (default: 1 minute)
}

/**
 * OPDS Feed Cache Manager
 *
 * Implements intelligent caching strategy for OPDS feeds:
 * - Memory cache for immediate access
 * - localStorage for persistence
 * - Time-based cache invalidation
 * - Stale-while-revalidate pattern
 */
export class OPDSFeedCache {
  private memoryCache: Map<string, CachedFeedData> = new Map();
  private shelfCache: Map<string, CachedShelfData> = new Map();
  private readonly maxAge: number;
  private readonly staleAge: number;
  private readonly storageKey = 'opds-feed-cache';
  private readonly shelfStorageKey = 'opds-shelf-cache';
  private readonly cacheVersionKey = 'opds-cache-version';
  private readonly currentVersion = '2.0'; // 增加版本号以清理旧缓存

  constructor(options: FeedCacheOptions = {}) {
    this.maxAge = options.maxAge || 5 * 60 * 1000; // 5 minutes
    this.staleAge = options.staleAge || 1 * 60 * 1000; // 1 minute
    this.checkVersionAndLoadFromStorage();
  }

  /**
   * Check cache version and clear old cache if needed, then load from storage
   */
  private checkVersionAndLoadFromStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storedVersion = localStorage.getItem(this.cacheVersionKey);
      if (storedVersion !== this.currentVersion) {
        console.log(`🔄 Cache version mismatch (stored: ${storedVersion}, current: ${this.currentVersion}), clearing old cache`);
        // Clear old cache data
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.shelfStorageKey);
        localStorage.setItem(this.cacheVersionKey, this.currentVersion);
        return;
      }
    } catch (error) {
      console.error('Failed to check cache version:', error);
      return;
    }

    this.loadFromStorage();
  }

  /**
   * Load cache from localStorage into memory
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      // Load feed cache
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const cacheData = JSON.parse(stored);
        const now = Date.now();

        // Only load entries that are not expired
        Object.entries(cacheData).forEach(([key, data]) => {
          const cachedData = data as CachedFeedData;
          if (now - cachedData.lastUpdated < this.maxAge) {
            this.memoryCache.set(key, cachedData);
          }
        });

        console.log(`📦 Loaded ${this.memoryCache.size} feed cache entries from storage`);
      }

      // Load shelf cache
      const storedShelves = localStorage.getItem(this.shelfStorageKey);
      if (storedShelves) {
        const shelfData = JSON.parse(storedShelves);
        const now = Date.now();

        // Only load entries that are not expired
        Object.entries(shelfData).forEach(([key, data]) => {
          const cachedShelfData = data as CachedShelfData;
          if (now - cachedShelfData.lastUpdated < this.maxAge) {
            this.shelfCache.set(key, cachedShelfData);
          }
        });

        console.log(`📚 Loaded ${this.shelfCache.size} shelf cache entries from storage`);
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
    }
  }

  /**
   * Save cache from memory to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const now = Date.now();

      // Save feed cache
      const cacheData: Record<string, CachedFeedData> = {};
      this.memoryCache.forEach((data, key) => {
        if (now - data.lastUpdated < this.maxAge) {
          cacheData[key] = data;
        }
      });
      localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
      console.log(`💾 Saved ${Object.keys(cacheData).length} feed cache entries to storage`);

      // Save shelf cache
      const shelfData: Record<string, CachedShelfData> = {};
      this.shelfCache.forEach((data, key) => {
        if (now - data.lastUpdated < this.maxAge) {
          shelfData[key] = data;
        }
      });
      localStorage.setItem(this.shelfStorageKey, JSON.stringify(shelfData));
      console.log(`💾 Saved ${Object.keys(shelfData).length} shelf cache entries to storage`);

      // Also save cache version
      localStorage.setItem(this.cacheVersionKey, this.currentVersion);
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
    }
  }

  /**
   * 正确处理UTF-8字符的Base64编码函数
   * 避免中文字符编码问题
   */
  private utf8ToBase64(str: string): string {
    try {
      // 使用TextEncoder确保正确的UTF-8编码
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);

      // 将字节数组转换为字符串
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }

      // 转换为Base64
      return btoa(binary);
    } catch {
      // 备用方案：如果TextEncoder不可用，使用传统方法
      return btoa(unescape(encodeURIComponent(str)));
    }
  }

  /**
   * Generate cache key from URL and credentials
   */
  private getCacheKey(url: string, credentials?: { username: string; password: string }): string {
    const credentialHash = credentials ? this.utf8ToBase64(`${credentials.username}:${credentials.password}`) : '';
    return `${url}${credentialHash ? ':' + credentialHash : ''}`;
  }

  /**
   * Check if cached data is fresh
   */
  private isFresh(data: CachedFeedData): boolean {
    return Date.now() - data.lastUpdated < this.staleAge;
  }

  /**
   * Check if cached data is valid (not expired)
   */
  private isValid(data: CachedFeedData): boolean {
    return Date.now() - data.lastUpdated < this.maxAge;
  }

  /**
   * Get cached feed data
   */
  public get(url: string, credentials?: { username: string; password: string }): {
    data: CachedFeedData | null;
    isFresh: boolean;
    isValid: boolean;
  } {
    const key = this.getCacheKey(url, credentials);
    const cached = this.memoryCache.get(key);

    if (!cached) {
      return { data: null, isFresh: false, isValid: false };
    }

    // Update last accessed time
    cached.lastAccessed = Date.now();

    const isFresh = this.isFresh(cached);
    const isValid = this.isValid(cached);

    console.log(`🔍 Cache lookup for ${url}:`, {
      found: true,
      isFresh,
      isValid,
      age: Date.now() - cached.lastUpdated,
      lastAccessed: new Date(cached.lastAccessed).toLocaleTimeString()
    });

    return { data: cached, isFresh, isValid };
  }

  /**
   * Set cached feed data
   */
  public set(
    url: string,
    feed: OPDSFeed,
    books: OPDSBook[],
    navigationItems: OPDSNavigationItem[],
    credentials?: { username: string; password: string }
  ): void {
    const key = this.getCacheKey(url, credentials);
    const now = Date.now();

    const cacheData: CachedFeedData = {
      feed,
      books,
      navigationItems,
      lastUpdated: now,
      lastAccessed: now
    };

    this.memoryCache.set(key, cacheData);
    this.saveToStorage();

    console.log(`📦 Cached feed data for ${url}:`, {
      booksCount: books.length,
      navigationCount: navigationItems.length,
      timestamp: new Date(now).toLocaleTimeString()
    });
  }

  /**
   * Check if cache has entry for URL
   */
  public has(url: string, credentials?: { username: string; password: string }): boolean {
    const key = this.getCacheKey(url, credentials);
    const cached = this.memoryCache.get(key);
    return cached ? this.isValid(cached) : false;
  }

  /**
   * Remove cached entry
   */
  public delete(url: string, credentials?: { username: string; password: string }): boolean {
    const key = this.getCacheKey(url, credentials);
    const deleted = this.memoryCache.delete(key);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    this.memoryCache.clear();
    this.shelfCache.clear();
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.shelfStorageKey);
      localStorage.removeItem(this.cacheVersionKey);
    }
    console.log('🗑️ Cleared all feed and shelf cache');
  }

  /**
   * Clean up expired entries
   */
  public cleanup(): void {
    const beforeFeed = this.memoryCache.size;
    const beforeShelf = this.shelfCache.size;

    // Clean up feed cache
    for (const [key, data] of this.memoryCache.entries()) {
      if (!this.isValid(data)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean up shelf cache
    for (const [key, data] of this.shelfCache.entries()) {
      if (!this.isValid(data)) {
        this.shelfCache.delete(key);
      }
    }

    const removedFeed = beforeFeed - this.memoryCache.size;
    const removedShelf = beforeShelf - this.shelfCache.size;
    const totalRemoved = removedFeed + removedShelf;

    if (totalRemoved > 0) {
      this.saveToStorage();
      console.log(`🧹 Cleaned up ${totalRemoved} expired cache entries (${removedFeed} feed, ${removedShelf} shelf)`);
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    totalEntries: number;
    freshEntries: number;
    staleEntries: number;
    expiredEntries: number;
    shelfEntries: number;
  } {
    const now = Date.now();
    let fresh = 0;
    let stale = 0;
    let expired = 0;

    this.memoryCache.forEach(data => {
      const age = now - data.lastUpdated;
      if (age < this.staleAge) {
        fresh++;
      } else if (age < this.maxAge) {
        stale++;
      } else {
        expired++;
      }
    });

    return {
      totalEntries: this.memoryCache.size,
      freshEntries: fresh,
      staleEntries: stale,
      expiredEntries: expired,
      shelfEntries: this.shelfCache.size
    };
  }

  // ===== SHELF CACHE METHODS =====

  /**
   * Get cached shelf data with immediate memory access
   * This prioritizes memory cache for instant navigation
   */
  public getShelf(url: string, credentials?: { username: string; password: string }): {
    data: CachedShelfData | null;
    isFresh: boolean;
    isValid: boolean;
  } {
    const key = this.getCacheKey(url, credentials);
    const cached = this.shelfCache.get(key);

    if (!cached) {
      return { data: null, isFresh: false, isValid: false };
    }

    // Update last accessed time
    cached.lastAccessed = Date.now();

    const isFresh = this.isFresh(cached);
    const isValid = this.isValid(cached);

    console.log(`📚 Shelf cache lookup for ${url}:`, {
      found: true,
      isFresh,
      isValid,
      age: Date.now() - cached.lastUpdated,
      books: cached.books.length,
      navigation: cached.navigationItems.length,
      lastAccessed: new Date(cached.lastAccessed).toLocaleTimeString()
    });

    return { data: cached, isFresh, isValid };
  }

  /**
   * Set cached shelf data
   */
  public setShelf(
    url: string,
    feed: OPDSFeed,
    books: OPDSBook[],
    navigationItems: OPDSNavigationItem[],
    credentials?: { username: string; password: string },
    parentUrl?: string,
    breadcrumb?: Array<{ title: string; url: string }>
  ): void {
    const key = this.getCacheKey(url, credentials);
    const now = Date.now();

    const cacheData: CachedShelfData = {
      feed,
      books,
      navigationItems,
      parentUrl,
      breadcrumb,
      lastUpdated: now,
      lastAccessed: now
    };

    this.shelfCache.set(key, cacheData);
    this.saveToStorage();

    console.log(`📚 Cached shelf data for ${url}:`, {
      booksCount: books.length,
      navigationCount: navigationItems.length,
      parentUrl,
      breadcrumbLength: breadcrumb?.length || 0,
      timestamp: new Date(now).toLocaleTimeString()
    });
  }

  /**
   * Check if shelf cache has entry for URL
   */
  public hasShelf(url: string, credentials?: { username: string; password: string }): boolean {
    const key = this.getCacheKey(url, credentials);
    const cached = this.shelfCache.get(key);
    return cached ? this.isValid(cached) : false;
  }

  /**
   * Remove cached shelf entry
   */
  public deleteShelf(url: string, credentials?: { username: string; password: string }): boolean {
    const key = this.getCacheKey(url, credentials);
    const deleted = this.shelfCache.delete(key);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * Get parent shelf URL for navigation
   */
  public getParentShelfUrl(url: string, credentials?: { username: string; password: string }): string | null {
    const key = this.getCacheKey(url, credentials);
    const cached = this.shelfCache.get(key);
    return cached?.parentUrl || null;
  }

  /**
   * Get breadcrumb for shelf navigation
   */
  public getShelfBreadcrumb(url: string, credentials?: { username: string; password: string }): Array<{ title: string; url: string }> | null {
    const key = this.getCacheKey(url, credentials);
    const cached = this.shelfCache.get(key);
    return cached?.breadcrumb || null;
  }

  /**
   * Clear all shelf cache
   */
  public clearShelfCache(): void {
    this.shelfCache.clear();
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.shelfStorageKey);
      // Note: Not removing version key since feed cache might still be valid
    }
    console.log('🗑️ Cleared all shelf cache');
  }
}

// Singleton instance
export const opdsFeedCache = new OPDSFeedCache({
  maxAge: 5 * 60 * 1000, // 5 minutes max age
  staleAge: 1 * 60 * 1000 // 1 minute stale age
});