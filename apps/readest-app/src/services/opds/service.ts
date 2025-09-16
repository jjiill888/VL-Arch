import {
  OPDSCredentials,
  OPDSFeed,
  OPDSBook,
  OPDSNavigationItem,
} from './types';
import { OPDSParser } from './parser';

export class OPDSService {
  private parser: OPDSParser;

  constructor() {
    this.parser = new OPDSParser();
  }




  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
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
    try {
      // 使用代理API来避免CORS问题
      const proxyUrl = new URL('/api/opds/proxy', window.location.origin);
      proxyUrl.searchParams.set('url', url);
      
      if (credentials) {
        proxyUrl.searchParams.set('username', credentials.username);
        proxyUrl.searchParams.set('password', credentials.password);
      }

      const response = await this.fetchWithTimeout(
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

  public getBooks(feed: OPDSFeed): OPDSBook[] {
    return feed.entries
      .filter(entry =>
        entry.links.some(link =>
          link.rel.includes('acquisition') ||
          link.type.includes('epub') ||
          link.type.includes('mobi') ||
          link.type.includes('pdf')
        )
      )
      .map(entry => this.parser.entryToBook(entry));
  }

  public getNavigationItems(feed: OPDSFeed): OPDSNavigationItem[] {
    return feed.entries
      .filter(entry =>
        entry.links.some(link =>
          link.rel === 'subsection' ||
          link.type.includes('opds-catalog') ||
          (!link.rel.includes('acquisition') && !link.type.includes('epub') && !link.type.includes('mobi'))
        )
      )
      .map(entry => this.parser.entryToNavigationItem(entry));
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
      // 使用代理API来避免CORS问题
      const proxyUrl = new URL('/api/opds/proxy', window.location.origin);
      proxyUrl.searchParams.set('url', downloadLink.href);
      
      if (credentials) {
        proxyUrl.searchParams.set('username', credentials.username);
        proxyUrl.searchParams.set('password', credentials.password);
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/epub+zip, application/pdf, application/x-mobipocket-ebook, */*',
          'User-Agent': 'Readest/1.0 (OPDS Client)',
        },
      });

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