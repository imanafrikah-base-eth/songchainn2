import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { wagmiConfig } from '@/lib/web3Config';

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
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
