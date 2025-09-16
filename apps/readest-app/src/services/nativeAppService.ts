import {
  exists,
  mkdir,
  open as openFile,
  readTextFile,
  readFile,
  writeTextFile,
  writeFile,
  readDir,
  remove,
  copyFile,
  BaseDirectory,
  WriteFileOptions,
} from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  join,
  basename,
  appDataDir,
  appConfigDir,
  appCacheDir,
  appLogDir,
  tempDir,
} from '@tauri-apps/api/path';
import { type as osType } from '@tauri-apps/plugin-os';

import { Book } from '@/types/book';
import { FileSystem, BaseDir, AppPlatform } from '@/types/system';
import { getOSPlatform, isContentURI, isValidURL } from '@/utils/misc';
import { getCoverFilename } from '@/utils/book';
import { getFilename } from '@/utils/path';
import { copyURIToPath } from '@/utils/bridge';
import { NativeFile, RemoteFile } from '@/utils/file';

import { BaseAppService, ResolvedPath } from './appService';
import { LOCAL_BOOKS_SUBDIR, LOCAL_FONTS_SUBDIR } from './constants';
import { isTauriAvailable } from '@/utils/tauriHelpers';

declare global {
  interface Window {
    IS_ROUNDED?: boolean;
    __READEST_UPDATER_DISABLED?: boolean;
  }
}

// Initialize OS_TYPE with fallback, then update when Tauri is ready
let OS_TYPE = getOSPlatform(); // Start with browser-based detection

// Initialize the proper OS type when Tauri is available
const initializeOSType = async () => {
  try {
    if (typeof window !== 'undefined' && window.__TAURI_OS_PLUGIN_INTERNALS__) {
      OS_TYPE = await osType();
    }
  } catch {
    console.debug('Tauri OS plugin not available, using fallback detection');
  }
};

// Try to initialize when the module loads (non-blocking)
if (typeof window !== 'undefined') {
  setTimeout(initializeOSType, 0);
}

// Usage:
// 1. baseDir + fp
// 2. basePrefix + fp or the getPrefix util in FileSystem
const resolvePath = (path: string, base: BaseDir): ResolvedPath => {
  switch (base) {
    case 'Settings':
      return { baseDir: BaseDirectory.AppConfig, basePrefix: appConfigDir, fp: path, base };
    case 'Data':
      return { baseDir: BaseDirectory.AppData, basePrefix: appDataDir, fp: path, base };
    case 'Cache':
      return { baseDir: BaseDirectory.AppCache, basePrefix: appCacheDir, fp: path, base };
    case 'Log':
      return { baseDir: BaseDirectory.AppLog, basePrefix: appLogDir, fp: path, base };
    case 'Books':
      return {
        baseDir: BaseDirectory.AppData,
        basePrefix: appDataDir,
        fp: `${LOCAL_BOOKS_SUBDIR}/${path}`,
        base,
      };
    case 'Fonts':
      return {
        baseDir: BaseDirectory.AppData,
        basePrefix: appDataDir,
        fp: `${LOCAL_FONTS_SUBDIR}/${path}`,
        base,
      };
    case 'None':
      return {
        baseDir: 0,
        basePrefix: async () => '',
        fp: path,
        base,
      };
    case 'Temp':
    default:
      return {
        baseDir: BaseDirectory.Temp,
        basePrefix: tempDir,
        fp: path,
        base,
      };
  }
};


