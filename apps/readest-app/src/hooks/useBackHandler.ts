import { useEffect } from 'react';
import { isTauriAppPlatform } from '@/services/environment';
import { useGlobalBackHandler } from './useGlobalBackHandler';

interface UseBackHandlerProps {
  enabled: boolean;
  onBack: () => void;
}

/**
 * Custom hook to handle Android back button interception
 * @param enabled - Whether to intercept the back button
 * @param onBack - Callback function to execute when back button is pressed
 */
export const useBackHandler = ({ enabled, onBack }: UseBackHandlerProps) => {
  // Use the global back handler for Android
  useGlobalBackHandler(enabled, onBack);

  // Handle browser history API for web/desktop platforms
  useEffect(() => {
    if (isTauriAppPlatform()) {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      if (enabled) {
        event.preventDefault();
        onBack();
        // Push a new state to maintain history
        window.history.pushState(null, '', window.location.href);
      }
    };

    if (enabled) {
      // Add a history entry when component mounts
      window.history.pushState(null, '', window.location.href);
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled, onBack]);
};

export default useBackHandler;