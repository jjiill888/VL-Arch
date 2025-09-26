declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, unknown> & {
      metadata?: {
        currentWebview: {
          label: string;
        };
      };
    };
  }
}

/**
 * Check if the Tauri API is available in the current environment
 * @returns boolean
 */
export const isTauriAPIAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const internals = window.__TAURI_INTERNALS__ as Record<string, unknown> | undefined;
    if (!internals) return false;
    return (
      typeof internals === 'object' &&
      internals !== null &&
      'metadata' in internals &&
      (internals as Record<string, unknown>)['metadata'] !== undefined
    );
  } catch {
    return false;
  }
};