export const nativeFileSystem: FileSystem = {
  async getPrefix(base: BaseDir) {
    if (!isTauriAvailable()) {
      // Return a fallback path when Tauri is not ready
      console.debug('Tauri not available, using fallback path for base:', base);
      return `/tmp/readest-fallback/${base.toLowerCase()}`;
    }
    const { basePrefix, fp } = resolvePath('', base);
    const basePath = await basePrefix();
    return fp ? await join(basePath, fp) : basePath;
  },
  getURL(path: string) {
    if (isValidURL(path)) {
      return path;
    }
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, returning path as-is:', path);
      return path;
    }
    return convertFileSrc(path);
  },
  async getBlobURL(path: string, base: BaseDir) {
    const content = await this.readFile(path, base, 'binary');
    return URL.createObjectURL(new Blob([content]));
  },
  async openFile(path: string, base: BaseDir, name?: string) {
    const { fp, baseDir } = resolvePath(path, base);
    let fname = name || getFilename(fp);
    if (isValidURL(path)) {
      return await new RemoteFile(path, fname).open();
    } else if (isContentURI(path)) {
      fname = await basename(path);
      if (path.includes('com.android.externalstorage')) {
        // If the URI is from shared internal storage (like /storage/emulated/0),
        // we can access it directly using the path — no need to copy.
        return await new NativeFile(fp, fname, base ? baseDir : null).open();
      } else {
        // Otherwise, for content:// URIs (e.g. from MediaStore, Drive, or third-party apps),
        // we cannot access the file directly — so we copy it to a temporary cache location.
        const prefix = await this.getPrefix('Cache');
        const dst = await join(prefix, fname);
        const res = await copyURIToPath({ uri: path, dst });
        if (!res.success) {
          console.error('Failed to open file:', res);
          throw new Error('Failed to open file');
        }
        return await new NativeFile(dst, fname, base ? baseDir : null).open();
      }
    } else {
      const prefix = await this.getPrefix(base);
      const absolutePath = path.startsWith('/') ? path : prefix ? await join(prefix, path) : null;
      if (absolutePath && OS_TYPE !== 'android') {
        // NOTE: RemoteFile currently performs about 2× faster than NativeFile
        // due to an unresolved performance issue in Tauri (see tauri-apps/tauri#9190).
        // Once the bug is resolved, we should switch back to using NativeFile.
        // RemoteFile is not usable on Android due to unknown issues of range fetch with Android WebView.
        return await new RemoteFile(this.getURL(absolutePath), fname).open();
      } else {
        return await new NativeFile(fp, fname, base ? baseDir : null).open();
      }
    }
  },
  async copyFile(srcPath: string, dstPath: string, base: BaseDir) {
    if (isContentURI(srcPath)) {
      const prefix = await this.getPrefix(base);
      if (!prefix) {
        throw new Error('Invalid base directory');
      }
      const res = await copyURIToPath({
        uri: srcPath,
        dst: await join(prefix, dstPath),
      });
      if (!res.success) {
        console.error('Failed to copy file:', res);
        throw new Error('Failed to copy file');
      }
    } else {
      const { fp, baseDir } = resolvePath(dstPath, base);
      await copyFile(srcPath, fp, base && { toPathBaseDir: baseDir });
    }
  },
  async readFile(path: string, base: BaseDir, mode: 'text' | 'binary') {
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, returning empty content for file read:', path);
      return mode === 'text' ? '' : new ArrayBuffer(0);
    }
    const { fp, baseDir } = resolvePath(path, base);

    return mode === 'text'
      ? (readTextFile(fp, base && { baseDir }) as Promise<string>)
      : ((await readFile(fp, base && { baseDir })).buffer as ArrayBuffer);
  },
  async writeFile(path: string, base: BaseDir, content: string | ArrayBuffer | File) {
    // NOTE: this could be very slow for large files and might block the UI thread
    // so do not use this for large files
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, skipping file write for:', path);
      return;
    }
    const { fp, baseDir } = resolvePath(path, base);

    if (typeof content === 'string') {
      return writeTextFile(fp, content, base && { baseDir });
    } else if (content instanceof File) {
      const writeOptions = { write: true, create: true, baseDir } as WriteFileOptions;
      // TODO: use writeFile directly when @tauri-apps/plugin-fs@2.2.1 is released
      // return writeFile(fp, content.stream(), base && writeOptions);
      const file = await openFile(fp, base && writeOptions);
      const reader = content.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await file.write(value);
        }
      } finally {
        reader.releaseLock();
        await file.close();
      }
    } else {
      return writeFile(fp, new Uint8Array(content), base && { baseDir });
    }
  },
  async removeFile(path: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(path, base);

    return remove(fp, base && { baseDir });
  },
  async createDir(path: string, base: BaseDir, recursive = false) {
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, skipping directory creation for:', path);
      return;
    }
    const { fp, baseDir } = resolvePath(path, base);

    await mkdir(fp, base && { baseDir, recursive });
  },
  async removeDir(path: string, base: BaseDir, recursive = false) {
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, skipping directory removal for:', path);
      return;
    }
    const { fp, baseDir } = resolvePath(path, base);

    await remove(fp, base && { baseDir, recursive });
  },
  async readDir(path: string, base: BaseDir) {
    if (!isTauriAvailable()) {
      console.debug('Tauri not available, returning empty directory listing for:', path);
      return [];
    }
    const { fp, baseDir } = resolvePath(path, base);

    const list = await readDir(fp, base && { baseDir });
    return list.map((entity) => {
      return {
        path: entity.name,
        isDir: entity.isDirectory,
      };
    });
  },
  async exists(path: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(path, base);

    try {
      const res = await exists(fp, base && { baseDir });
      return res;
    } catch {
      return false;
    }
  },
};

