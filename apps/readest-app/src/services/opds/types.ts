export interface OPDSCredentials {
  username: string;
  password: string;
}

export interface OPDSFeedLink {
  rel: string;
  type: string;
  href: string;
  title?: string;
}

export interface OPDSEntry {
  id: string;
  title: string;
  authors?: string[];
  summary?: string;
  published?: string;
  updated?: string;
  links: OPDSFeedLink[];
  categories?: Array<{
    term: string;
    label?: string;
  }>;
  content?: string;
  dcterms?: {
    issued?: string;
    language?: string;
    publisher?: string;
    extent?: string;
  };
}

export interface OPDSFeed {
  id: string;
  title: string;
  subtitle?: string;
  updated: string;
  links: OPDSFeedLink[];
  entries: OPDSEntry[];
  opensearchDescription?: string;
  opensearchTotalResults?: number;
  opensearchStartIndex?: number;
  opensearchItemsPerPage?: number;
  // Pagination links
  nextLink?: string;
  prevLink?: string;
  firstLink?: string;
  lastLink?: string;
}

export interface OPDSBook {
  id: string;
  title: string;
  authors: string[];
  summary?: string;
  language?: string;
  publisher?: string;
  published?: string;
  downloadLinks: Array<{
    type: string;
    href: string;
    title?: string;
  }>;
  coverImageUrl?: string;
  categories?: string[];
}

export interface OPDSNavigationItem {
  id: string;
  title: string;
  href: string;
  type: 'navigation' | 'acquisition';
  summary?: string;
}

export enum OPDSLinkRel {
  ACQUISITION = 'http://opds-spec.org/acquisition',
  ACQUISITION_OPEN = 'http://opds-spec.org/acquisition/open-access',
  ACQUISITION_BORROW = 'http://opds-spec.org/acquisition/borrow',
  ACQUISITION_BUY = 'http://opds-spec.org/acquisition/buy',
  ACQUISITION_SAMPLE = 'http://opds-spec.org/acquisition/sample',
  NAVIGATION = 'subsection',
  THUMBNAIL = 'http://opds-spec.org/image/thumbnail',
  IMAGE = 'http://opds-spec.org/image',
  SELF = 'self',
  START = 'start',
  UP = 'up',
  NEXT = 'next',
  PREV = 'prev',
  SEARCH = 'search',
  ALTERNATE = 'alternate'
}

export enum OPDSMimeType {
  ATOM_XML = 'application/atom+xml',
  ATOM_XML_PROFILE_OPDS_CATALOG = 'application/atom+xml;profile=opds-catalog',
  ATOM_XML_PROFILE_OPDS_NAVIGATION = 'application/atom+xml;profile=opds-catalog;kind=navigation',
  ATOM_XML_PROFILE_OPDS_ACQUISITION = 'application/atom+xml;profile=opds-catalog;kind=acquisition',
  EPUB = 'application/epub+zip',
  MOBI = 'application/x-mobipocket-ebook',
  PDF = 'application/pdf',
  TEXT = 'text/plain',
  HTML = 'text/html',
  OPENSEARCH = 'application/opensearchdescription+xml',
  IMAGE_JPEG = 'image/jpeg',
  IMAGE_PNG = 'image/png',
  IMAGE_GIF = 'image/gif'
}