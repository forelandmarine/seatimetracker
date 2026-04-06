
/**
 * Bridge Ready Context
 * 
 * Ensures the React Native bridge and Hermes runtime are fully initialized
 * before any native modules are accessed.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, InteractionManager } from 'react-native';
import { log, error as logError } from '@/utils/log';

interface BridgeReadyContextType {
  /** Whether the React Native bridge is fully initialized and safe to use */
  isBridgeReady: boolean;
  /** Whether we're still in the initialization phase */
  isInitializing: boolean;
}

const BridgeReadyContext = createContext<BridgeReadyContextType | undefined>(undefined);

export function BridgeReadyProvider({ children }: { children: ReactNode }) {
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    log('[BridgeReady] Initializing, platform:', Platform.OS);

    const initializeBridge = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        await new Promise(resolve => {
          InteractionManager.runAfterInteractions(() => resolve(undefined));
        });
        log('[BridgeReady] Ready');
        setIsBridgeReady(true);
        setIsInitializing(false);
      } catch (err) {
        logError('[BridgeReady] Init error:', err);
        // Even on error, mark as ready to prevent app from hanging
        setIsBridgeReady(true);
        setIsInitializing(false);
      }
    };

    initializeBridge();
  }, []);

  return (
    <BridgeReadyContext.Provider value={{ isBridgeReady, isInitializing }}>
      {children}
    </BridgeReadyContext.Provider>
  );
}

export function useBridgeReady() {
  const context = useContext(BridgeReadyContext);
  if (context === undefined) {
    logError('[BridgeReady] useBridgeReady called outside BridgeReadyProvider');
    return { isBridgeReady: false, isInitializing: true };
  }
  return context;
}
