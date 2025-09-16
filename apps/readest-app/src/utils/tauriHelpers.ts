/**
 * Utility functions for safe Tauri API usage
 */

/**
 * Check if Tauri internals are available
 */
export const isTauriAvailable = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && window.__TAURI_INTERNALS__ !== undefined;
};

/**
 * Check if Tauri OS plugin is available
 */
export const isTauriOSAvailable = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_OS_PLUGIN_INTERNALS__' in window && window.__TAURI_OS_PLUGIN_INTERNALS__ !== undefined;
};

/**
 * Safely execute a function that uses Tauri APIs
 * @param fn - Function to execute if Tauri is available
 * @param fallback - Optional fallback to execute if Tauri is not available
 */
export const withTauri = <T>(fn: () => T, fallback?: () => T): T | void => {
  if (isTauriAvailable()) {
    return fn();
  } else {
    console.debug('Tauri not available, skipping API call');
    return fallback ? fallback() : undefined;
  }
};

/**
 * Safely execute an async function that uses Tauri APIs
 */
export const withTauriAsync = async <T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T | void> => {
  if (isTauriAvailable()) {
    return await fn();
  } else {
    console.debug('Tauri not available, skipping async API call');
    return fallback ? await fallback() : undefined;
  }
};