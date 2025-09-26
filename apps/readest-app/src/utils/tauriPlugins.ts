/**
 * Check if a specific Tauri plugin is available in the current environment
 */
export const isTauriPluginAvailable = (pluginName: string): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const internals = window.__TAURI_INTERNALS__ as Record<string, unknown> | undefined;
    return internals !== undefined && internals[pluginName] !== undefined;
  } catch {
    return false;
  }
};

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