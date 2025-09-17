import {
  OPDSFeed,
  OPDSEntry,
  OPDSFeedLink,
  OPDSBook,
  OPDSNavigationItem,
  OPDSLinkRel,
  OPDSMimeType,
} from './types';
import { getFeed, SYMBOL } from 'foliate-js/opds.js';

// Type definitions for foliate-js OPDS structures
interface FoliatePublication {
  metadata: {
    title?: string;
    author?: Array<{ name: string }>;
    publisher?: string;
    published?: string;
    language?: string;
    identifier?: string;
    subject?: Array<{ name?: string; code?: string }>;
    [key: symbol]: unknown;
  };
  links: Array<{ rel: string | string[]; type: string; href: string; title?: string }>;
}

interface FoliateNavigation {
  title: string;
  href: string;
  type?: string;
  [key: symbol]: unknown;
}

interface FoliateFeed {
  metadata: {
    title?: string;
    subtitle?: string;
  };
  links?: Array<{ rel: string | string[]; type: string; href: string; title?: string }>;
  publications?: FoliatePublication[];
  navigation?: FoliateNavigation[];
}

export class OPDSParser {
  private getTextContent(element: Element | null): string {
    return element?.textContent?.trim() || '';
  }

  private getAttributeValue(element: Element | null, attribute: string): string {
    return element?.getAttribute(attribute) || '';
  }

  private parseLinks(entryElement: Element): OPDSFeedLink[] {
    const linkElements = entryElement.querySelectorAll('link');
    const links: OPDSFeedLink[] = [];

    linkElements.forEach((linkEl) => {
      const rel = this.getAttributeValue(linkEl, 'rel');
      const type = this.getAttributeValue(linkEl, 'type');
      const href = this.getAttributeValue(linkEl, 'href');
      const title = this.getAttributeValue(linkEl, 'title');

      if (href) {
        links.push({
          rel,
          type,
          href,
          ...(title && { title }),
        });
      }
    });

    return links;
  }

  private extractNextLink(doc: Document): string | undefined {
    console.log('🔍 Starting nextLink extraction...');

    // Debug: Log all links in the feed to see what we have
    const allFeedLinks = doc.querySelectorAll('feed link, feed > link');
    console.log('🔍 All feed links found:', Array.from(allFeedLinks).map(link => ({
      rel: link.getAttribute('rel'),
      href: link.getAttribute('href'),
      title: link.getAttribute('title'),
      tagName: link.tagName
    })));

    // Method 1: Direct CSS selector
    const nextLinkElement = doc.querySelector('feed > link[rel="next"]');
    if (nextLinkElement) {
      const href = nextLinkElement.getAttribute('href');
      console.log('🔗 Found nextLink via direct selector:', href);
      return href || undefined;
    }

    // Method 2: Case-insensitive search through all feed links
    const feedLinks = doc.querySelectorAll('feed link, feed > link');
    for (const link of Array.from(feedLinks)) {
      const rel = link.getAttribute('rel')?.toLowerCase();
      const href = link.getAttribute('href');
      if (rel === 'next' && href) {
        console.log('🔗 Found nextLink via case-insensitive search:', href);
        return href;
      }
    }

    // Method 3: Search in any namespace
    const allLinks = doc.querySelectorAll('link');
    for (const link of Array.from(allLinks)) {
      const rel = link.getAttribute('rel')?.toLowerCase();
      const href = link.getAttribute('href');
      if (rel === 'next' && href) {
        console.log('🔗 Found nextLink via global search:', href);
        return href;
      }
    }

    console.log('❌ No nextLink found in feed after exhaustive search');
    return undefined;
  }

  private parseAuthors(entryElement: Element): string[] {
    const authorElements = entryElement.querySelectorAll('author name');
    const authors: string[] = [];

    authorElements.forEach((authorEl) => {
      const name = this.getTextContent(authorEl);
      if (name) {
        authors.push(name);
      }
    });

    return authors;
  }

  private parseCategories(entryElement: Element): Array<{ term: string; label?: string }> {
    const categoryElements = entryElement.querySelectorAll('category');
    const categories: Array<{ term: string; label?: string }> = [];

    categoryElements.forEach((catEl) => {
      const term = this.getAttributeValue(catEl, 'term');
      const label = this.getAttributeValue(catEl, 'label');

      if (term) {
        categories.push({
          term,
          ...(label && { label }),
        });
      }
    });

    return categories;
  }

  private parseDCTerms(entryElement: Element) {
    const dcterms: Record<string, string> = {};

    const issued = entryElement.querySelector('dcterms\\:issued, issued');
    if (issued) dcterms['issued'] = this.getTextContent(issued);

    const language = entryElement.querySelector('dcterms\\:language, language');
    if (language) dcterms['language'] = this.getTextContent(language);

    const publisher = entryElement.querySelector('dcterms\\:publisher, publisher');
    if (publisher) dcterms['publisher'] = this.getTextContent(publisher);

    const extent = entryElement.querySelector('dcterms\\:extent, extent');
    if (extent) dcterms['extent'] = this.getTextContent(extent);

    return Object.keys(dcterms).length > 0 ? dcterms : undefined;
  }