export class NativeAppService extends BaseAppService {
  fs = nativeFileSystem;
  override appPlatform = 'tauri' as AppPlatform;
  override isAppDataSandbox = ['android', 'ios'].includes(OS_TYPE);
  override isMobile = ['android', 'ios'].includes(OS_TYPE);
  override isAndroidApp = OS_TYPE === 'android';
  override isIOSApp = OS_TYPE === 'ios';
  override isMacOSApp = OS_TYPE === 'macos';
  override isLinuxApp = OS_TYPE === 'linux';
  override isMobileApp = ['android', 'ios'].includes(OS_TYPE);
  override hasTrafficLight = OS_TYPE === 'macos';
  override hasWindow = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
  override hasWindowBar = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
  override hasContextMenu = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
  override hasRoundedWindow = OS_TYPE === 'linux';
  override hasSafeAreaInset = OS_TYPE === 'ios' || OS_TYPE === 'android';
  override hasHaptics = OS_TYPE === 'ios' || OS_TYPE === 'android';
  override hasUpdater =
    OS_TYPE !== 'ios' &&
    !process.env['NEXT_PUBLIC_DISABLE_UPDATER'] &&
    !window.__READEST_UPDATER_DISABLED;
  // orientation lock is not supported on iPad
  override hasOrientationLock =
    (OS_TYPE === 'ios' && getOSPlatform() === 'ios') || OS_TYPE === 'android';
  override distChannel = process.env['NEXT_PUBLIC_DIST_CHANNEL'] || 'readest';

  /**
   * Initialize the service with proper OS type detection from Tauri
   */
  async initialize(): Promise<void> {
    await initializeOSType();
    // Update properties that depend on OS_TYPE
    this.isAppDataSandbox = ['android', 'ios'].includes(OS_TYPE);
    this.isMobile = ['android', 'ios'].includes(OS_TYPE);
    this.isAndroidApp = OS_TYPE === 'android';
    this.isIOSApp = OS_TYPE === 'ios';
    this.isMacOSApp = OS_TYPE === 'macos';
    this.isLinuxApp = OS_TYPE === 'linux';
    this.isMobileApp = ['android', 'ios'].includes(OS_TYPE);
    this.hasTrafficLight = OS_TYPE === 'macos';
    this.hasWindow = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
    this.hasWindowBar = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
    this.hasContextMenu = !(OS_TYPE === 'ios' || OS_TYPE === 'android');
    this.hasRoundedWindow = OS_TYPE === 'linux';
    this.hasSafeAreaInset = OS_TYPE === 'ios' || OS_TYPE === 'android';
    this.hasHaptics = OS_TYPE === 'ios' || OS_TYPE === 'android';
    this.hasUpdater = OS_TYPE !== 'ios' && !process.env['NEXT_PUBLIC_DISABLE_UPDATER'] && !window.__READEST_UPDATER_DISABLED;
    this.hasOrientationLock = (OS_TYPE === 'ios' && getOSPlatform() === 'ios') || OS_TYPE === 'android';
  }

  override resolvePath(fp: string, base: BaseDir): ResolvedPath {
    return resolvePath(fp, base);
  }

  async selectDirectory(): Promise<string> {
    const selected = await openDialog({
      directory: true,
      multiple: false,
    });
    return selected as string;
  }

  async selectFiles(name: string, extensions: string[]): Promise<string[]> {
    const selected = await openDialog({
      multiple: true,
      filters: [{ name, extensions }],
    });
    return Array.isArray(selected) ? selected : selected ? [selected] : [];
  }

  getCoverImageUrl = (book: Book): string => {
    return this.fs.getURL(`${this.localBooksDir}/${getCoverFilename(book)}`);
  };

  getCoverImageBlobUrl = async (book: Book): Promise<string> => {
    return this.fs.getBlobURL(`${this.localBooksDir}/${getCoverFilename(book)}`, 'None');
  };
}
