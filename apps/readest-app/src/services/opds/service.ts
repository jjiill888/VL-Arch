import {
  OPDSCredentials,
  OPDSFeed,
  OPDSBook,
  OPDSNavigationItem,
} from './types';
import { OPDSParser } from './parser';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';

export class OPDSService {
  private parser: OPDSParser;

  constructor() {
    this.parser = new OPDSParser();
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
    timeoutMs?: number,
    page?: number,
    itemsPerPage?: number
  ): Promise<OPDSFeed> {
    console.log('OPDS fetchFeed called:', {
      url,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform(),
      page,
      itemsPerPage
    });

    try {
      // Use the URL as-is for now - we'll handle pagination through links
      let requestUrl = url;
      
      // Add pagination parameters for Calibre-Web
      if (page !== undefined && page > 1) {
        const urlObj = new URL(url);
        const pageSize = itemsPerPage || 20;
        const startIndex = (page - 1) * pageSize;
        
        // Calibre-Web specific pagination parameters
        urlObj.searchParams.set('start', startIndex.toString());
        urlObj.searchParams.set('size', pageSize.toString());
        
        // Also try other common parameters
        urlObj.searchParams.set('page', page.toString());
        urlObj.searchParams.set('limit', pageSize.toString());
        urlObj.searchParams.set('count', pageSize.toString());
        
        requestUrl = urlObj.toString();
        console.log('Modified URL for Calibre-Web pagination:', requestUrl);
      } else if (page === 1 && itemsPerPage !== undefined) {
        // Even for page 1, try to set size parameter
        const urlObj = new URL(url);
        urlObj.searchParams.set('size', itemsPerPage.toString());
        urlObj.searchParams.set('limit', itemsPerPage.toString());
        requestUrl = urlObj.toString();
        console.log('Modified URL for Calibre-Web size parameter:', requestUrl);
      }

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
          const base64 = btoa(unescape(encodeURIComponent(credentials_str)));
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

      const feed = this.parser.parseFeed(xmlText);

      // Debug: Log feed information
      console.log('Parsed OPDS feed:', {
        id: feed.id,
        title: feed.title,
        entriesCount: feed.entries.length,
        totalResults: feed.opensearchTotalResults,
        startIndex: feed.opensearchStartIndex,
        itemsPerPage: feed.opensearchItemsPerPage,
        requestUrl: requestUrl,
        requestedPage: page,
        requestedItemsPerPage: itemsPerPage,
        nextLink: feed.nextLink,
        prevLink: feed.prevLink,
        firstLink: feed.firstLink,
        lastLink: feed.lastLink
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

  public async fetchFeedByLink(
    url: string,
    credentials?: OPDSCredentials,
    timeoutMs?: number
  ): Promise<OPDSFeed> {
    console.log('OPDS fetchFeedByLink called:', {
      url,
      hasCredentials: !!credentials,
      isTauri: isTauriAppPlatform()
    });

    try {
      let response: Response;

      if (isTauriAppPlatform()) {
        // In Tauri, use direct HTTP requests
        const headers: Record<string, string> = {
          'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        };

        if (credentials) {
          const auth = btoa(`${credentials.username}:${credentials.password}`);
          headers['Authorization'] = `Basic ${auth}`;
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
          const auth = btoa(`${credentials.username}:${credentials.password}`);
          init.headers = {
            ...init.headers,
            'Authorization': `Basic ${auth}`,
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

  public async testPagination(url: string, credentials?: OPDSCredentials): Promise<void> {
    console.log('Testing Calibre-Web OPDS pagination for:', url);
    
    try {
      // Test page 1 with size parameter
      console.log('Testing page 1 with size=50...');
      const feed1 = await this.fetchFeed(url, credentials, 10000, 1, 50);
      console.log('Page 1 results:', {
        entries: feed1.entries.length,
        totalResults: feed1.opensearchTotalResults,
        startIndex: feed1.opensearchStartIndex,
        itemsPerPage: feed1.opensearchItemsPerPage,
        nextLink: feed1.nextLink,
        prevLink: feed1.prevLink
      });
      
      // Test page 2 with start/size parameters
      console.log('Testing page 2 with start=50&size=50...');
      const feed2 = await this.fetchFeed(url, credentials, 10000, 2, 50);
      console.log('Page 2 results:', {
        entries: feed2.entries.length,
        totalResults: feed2.opensearchTotalResults,
        startIndex: feed2.opensearchStartIndex,
        itemsPerPage: feed2.opensearchItemsPerPage,
        nextLink: feed2.nextLink,
        prevLink: feed2.prevLink
      });
      
      // Test using nextLink if available
      if (feed1.nextLink) {
        console.log('Testing nextLink:', feed1.nextLink);
        const feed3 = await this.fetchFeedByLink(feed1.nextLink, credentials, 10000);
        console.log('NextLink results:', {
          entries: feed3.entries.length,
          totalResults: feed3.opensearchTotalResults,
          startIndex: feed3.opensearchStartIndex,
          itemsPerPage: feed3.opensearchItemsPerPage
        });
      }
      
      // Compare results
      if (feed1.entries.length > 0 && feed2.entries.length > 0) {
        const page1Ids = feed1.entries.map(e => e.id);
        const page2Ids = feed2.entries.map(e => e.id);
        const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
        console.log('Page overlap check:', hasOverlap ? 'SAME BOOKS (pagination not working)' : 'DIFFERENT BOOKS (pagination working)');
        
        if (hasOverlap) {
          console.log('Page 1 IDs:', page1Ids.slice(0, 5));
          console.log('Page 2 IDs:', page2Ids.slice(0, 5));
        }
      }
      
      // Test different size parameters
      console.log('Testing with size=100...');
      const feedLarge = await this.fetchFeed(url, credentials, 10000, 1, 100);
      console.log('Large size results:', {
        entries: feedLarge.entries.length,
        totalResults: feedLarge.opensearchTotalResults
      });
      
    } catch (error) {
      console.error('Calibre-Web pagination test failed:', error);
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
          const base64 = btoa(unescape(encodeURIComponent(credentials_str)));
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
          const base64 = btoa(unescape(encodeURIComponent(credentials_str)));
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