  private parseEntry(entryElement: Element): OPDSEntry {
    const id = this.getTextContent(entryElement.querySelector('id'));
    const title = this.getTextContent(entryElement.querySelector('title'));

    // Debug empty IDs
    if (!id || id.trim() === '') {
      console.warn('⚠️ Found entry with empty ID:', { title, element: entryElement });
    }
    const summary = this.getTextContent(entryElement.querySelector('summary'));
    const content = this.getTextContent(entryElement.querySelector('content'));
    const published = this.getTextContent(entryElement.querySelector('published'));
    const updated = this.getTextContent(entryElement.querySelector('updated'));

    const authors = this.parseAuthors(entryElement);
    const links = this.parseLinks(entryElement);
    const categories = this.parseCategories(entryElement);
    const dcterms = this.parseDCTerms(entryElement);

    return {
      id,
      title,
      ...(authors.length > 0 && { authors }),
      ...(summary && { summary }),
      ...(content && { content }),
      ...(published && { published }),
      ...(updated && { updated }),
      links,
      ...(categories.length > 0 && { categories }),
      ...(dcterms && { dcterms }),
    };
  }

  public parseFeed(xmlText: string): OPDSFeed {
    console.log('🔍 Raw XML received (first 500 chars):', xmlText.substring(0, 500) + '...');

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML解析错误: ${parserError.textContent}`);
    }

    const feed = doc.querySelector('feed');
    if (!feed) {
      throw new Error('无效的OPDS feed: 未找到feed元素');
    }

    console.log('🔍 Feed element found, extracting nextLink...');

    // Extract nextLink directly first (most reliable)
    const nextLink = this.extractNextLink(doc);

    try {
      // Use foliate-js OPDS parser
      const foliateData = getFeed(doc) as FoliateFeed;

      console.log('✅ Using foliate-js parser successfully');

      // Convert foliate-js format to our internal format
      const entries: OPDSEntry[] = [];

      // Handle publications (books)
      if (foliateData.publications) {
        foliateData.publications.forEach((pub: FoliatePublication) => {
          entries.push(this.convertFoliatePublicationToEntry(pub));
        });
      }

      // Handle navigation items
      if (foliateData.navigation) {
        foliateData.navigation.forEach((nav: FoliateNavigation) => {
          entries.push(this.convertFoliateNavigationToEntry(nav));
        });
      }

      const parsedLinks = foliateData.links?.map((link) => ({
        rel: Array.isArray(link.rel) ? link.rel.join(' ') : link.rel || '',
        type: link.type || '',
        href: link.href || '',
        title: link.title,
      })) || [];

      return {
        id: this.getTextContent(feed.querySelector('id')),
        title: foliateData.metadata?.title || '',
        subtitle: foliateData.metadata?.subtitle,
        updated: this.getTextContent(feed.querySelector('updated')),
        links: parsedLinks,
        entries,
        // Use direct nextLink extraction (most reliable)
        ...(nextLink && { nextLink }),
      };
    } catch (error) {
      console.warn('⚠️ Foliate-js parser failed, using fallback:', error);
      // Fallback to original implementation
      return this.parseFeedFallback(xmlText, nextLink);
    }
  }

  private parseFeedFallback(xmlText: string, extractedNextLink?: string): OPDSFeed {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const feed = doc.querySelector('feed')!;

    const id = this.getTextContent(feed.querySelector('id'));
    const title = this.getTextContent(feed.querySelector('title'));
    const subtitle = this.getTextContent(feed.querySelector('subtitle'));
    const updated = this.getTextContent(feed.querySelector('updated'));

    const links = this.parseLinks(feed);

    // Parse entries
    const entryElements = feed.querySelectorAll('entry');
    const entries: OPDSEntry[] = [];

    entryElements.forEach((entryEl) => {
      try {
        const entry = this.parseEntry(entryEl);
        entries.push(entry);
      } catch (error) {
        console.warn('Failed to parse OPDS entry:', error);
      }
    });

    // Parse OpenSearch elements if present
    const opensearchTotalResults = feed.querySelector('opensearch\\:totalResults, totalResults');
    const opensearchStartIndex = feed.querySelector('opensearch\\:startIndex, startIndex');
    const opensearchItemsPerPage = feed.querySelector('opensearch\\:itemsPerPage, itemsPerPage');

    // Use the pre-extracted nextLink or try to find it in the parsed links
    const fallbackNextLink = extractedNextLink || links.find(link => link.rel.includes('next'))?.href;
    const prevLink = links.find(link => link.rel.includes('prev') || link.rel.includes('previous'));
    const firstLink = links.find(link => link.rel.includes('first'));
    const lastLink = links.find(link => link.rel.includes('last'));

    console.log('🔍 Fallback parser - nextLink:', fallbackNextLink);

    return {
      id,
      title,
      ...(subtitle && { subtitle }),
      updated,
      links,
      entries,
      ...(opensearchTotalResults && {
        opensearchTotalResults: parseInt(this.getTextContent(opensearchTotalResults), 10),
      }),
      ...(opensearchStartIndex && {
        opensearchStartIndex: parseInt(this.getTextContent(opensearchStartIndex), 10),
      }),
      ...(opensearchItemsPerPage && {
        opensearchItemsPerPage: parseInt(this.getTextContent(opensearchItemsPerPage), 10),
      }),
      // Add pagination links
      ...(fallbackNextLink && { nextLink: fallbackNextLink }),
      ...(prevLink && { prevLink: prevLink.href }),
      ...(firstLink && { firstLink: firstLink.href }),
      ...(lastLink && { lastLink: lastLink.href }),
    };
  }

  public entryToBook(entry: OPDSEntry): OPDSBook {
    const downloadLinks = entry.links
      .filter((link) =>
        link.rel.includes('acquisition') &&
        (link.type === OPDSMimeType.EPUB ||
         link.type === OPDSMimeType.MOBI ||
         link.type === OPDSMimeType.PDF ||
         link.type === 'application/x-cbz' ||
         link.type === 'application/x-cbr')
      )
      .map((link) => ({
        type: link.type,
        href: link.href,
        title: link.title,
      }));

    const coverImageUrl = entry.links.find(
      (link) =>
        link.rel === OPDSLinkRel.IMAGE ||
        link.rel === OPDSLinkRel.THUMBNAIL ||
        link.type === OPDSMimeType.IMAGE_JPEG ||
        link.type === OPDSMimeType.IMAGE_PNG
    )?.href;

    const categories = entry.categories?.map((cat) => cat.label || cat.term);

    return {
      id: entry.id,
      title: entry.title,
      authors: entry.authors || [],
      summary: entry.summary || entry.content,
      language: entry.dcterms?.language,
      publisher: entry.dcterms?.publisher,
      published: entry.published || entry.dcterms?.issued,
      downloadLinks,
      ...(coverImageUrl && { coverImageUrl }),
      ...(categories && { categories }),
    };
  }

  public entryToNavigationItem(entry: OPDSEntry): OPDSNavigationItem {
    const navigationLink = entry.links.find(
      (link) =>
        link.rel === OPDSLinkRel.NAVIGATION ||
        link.type === OPDSMimeType.ATOM_XML_PROFILE_OPDS_CATALOG ||
        link.type === OPDSMimeType.ATOM_XML_PROFILE_OPDS_NAVIGATION ||
        link.type === OPDSMimeType.ATOM_XML_PROFILE_OPDS_ACQUISITION
    );

    const isAcquisition = entry.links.some((link) =>
      link.type === OPDSMimeType.ATOM_XML_PROFILE_OPDS_ACQUISITION ||
      link.rel.includes('acquisition')
    );

    return {
      id: entry.id,
      title: entry.title,
      href: navigationLink?.href || entry.links[0]?.href || '',
      type: isAcquisition ? 'acquisition' : 'navigation',
      summary: entry.summary || entry.content,
    };
  }

  private convertFoliatePublicationToEntry(pub: FoliatePublication): OPDSEntry {
    const links: OPDSFeedLink[] = pub.links?.map((link) => ({
      rel: Array.isArray(link.rel) ? link.rel.join(' ') : link.rel || '',
      type: link.type || '',
      href: link.href || '',
      title: link.title,
    })) || [];

    // Generate a stable ID if none exists
    const id = pub.metadata?.identifier ||
               links.find(l => l.rel.includes('acquisition'))?.href ||
               `entry-${pub.metadata?.title?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}-${Date.now()}`;

    return {
      id,
      title: pub.metadata?.title || '',
      authors: pub.metadata?.author?.map((author) => author.name).filter(Boolean) || [],
      summary: (pub.metadata?.[SYMBOL.CONTENT] as { value?: string })?.value || (pub.metadata as { [key: symbol]: string })?.[SYMBOL.SUMMARY] || '',
      content: (pub.metadata?.[SYMBOL.CONTENT] as { value?: string })?.value,
      published: pub.metadata?.published,
      updated: '',
      links,
      categories: pub.metadata?.subject?.map((subj) => ({
        term: subj.code || subj.name || '',
        label: subj.name,
      })) || [],
      dcterms: {
        language: pub.metadata?.language,
        publisher: pub.metadata?.publisher,
        issued: pub.metadata?.published,
      },
    };
  }

  private convertFoliateNavigationToEntry(nav: FoliateNavigation): OPDSEntry {
    return {
      id: nav.href || '',
      title: nav.title || '',
      authors: [],
      summary: (nav as { [key: symbol]: string })[SYMBOL.SUMMARY] || '',
      links: [{
        rel: 'subsection',
        type: nav.type || '',
        href: nav.href || '',
        title: nav.title,
      }],
      categories: [],
    };
  }
}