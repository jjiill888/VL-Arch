import { useEffect, useRef } from 'react';
import { nativeBridge } from '@/services/nativeBridge';
import { isTauriAppPlatform } from '@/services/environment';

// Global state to track if back key interception is currently active
let isBackKeyIntercepted = false;
const currentHandlers: Map<string, () => void> = new Map();

/**
 * Global back handler manager for Android
 * Ensures only one handler is active at a time and properly manages interception
 */
export const useGlobalBackHandler = (enabled: boolean, onBack: () => void) => {
  const onBackRef = useRef(onBack);
  const enabledRef = useRef(enabled);
  const handlerIdRef = useRef<string>(`handler-${Date.now()}-${Math.random()}`);

  // Update refs when props change
  useEffect(() => {
    onBackRef.current = onBack;
    enabledRef.current = enabled;
  }, [onBack, enabled]);

  useEffect(() => {
    const handlerId = handlerIdRef.current;

    if (enabled) {
      // Add this handler to the map
      currentHandlers.set(handlerId, () => {
        if (enabledRef.current) {
          onBackRef.current();
        }
      });

      // Enable interception if not already enabled
      if (!isBackKeyIntercepted && isTauriAppPlatform()) {
        enableBackKeyInterception();
      }
    } else {
      // Remove this handler from the map
      currentHandlers.delete(handlerId);
    }

    return () => {
      // Always remove handler on cleanup
      currentHandlers.delete(handlerId);

      // If no more handlers, disable interception
      if (currentHandlers.size === 0 && isBackKeyIntercepted && isTauriAppPlatform()) {
        disableBackKeyInterception();
      }
    };
  }, [enabled]);
};

async function enableBackKeyInterception() {
  try {
    await nativeBridge.interceptBackKey(true);
    isBackKeyIntercepted = true;
    console.log('Global back key interception enabled');
  } catch (error) {
    console.error('Failed to enable back key interception:', error);
  }
}

async function disableBackKeyInterception() {
  try {
    await nativeBridge.interceptBackKey(false);
    isBackKeyIntercepted = false;
    console.log('Global back key interception disabled');
  } catch (error) {
    console.error('Failed to disable back key interception:', error);
  }
}

// Set up global event listener for Android back events
if (typeof window !== 'undefined') {
  window.addEventListener('android-back-pressed', () => {
    console.log('Global: Received android-back-pressed event');
    console.log('Current handlers count:', currentHandlers.size);

    // Execute the most recently added handler (last in, first out)
    if (currentHandlers.size > 0) {
      const handlers = Array.from(currentHandlers.values());
      const handler = handlers[handlers.length - 1];
      if (handler) {
        handler();
      }
    }
  });
}

export default useGlobalBackHandler;