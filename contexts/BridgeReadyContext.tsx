
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

    const initializeBridge = () => {
      // InteractionManager alone is sufficient — the 100ms sleep was an
      // unnecessary startup penalty (~300-500ms with interaction scheduling).
      InteractionManager.runAfterInteractions(() => {
        log('[BridgeReady] Ready');
        setIsBridgeReady(true);
        setIsInitializing(false);
      });
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
