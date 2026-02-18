
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

// Define the WidgetKit module type for type safety
interface WidgetKitModule {
  setItem: (key: string, value: string, appGroup: string) => Promise<void>;
  reloadAllWidgets: () => void;
}

// Context for managing widget interactions
interface WidgetContextType {
  refreshWidget: (data: any) => Promise<void>;
  widgetError: string | null;
}

const WidgetContext = createContext<WidgetContextType | undefined>(undefined);

export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const widgetKitModule = useRef<WidgetKitModule | null>(null);
  const isModuleLoading = useRef(false);

  // Function to dynamically load react-native-widgetkit
  const loadWidgetKitModule = useCallback(async (): Promise<WidgetKitModule | null> => {
    if (widgetKitModule.current) {
      return widgetKitModule.current;
    }
    if (isModuleLoading.current) {
      // Module is already loading, wait for it
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (widgetKitModule.current) {
            clearInterval(interval);
            resolve(widgetKitModule.current);
          }
        }, 100);
      });
    }

    isModuleLoading.current = true;
    try {
      // Use dynamic import with a timeout
      const modulePromise = import('react-native-widgetkit');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('WidgetKit module load timed out')), 2000)
      );
      const module = await Promise.race([modulePromise, timeoutPromise]);
      widgetKitModule.current = module as WidgetKitModule;
      return widgetKitModule.current;
    } catch (e: any) {
      console.error('Failed to load react-native-widgetkit:', e);
      setWidgetError(`Failed to load widget module: ${e.message}`);
      return null;
    } finally {
      isModuleLoading.current = false;
    }
  }, []);

  // Refresh widget data
  const refreshWidget = useCallback(async (data: any) => {
    if (Platform.OS !== 'ios') {
      console.log('WidgetKit is iOS-only. Skipping refresh.');
      return;
    }

    try {
      const WidgetKit = await loadWidgetKitModule();
      if (!WidgetKit) {
        console.warn('WidgetKit module not available, cannot refresh widget.');
        return;
      }

      const appGroup = 'group.com.natively.seatime'; // Replace with your actual app group
      await WidgetKit.setItem('widgetData', JSON.stringify(data), appGroup);
      WidgetKit.reloadAllWidgets();
      setWidgetError(null);
      console.log('Widget refreshed successfully.');
    } catch (e: any) {
      console.error('Error refreshing widget:', e);
      setWidgetError(`Failed to refresh widget: ${e.message}`);
    }
  }, [loadWidgetKitModule]);

  return (
    <WidgetContext.Provider value={{ refreshWidget, widgetError }}>
      {children}
    </WidgetContext.Provider>
  );
};

export const useWidget = () => {
  const context = useContext(WidgetContext);
  if (context === undefined) {
    throw new Error('useWidget must be used within a WidgetProvider');
  }
  return context;
};
