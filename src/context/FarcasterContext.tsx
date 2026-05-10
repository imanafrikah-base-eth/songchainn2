import { createContext, useContext, ReactNode } from 'react';
import { useFarcaster } from '@/hooks/useFarcaster';
import type { MiniAppContext } from '@farcaster/miniapp-core';

interface FarcasterContextType {
  isInFarcaster: boolean;
  context: MiniAppContext | null;
}

const FarcasterContext = createContext<FarcasterContextType>({
  isInFarcaster: false,
  context: null,
});

export function FarcasterProvider({ children }: { children: ReactNode }) {
  const state = useFarcaster();
  return <FarcasterContext.Provider value={state}>{children}</FarcasterContext.Provider>;
}

export function useFarcasterContext(): FarcasterContextType {
  return useContext(FarcasterContext);
}
