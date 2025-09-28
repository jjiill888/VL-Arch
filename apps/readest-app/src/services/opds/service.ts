import {
  OPDSCredentials,
  OPDSFeed,
  OPDSBook,
  OPDSNavigationItem,
} from './types';
import { OPDSParser } from './parser';
import { opdsFeedCache } from './feedCache';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';

export class OPDSService {
  private parser: OPDSParser;

  constructor() {
    this.parser = new OPDSParser();
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




  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000,
    fetchFn: typeof fetch = fetch
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  private resolveUrl(baseUrl: string, relativeUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).toString();
    } catch {
      return relativeUrl;
    }
  }

  public async fetchFeed(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): Promise<OPDSFeed> {
    console.log('OPDS fetchFeed called (Foliate-style):', {
      url,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform()
    });

    try {
      // First, try to fetch the feed as-is
      let requestUrl = url;
      console.log('🔍 Starting fetchFeed with URL:', requestUrl);
      let feed = await this.fetchFeedInternal(requestUrl, credentials, timeoutMs);
      
      console.log('🔍 Initial feed fetched:', {
        entries: feed.entries.length,
        links: feed.links.length,
        title: feed.title
      });
      
      // If this is a navigation feed (no books, only navigation links), 
      // try to find and navigate to a books feed
      console.log('🔍 About to check if feed is navigation feed...');
      const isNav = this.isNavigationFeed(feed);
      console.log('🔍 Navigation feed check result:', isNav);
      
      if (isNav) {
        console.log('🔍 Detected navigation feed, looking for books feed...');
        console.log('🔍 Navigation feed entries:', feed.entries.length);
        console.log('🔍 Navigation feed links:', feed.links.map(link => ({ rel: link.rel, href: link.href })));
        
        // Look for common books feed links
        const booksFeedLink = this.findBooksFeedLink(feed);
        if (booksFeedLink) {
          console.log('📚 Found books feed link:', booksFeedLink);
          requestUrl = this.resolveUrl(url, booksFeedLink);
          feed = await this.fetchFeedInternal(requestUrl, credentials, timeoutMs);
          console.log('📚 Books feed loaded:', {
            entries: feed.entries.length,
            nextLink: feed.nextLink,
            hasNextLink: !!feed.nextLink
          });
        } else {
          console.log('⚠️ No books feed found in navigation feed');
        }
      }
      
      // Now load ALL books by following all nextLink pages
      if (feed.nextLink) {
        console.log('📚 Starting bulk loading of all books...');
        feed = await this.loadAllBooks(feed, requestUrl, credentials, timeoutMs);
        console.log('📚 Bulk loading completed:', {
          totalEntries: feed.entries.length,
          hasNextLink: !!feed.nextLink
        });
      }
      
      return feed;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw our custom errors
        if (error.message.includes('Authentication required') ||
            error.message.includes('Access forbidden') ||
            error.message.includes('not found') ||
            error.message.includes('Server error') ||
            error.message.includes('Invalid response type') ||
            error.message.includes('Empty response') ||
            error.message.includes('Request timeout')) {
          throw error;
        }
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new Error('网络错误。请检查您的网络连接和URL。');
      }

      // Handle any other errors
      throw new Error(`获取OPDS feed失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private isNavigationFeed(feed: OPDSFeed): boolean {
    console.log('🔍 Checking if feed is navigation feed:', {
      entriesCount: feed.entries.length,
      hasEntries: feed.entries.length > 0
    });

    // Check if this is a navigation feed (no books, only navigation links)
    const hasBooks = feed.entries.some(entry => {
      // Check if entry has acquisition links (downloadable content)
      const hasAcquisition = entry.links.some(link =>
        link.rel.includes('acquisition') ||
        link.type.includes('epub') ||
        link.type.includes('mobi') ||
        link.type.includes('pdf')
      );
      
      if (hasAcquisition) {
        console.log('📚 Found book entry:', entry.title);
      }
      
      return hasAcquisition;
    });

    console.log('🔍 Navigation feed check result:', {
      hasBooks,
      isNavigationFeed: !hasBooks
    });

    // If no books found, it's likely a navigation feed
    return !hasBooks;
  }

  private async loadAllBooks(
    initialFeed: OPDSFeed,
    baseUrl: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): Promise<OPDSFeed> {
    console.log('📚 Starting to load all books from all pages...');
    console.log('📚 Initial feed:', {
      entries: initialFeed.entries.length,
      nextLink: initialFeed.nextLink,
      hasNextLink: !!initialFeed.nextLink
    });
    
    const allEntries = [...initialFeed.entries];
    let currentFeed = initialFeed;
    let pageCount = 1;
    let totalLoaded = initialFeed.entries.length;
    
    while (currentFeed.nextLink) {
      pageCount++;
      console.log(`📚 Loading page ${pageCount}, nextLink: ${currentFeed.nextLink}`);
      
      try {
        const nextUrl = this.resolveUrl(baseUrl, currentFeed.nextLink);
        console.log(`📚 Resolved URL: ${nextUrl}`);
        
        const nextFeed = await this.fetchFeedInternal(nextUrl, credentials, timeoutMs);
        
        console.log(`📚 Page ${pageCount} loaded successfully:`, {
          entries: nextFeed.entries.length,
          nextLink: nextFeed.nextLink,
          hasNextLink: !!nextFeed.nextLink,
          totalLoadedSoFar: totalLoaded + nextFeed.entries.length
        });
        
        // Add new entries to our collection
        allEntries.push(...nextFeed.entries);
        totalLoaded = allEntries.length;
        currentFeed = nextFeed;
        
        // Safety check to prevent infinite loops
        if (pageCount > 50) { // Reduced from 100 to 50 for safety
          console.warn('⚠️ Reached maximum page limit (50), stopping bulk loading');
          break;
        }
        
        // Add a small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error loading page ${pageCount}:`, error);
        console.error(`❌ Failed URL: ${currentFeed.nextLink ? this.resolveUrl(baseUrl, currentFeed.nextLink) : 'unknown'}`);
        // Don't break on error, continue with what we have
        break;
      }
    }
    
    console.log(`📚 Bulk loading completed: ${allEntries.length} total books from ${pageCount} pages`);
    
    // Return the final feed with all entries
    return {
      ...currentFeed,
      entries: allEntries,
      nextLink: undefined // No more pages to load
    };
  }

  private findBooksFeedLink(feed: OPDSFeed): string | null {
    // Look for common books feed links in order of preference
    const preferredPaths = [
      '/opds/books',      // All books
      '/opds/new',        // New books  
      '/opds/unreadbooks', // Unread books
      '/opds/discover',   // Discover
      '/opds/readbooks'   // Read books
    ];

    // First, try to find exact matches
    for (const path of preferredPaths) {
      const link = feed.links.find(link => 
        link.href === path || 
        link.href.endsWith(path) ||
        link.href.includes(path)
      );
      if (link) {
        console.log(`📚 Found preferred books feed: ${path} -> ${link.href}`);
        return link.href;
      }
    }

    // If no exact matches, look for any link that might be a books feed
    const booksFeedLink = feed.links.find(link => {
      const href = link.href.toLowerCase();
      return (
        href.includes('/books') ||
        href.includes('/new') ||
        href.includes('/unread') ||
        href.includes('/discover') ||
        (link.type && link.type.includes('opds-catalog') && !link.type.includes('navigation'))
      );
    });

    if (booksFeedLink) {
      console.log(`📚 Found potential books feed: ${booksFeedLink.href}`);
      return booksFeedLink.href;
    }

    return null;
  }

  private async fetchFeedInternal(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): Promise<OPDSFeed> {
    try {
      // Foliate approach: use the URL as-is, no custom pagination parameters
      const requestUrl = url;

      let response: Response;

      if (isTauriAppPlatform()) {
        // In Tauri, use direct HTTP requests
        const headers: Record<string, string> = {
          'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        };

        // Add Basic Auth if credentials provided
        if (credentials) {
          const credentials_str = `${credentials.username}:${credentials.password}`;
          const base64 = this.utf8ToBase64(credentials_str);
          headers['Authorization'] = `Basic ${base64}`;
        }

        response = await this.fetchWithTimeout(
          requestUrl,
          {
            method: 'GET',
            headers,
          },
          timeoutMs,
          tauriFetch
        );
      } else {
        // In web, use proxy API to avoid CORS issues
        const proxyUrl = new URL('/api/opds/proxy', window.location.origin);
        proxyUrl.searchParams.set('url', requestUrl);

        if (credentials) {
          proxyUrl.searchParams.set('username', credentials.username);
          proxyUrl.searchParams.set('password', credentials.password);
        }

        response = await this.fetchWithTimeout(
          proxyUrl.toString(),
          {
            method: 'GET',
            headers: {
              'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
              'User-Agent': 'Readest/1.0 (OPDS Client)',
            },
          },
          timeoutMs
        );
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('此OPDS服务器需要认证。请提供正确的用户名和密码。');
        } else if (response.status === 403) {
          throw new Error('访问被拒绝。您可能没有权限访问此图书馆。');
        } else if (response.status === 404) {
          throw new Error('OPDS目录未找到。请检查URL是否正确。');
        } else if (response.status >= 500) {
          throw new Error('服务器错误。请稍后重试。');
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const xmlText = await response.text();
      if (!xmlText.trim()) {
        throw new Error('服务器返回空响应。');
      }

      // Debug: Log the raw response for analysis
      console.log('🔍 Raw OPDS response received:', {
        url: requestUrl,
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: xmlText.length,
        first500Chars: xmlText.substring(0, 500),
        last500Chars: xmlText.substring(Math.max(0, xmlText.length - 500))
      });

      // 检查内容格式
      const trimmedText = xmlText.trim();
      if (!trimmedText.startsWith('<')) {
        throw new Error('无效的响应类型。期望OPDS feed (XML/Atom格式)。');
      }

      // 检查是否是有效的OPDS feed
      if (!trimmedText.includes('feed') && !trimmedText.includes('atom') && !trimmedText.includes('entry')) {
        // 如果内容看起来像HTML重定向页面，提供更具体的错误信息
        if (trimmedText.includes('<html') || trimmedText.includes('<!doctype')) {
          if (trimmedText.includes('Unauthorized Access')) {
            throw new Error('OPDS功能未启用或需要管理员权限。请联系Calibre-Web管理员启用OPDS功能。');
          }
          throw new Error('服务器返回了HTML页面而不是OPDS feed。可能需要重新认证或OPDS功能未启用。');
        }
        throw new Error('无效的OPDS feed格式。响应内容不包含feed元素。');
      }

      // Debug: Check for pagination links in raw XML
      const nextLinkMatches = xmlText.match(/<link[^>]*rel=["']next["'][^>]*>/gi);
      const prevLinkMatches = xmlText.match(/<link[^>]*rel=["']prev["'][^>]*>/gi);
      console.log('🔍 Raw XML pagination links found:', {
        nextLinks: nextLinkMatches || [],
        prevLinks: prevLinkMatches || [],
        hasNextInRaw: !!nextLinkMatches
      });

      const feed = this.parser.parseFeed(xmlText);

      // Debug: Log feed information (Foliate-style)
      console.log('✅ Parsed OPDS feed successfully:', {
        id: feed.id,
        title: feed.title,
        entriesCount: feed.entries.length,
        requestUrl: requestUrl,
        nextLink: feed.nextLink,
        hasNextLink: !!feed.nextLink
      });
      
      // Log all links to see what pagination links are available
      console.log('All feed links:', feed.links.map(link => ({
        rel: link.rel,
        href: link.href,
        type: link.type
      })));
      
      // Log the first few entry IDs to see if we're getting different books
      if (feed.entries.length > 0) {
        console.log('First few entry IDs:', feed.entries.slice(0, 3).map(entry => entry.id));
        console.log('First few entry titles:', feed.entries.slice(0, 3).map(entry => entry.title));
      }

      // Resolve relative URLs to absolute URLs

      feed.links = feed.links.map(link => ({
        ...link,
        href: this.resolveUrl(url, link.href),
      }));

      feed.entries = feed.entries.map(entry => ({
        ...entry,
        links: entry.links.map(link => ({
          ...link,
          href: this.resolveUrl(url, link.href),
        })),
      }));

      // Resolve pagination links
      feed.nextLink = feed.links.find(link => link.rel === 'next')?.href;
      feed.prevLink = feed.links.find(link => link.rel === 'previous')?.href;

      return feed;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw our custom errors
        if (error.message.includes('Authentication required') ||
            error.message.includes('Access forbidden') ||
            error.message.includes('not found') ||
            error.message.includes('Server error') ||
            error.message.includes('Invalid response type') ||
            error.message.includes('Empty response') ||
            error.message.includes('Request timeout')) {
          throw error;
        }
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new Error('网络错误。请检查您的网络连接和URL。');
      }

      // Handle any other errors
      throw new Error(`获取OPDS feed失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  public async testConnection(url: string, credentials?: OPDSCredentials): Promise<boolean> {
    try {
      await this.fetchFeed(url, credentials, 10000); // 10 second timeout for testing
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch shelf data with intelligent caching strategy
   * Prioritizes memory cache for instant navigation, falls back to network
   */
  public async fetchShelfByLink(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number,
    forceRefresh: boolean = false,
    parentUrl?: string,
    breadcrumb?: Array<{ title: string; url: string }>
  ): Promise<OPDSFeed> {
    console.log('OPDS fetchShelfByLink called:', {
      url,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform(),
      forceRefresh,
      parentUrl,
      breadcrumbLength: breadcrumb?.length || 0
    });

    // Check shelf cache first (unless force refresh is requested)
    if (!forceRefresh) {
      const cached = opdsFeedCache.getShelf(url, credentials);

      if (cached.data && cached.isValid) {
        if (cached.isFresh) {
          // Fresh cache hit - return immediately
          console.log('⚡ Shelf cache hit (fresh):', {
            url,
            age: Date.now() - cached.data.lastUpdated,
            books: cached.data.books.length,
            navigation: cached.data.navigationItems.length
          });
          return cached.data.feed;
        } else {
          // Stale cache - return immediately but trigger background refresh
          console.log('📦 Shelf cache hit (stale):', {
            url,
            age: Date.now() - cached.data.lastUpdated,
            books: cached.data.books.length,
            navigation: cached.data.navigationItems.length
          });

          // Trigger background refresh
          this.refreshShelfCacheInBackground(url, credentials, timeoutMs, parentUrl, breadcrumb);

          return cached.data.feed;
        }
      }
    }

    // Cache miss or force refresh - fetch from network
    return this.fetchFeedByLink(url, credentials, timeoutMs, forceRefresh, parentUrl, breadcrumb);
  }

  public async fetchFeedByLink(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number,
    forceRefresh: boolean = false,
    parentUrl?: string,
    breadcrumb?: Array<{ title: string; url: string }>
  ): Promise<OPDSFeed> {
    console.log('OPDS fetchFeedByLink called:', {
      url,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform(),
      forceRefresh
    });

    // Check cache first (unless force refresh is requested)
    if (!forceRefresh) {
      const cached = opdsFeedCache.get(url, credentials);

      if (cached.data && cached.isValid) {
        if (cached.isFresh) {
          // Fresh cache hit - return immediately
          console.log('⚡ Cache hit (fresh):', {
            url,
            age: Date.now() - cached.data.lastUpdated,
            books: cached.data.books.length,
            navigation: cached.data.navigationItems.length
          });
          return cached.data.feed;
        } else {
          // Stale cache - return immediately but trigger background refresh
          console.log('📦 Cache hit (stale):', {
            url,
            age: Date.now() - cached.data.lastUpdated,
            books: cached.data.books.length,
            navigation: cached.data.navigationItems.length
          });

          // Trigger background refresh
          this.refreshCacheInBackground(url, credentials, timeoutMs);

          return cached.data.feed;
        }
      }
    }

    try {
      let response: Response;

      if (isTauriAppPlatform()) {
        // In Tauri, use direct HTTP requests
        const headers: Record<string, string> = {
          'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        };

        if (credentials) {
          const credentials_str = `${credentials.username}:${credentials.password}`;
          const base64 = this.utf8ToBase64(credentials_str);
          headers['Authorization'] = `Basic ${base64}`;
        }

        response = await this.fetchWithTimeout(
          url,
          { headers },
          timeoutMs || 30000,
          tauriFetch
        );
      } else {
        // In web, use fetch with credentials
        const init: RequestInit = {
          headers: {
            'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
            'User-Agent': 'Readest/1.0 (OPDS Client)',
          },
          credentials: credentials ? 'include' : 'omit',
        };

        if (credentials) {
          const credentials_str = `${credentials.username}:${credentials.password}`;
          const base64 = this.utf8ToBase64(credentials_str);
          init.headers = {
            ...init.headers,
            'Authorization': `Basic ${base64}`,
          };
        }

        response = await this.fetchWithTimeout(url, init, timeoutMs || 30000);
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        if (response.status === 403) {
          throw new Error('Access forbidden');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      if (!xmlText.trim()) {
        throw new Error('Empty response from server');
      }

      // Check if response is HTML (error page)
      if (xmlText.trim().startsWith('<!DOCTYPE html') || xmlText.trim().startsWith('<html')) {
        throw new Error('服务器返回了HTML页面而不是OPDS feed。可能需要重新认证或OPDS功能未启用。');
      }

      const feed = this.parser.parseFeed(xmlText);

      // Debug: Log feed information
      console.log('Parsed OPDS feed (by link):', {
        id: feed.id,
        title: feed.title,
        entriesCount: feed.entries.length,
        totalResults: feed.opensearchTotalResults,
        startIndex: feed.opensearchStartIndex,
        itemsPerPage: feed.opensearchItemsPerPage,
        nextLink: feed.nextLink,
        prevLink: feed.prevLink,
        requestUrl: url
      });

      // Resolve relative URLs to absolute URLs
      feed.links = feed.links.map(link => ({
        ...link,
        href: this.resolveUrl(url, link.href),
      }));

      feed.entries = feed.entries.map(entry => ({
        ...entry,
        links: entry.links.map(link => ({
          ...link,
          href: this.resolveUrl(url, link.href),
        })),
      }));

      // Resolve pagination links
      feed.nextLink = feed.links.find(link => link.rel === 'next')?.href;
      feed.prevLink = feed.links.find(link => link.rel === 'previous')?.href;

      // Extract books and navigation items for caching
      const books = this.getBooks(feed);
      const navigationItems = this.getNavigationItems(feed);

      // Cache the feed data (both regular feed cache and shelf cache)
      opdsFeedCache.set(url, feed, books, navigationItems, credentials);
      
      // Also cache as shelf data if parentUrl or breadcrumb is provided
      if (parentUrl || breadcrumb) {
        opdsFeedCache.setShelf(url, feed, books, navigationItems, credentials, parentUrl, breadcrumb);
      }

      console.log('✅ Feed fetched and cached:', {
        url,
        books: books.length,
        navigation: navigationItems.length,
        cacheKey: url,
        isShelf: !!(parentUrl || breadcrumb)
      });

      return feed;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw our custom errors
        if (error.message.includes('Authentication required') ||
            error.message.includes('Access forbidden') ||
            error.message.includes('服务器返回了HTML页面') ||
            error.message.includes('Empty response') ||
            error.message.includes('无效的OPDS feed格式')) {
          throw error;
        }
      }
      // Handle any other errors
      throw new Error(`获取OPDS feed失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * Background refresh for stale cache entries
   * This method runs asynchronously and doesn't block the UI
   */
  private refreshCacheInBackground(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): void {
    // Run in background without awaiting
    this.fetchFeedByLink(url, credentials, timeoutMs, true)
      .then(() => {
        console.log('🔄 Background cache refresh completed for:', url);
      })
      .catch(error => {
        console.warn('⚠️ Background cache refresh failed for:', url, error);
      });
  }

  /**
   * Background refresh for stale shelf cache entries
   * This method runs asynchronously and doesn't block the UI
   */
  private refreshShelfCacheInBackground(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number,
    parentUrl?: string,
    breadcrumb?: Array<{ title: string; url: string }>
  ): void {
    // Run in background without awaiting
    this.fetchFeedByLink(url, credentials, timeoutMs, true, parentUrl, breadcrumb)
      .then(() => {
        console.log('🔄 Background shelf cache refresh completed for:', url);
      })
      .catch(error => {
        console.warn('⚠️ Background shelf cache refresh failed for:', url, error);
      });
  }

  public async testPagination(url: string, credentials?: OPDSCredentials): Promise<void> {
    console.log('🔍 Testing OPDS pagination (Foliate-style) for:', url);

    try {
      // Test initial feed
      console.log('📖 Fetching initial feed...');
      const initialFeed = await this.fetchFeed(url, credentials, 10000);

      console.log('📊 Initial feed results:', {
        entries: initialFeed.entries.length,
        nextLink: initialFeed.nextLink,
        hasNextLink: !!initialFeed.nextLink,
        totalResults: initialFeed.opensearchTotalResults,
        startIndex: initialFeed.opensearchStartIndex,
        itemsPerPage: initialFeed.opensearchItemsPerPage,
        allLinks: initialFeed.links.map(link => ({ rel: link.rel, href: link.href }))
      });

      // Test nextLink if available (Foliate approach)
      if (initialFeed.nextLink) {
        console.log('🔗 Testing nextLink (Foliate approach):', initialFeed.nextLink);

        try {
          const nextFeed = await this.fetchFeedByLink(initialFeed.nextLink, credentials, 10000);
          console.log('📖 NextLink feed results:', {
            entries: nextFeed.entries.length,
            nextLink: nextFeed.nextLink,
            hasNextLink: !!nextFeed.nextLink,
            totalResults: nextFeed.opensearchTotalResults,
            startIndex: nextFeed.opensearchStartIndex,
            itemsPerPage: nextFeed.opensearchItemsPerPage
          });

          // Compare with initial feed to confirm different books
          const initialIds = initialFeed.entries.slice(0, 3).map(e => e.id);
          const nextIds = nextFeed.entries.slice(0, 3).map(e => e.id);
          const hasOverlap = initialIds.some(id => nextIds.includes(id));

          console.log('🔍 Pagination test result:', hasOverlap ? '❌ SAME BOOKS (pagination not working)' : '✅ DIFFERENT BOOKS (pagination working correctly)');

          if (!hasOverlap) {
            console.log('✅ Pagination is working! Foliate-style approach successful.');
            
            // Test loading multiple pages to ensure it can go beyond 12 books
            console.log('🔄 Testing multiple page loading...');
            let currentFeed = nextFeed;
            let pageCount = 2; // We've loaded 2 pages so far
            const maxPages = 5; // Test up to 5 pages
            
            while (currentFeed.nextLink && pageCount < maxPages) {
              console.log(`📄 Loading page ${pageCount + 1}...`);
              const nextPageFeed = await this.fetchFeedByLink(currentFeed.nextLink, credentials, 10000);
              
              console.log(`📖 Page ${pageCount + 1} results:`, {
                entries: nextPageFeed.entries.length,
                nextLink: nextPageFeed.nextLink,
                hasNextLink: !!nextPageFeed.nextLink
              });
              
              pageCount++;
              currentFeed = nextPageFeed;
            }
            
            console.log(`✅ Successfully loaded ${pageCount} pages. Total books tested: ${pageCount * 12} (estimated)`);
          }
        } catch (nextError) {
          console.error('❌ NextLink failed:', nextError);
        }
      } else {
        console.log('❌ No nextLink found in initial feed. Server might not support pagination or there are no more pages.');
      }

    } catch (error) {
      console.error('❌ Pagination test failed:', error);
    }
  }

  public getBooks(feed: OPDSFeed): OPDSBook[] {
    return feed.entries
      .filter(entry => {
        // First check if it's explicitly a navigation item
        const isNavigation = entry.links.some(link =>
          link.rel === 'subsection' ||
          link.type.includes('opds-catalog') ||
          link.type.includes('opds-navigation') ||
          (link.rel.includes('collection') && !link.type.includes('epub') && !link.type.includes('mobi') && !link.type.includes('pdf'))
        );
        
        if (isNavigation) {
          return false;
        }
        
        // Then check if it has acquisition links (downloadable content)
        return entry.links.some(link =>
          link.rel.includes('acquisition') ||
          link.type.includes('epub') ||
          link.type.includes('mobi') ||
          link.type.includes('pdf') ||
          link.type.includes('application/x-cbz') ||
          link.type.includes('application/x-cbr')
        );
      })
      .map(entry => this.parser.entryToBook(entry));
  }

  public getNavigationItems(feed: OPDSFeed): OPDSNavigationItem[] {
    return feed.entries
      .filter(entry =>
        entry.links.some(link =>
          link.rel === 'subsection' ||
          link.type.includes('opds-catalog') ||
          link.type.includes('opds-navigation') ||
          (link.rel.includes('collection') && !link.type.includes('epub') && !link.type.includes('mobi') && !link.type.includes('pdf'))
        )
      )
      .map(entry => this.parser.entryToNavigationItem(entry));
  }

  public async fetchImage(
    imageUrl: string,
    credentials?: OPDSCredentials
  ): Promise<Blob> {
    console.log('OPDS fetchImage called:', {
      imageUrl,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform()
    });

    try {
      let response: Response;

      if (isTauriAppPlatform()) {
        // In Tauri, use direct HTTP requests
        const headers: Record<string, string> = {
          'Accept': 'image/jpeg, image/png, image/gif, image/webp, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        };

        // Add Basic Auth if credentials provided
        if (credentials) {
          const credentials_str = `${credentials.username}:${credentials.password}`;
          const base64 = this.utf8ToBase64(credentials_str);
          headers['Authorization'] = `Basic ${base64}`;
        }

        response = await this.fetchWithTimeout(
          imageUrl,
          {
            method: 'GET',
            headers,
          },
          30000, // 30 second timeout for images
          tauriFetch
        );
      } else {
        // In web, use proxy API to avoid CORS issues
        const proxyUrl = new URL('/api/opds/proxy', window.location.origin);
        proxyUrl.searchParams.set('url', imageUrl);

        if (credentials) {
          proxyUrl.searchParams.set('username', credentials.username);
          proxyUrl.searchParams.set('password', credentials.password);
        }

        response = await this.fetchWithTimeout(
          proxyUrl.toString(),
          {
            method: 'GET',
            headers: {
              'Accept': 'image/jpeg, image/png, image/gif, image/webp, */*',
              'User-Agent': 'Readest/1.0 (OPDS Client)',
            },
          },
          30000 // 30 second timeout for images
        );
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('图片需要认证。');
        } else if (response.status === 403) {
          throw new Error('您没有权限访问此图片。');
        } else if (response.status === 404) {
          throw new Error('图片未找到。');
        } else {
          throw new Error(`获取图片失败: HTTP ${response.status}`);
        }
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('获取的图片文件为空。');
      }

      return blob;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`获取图片失败: ${error}`);
    }
  }

  /**
   * Navigate to parent shelf using cached data
   * Returns immediately if cached, otherwise fetches from network
   */
  public async navigateToParentShelf(
    currentUrl: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): Promise<OPDSFeed | null> {
    const parentUrl = opdsFeedCache.getParentShelfUrl(currentUrl, credentials);
    
    if (!parentUrl) {
      console.log('📚 No parent shelf found for:', currentUrl);
      return null;
    }

    console.log('📚 Navigating to parent shelf:', parentUrl);
    
    // Get current breadcrumb and remove the last item
    const currentBreadcrumb = opdsFeedCache.getShelfBreadcrumb(currentUrl, credentials);
    const parentBreadcrumb = currentBreadcrumb ? currentBreadcrumb.slice(0, -1) : undefined;

    return this.fetchShelfByLink(parentUrl, credentials, timeoutMs, false, undefined, parentBreadcrumb);
  }

  /**
   * Navigate to a specific shelf using cached data
   * Returns immediately if cached, otherwise fetches from network
   */
  public async navigateToShelf(
    shelfUrl: string,
    shelfTitle: string,
    parentUrl: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number,
    currentBreadcrumb?: Array<{ title: string; url: string }>
  ): Promise<OPDSFeed> {
    // Build new breadcrumb
    const newBreadcrumb = currentBreadcrumb ? 
      [...currentBreadcrumb, { title: shelfTitle, url: shelfUrl }] :
      [{ title: shelfTitle, url: shelfUrl }];

    console.log('📚 Navigating to shelf:', {
      shelfUrl,
      shelfTitle,
      parentUrl,
      breadcrumbLength: newBreadcrumb.length
    });

    return this.fetchShelfByLink(shelfUrl, credentials, timeoutMs, false, parentUrl, newBreadcrumb);
  }

  /**
   * Get breadcrumb for current shelf
   */
  public getCurrentBreadcrumb(url: string, credentials?: OPDSCredentials): Array<{ title: string; url: string }> | null {
    return opdsFeedCache.getShelfBreadcrumb(url, credentials);
  }

  /**
   * Check if shelf is cached and fresh
   */
  public isShelfCached(url: string, credentials?: OPDSCredentials): boolean {
    return opdsFeedCache.hasShelf(url, credentials);
  }

  public async downloadBook(
    book: OPDSBook,
    credentials?: OPDSCredentials
  ): Promise<ArrayBuffer> {
    const downloadLink = book.downloadLinks.find(link =>
      link.type === 'application/epub+zip' ||
      link.type === 'application/x-mobipocket-ebook' ||
      link.type === 'application/pdf'
    );

      if (!downloadLink) {
        throw new Error('未找到此书籍的可下载格式。');
      }

    try {
      let response: Response;

      if (isTauriAppPlatform()) {
        // In Tauri, use direct HTTP requests
        const headers: Record<string, string> = {
          'Accept': 'application/epub+zip, application/pdf, application/x-mobipocket-ebook, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        };

        // Add Basic Auth if credentials provided
        if (credentials) {
          const credentials_str = `${credentials.username}:${credentials.password}`;
          const base64 = this.utf8ToBase64(credentials_str);
          headers['Authorization'] = `Basic ${base64}`;
        }

        response = await this.fetchWithTimeout(
          downloadLink.href,
          {
            method: 'GET',
            headers,
          },
          60000, // 60 second timeout for downloads
          tauriFetch
        );
      } else {
        // In web, use proxy API to avoid CORS issues
        const proxyUrl = new URL('/api/opds/proxy', window.location.origin);
        proxyUrl.searchParams.set('url', downloadLink.href);

        if (credentials) {
          proxyUrl.searchParams.set('username', credentials.username);
          proxyUrl.searchParams.set('password', credentials.password);
        }

        response = await this.fetchWithTimeout(
          proxyUrl.toString(),
          {
            method: 'GET',
            headers: {
              'Accept': 'application/epub+zip, application/pdf, application/x-mobipocket-ebook, */*',
              'User-Agent': 'Readest/1.0 (OPDS Client)',
            },
          },
          60000 // 60 second timeout for downloads
        );
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('下载此书籍需要认证。');
        } else if (response.status === 403) {
          throw new Error('您没有权限下载此书籍。');
        } else {
          throw new Error(`下载书籍失败: HTTP ${response.status}`);
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('下载的书籍文件为空。');
      }

      return arrayBuffer;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`下载书籍失败: ${error}`);
    }
  }
}