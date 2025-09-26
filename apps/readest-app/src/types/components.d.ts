import { FC } from 'react';
import { Book } from '@/types/book';
import { BookMetadata } from '@/libs/document';

// Small, uniquely-named types to avoid colliding with implementation symbols
export type Declared_AboutWindowProps = Record<string, unknown>;
export type Declared_UpdaterWindowProps = Record<string, unknown>;
export interface Declared_BookDetailModalProps {
  isOpen: boolean;
  book: Book;
  onClose: () => void;
  handleBookUpload?: (book: Book) => Promise<boolean> | void;
  handleBookDownload?: (book: Book, redownload?: boolean) => Promise<boolean> | void;
  handleBookDelete?: (book: Book) => Promise<boolean> | void;
  handleBookDeleteCloudBackup?: (book: Book) => Promise<boolean> | void;
  handleBookDeleteLocalCopy?: (book: Book) => Promise<boolean> | void;
  handleBookMetadataUpdate?: (book: Book, metadata: BookMetadata) => Promise<void> | void;
}

// Declare the specific component module(s) to provide types for dynamic imports.
// Note: BookDetailModal module type intentionally omitted to avoid declaration collisions with
// the concrete implementation. Dynamic imports can provide types inline where needed.

declare module '@/components/AboutWindow' {
  const defaultExport: FC<Declared_AboutWindowProps>;
  export default defaultExport;
}

declare module '@/components/UpdaterWindow' {
  const defaultExport: FC<Declared_UpdaterWindowProps>;
  export default defaultExport;
}