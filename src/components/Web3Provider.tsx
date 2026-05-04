import { ReactNode, useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { wagmiConfig } from '@/lib/web3Config';

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Return children without providers on first pass to ensure client-side initialization
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
      <OnchainKitProvider
        apiKey={import.meta.env.VITE_ONCHAINKIT_API_KEY as string | undefined}
        projectId={import.meta.env.VITE_ONCHAINKIT_PROJECT_ID as string | undefined}
        chain={wagmiConfig.chains[0]}
      >
        {children}
      </OnchainKitProvider>
    </WagmiProvider>
  );
}
