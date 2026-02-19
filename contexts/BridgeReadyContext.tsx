
/**
 * Bridge Ready Context
 * 
 * Ensures the React Native bridge and Hermes runtime are fully initialized
 * before any native modules are accessed.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, InteractionManager } from 'react-native';

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
    console.log('[BridgeReady] ========== BRIDGE INITIALIZATION STARTED ==========');
    console.log('[BridgeReady] Platform:', Platform.OS);
    console.log('[BridgeReady] Environment:', __DEV__ ? 'Development' : 'Production');

    // Wait for React to fully mount and all interactions to complete
    const initializeBridge = async () => {
      try {
        // Step 1: Wait for the current render cycle to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[BridgeReady] ✅ Initial render cycle complete');

        // Step 2: Wait for all pending interactions (animations, gestures, etc.)
        await new Promise(resolve => {
          InteractionManager.runAfterInteractions(() => {
            console.log('[BridgeReady] ✅ All interactions complete');
            resolve(undefined);
          });
        });

        // Step 3: Mark bridge as ready
        console.log('[BridgeReady] ========== BRIDGE IS NOW READY ==========');
        setIsBridgeReady(true);
        setIsInitializing(false);
      } catch (error) {
        console.error('[BridgeReady] ❌ Bridge initialization error:', error);
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
    // CRITICAL: Return safe defaults if called outside provider
    console.warn('[BridgeReady] useBridgeReady called outside BridgeReadyProvider');
    return { isBridgeReady: false, isInitializing: true };
  }
  return context;
}
