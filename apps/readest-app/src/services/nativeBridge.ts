import { invoke } from '@tauri-apps/api/core';
import { isTauriAppPlatform } from './environment';

interface InterceptKeysRequest extends Record<string, unknown> {
  volumeKeys?: boolean;
  backKey?: boolean;
}

/**
 * Native bridge service for Android/iOS specific functionality
 */
export class NativeBridgeService {
  /**
   * Enable or disable Android back key interception
   * @param enabled - Whether to intercept the back key
   */
  async interceptBackKey(enabled: boolean): Promise<void> {
    if (!isTauriAppPlatform()) {
      console.warn('NativeBridge: interceptBackKey is only available in Tauri app platform');
      return;
    }

    try {
      const request: InterceptKeysRequest = {
        backKey: enabled,
      };
      await invoke('plugin:native-bridge|intercept_keys', request);
      console.log(`NativeBridge: Back key interception ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('NativeBridge: Failed to set back key interception:', error);
      throw error;
    }
  }

  /**
   * Enable or disable volume key interception
   * @param enabled - Whether to intercept volume keys
   */
  async interceptVolumeKeys(enabled: boolean): Promise<void> {
    if (!isTauriAppPlatform()) {
      console.warn('NativeBridge: interceptVolumeKeys is only available in Tauri app platform');
      return;
    }

    try {
      const request: InterceptKeysRequest = {
        volumeKeys: enabled,
      };
      await invoke('plugin:native-bridge|intercept_keys', request);
      console.log(`NativeBridge: Volume key interception ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('NativeBridge: Failed to set volume key interception:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const nativeBridge = new NativeBridgeService();