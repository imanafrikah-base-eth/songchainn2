import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

interface BaseWalletButtonProps {
  fullWidth?: boolean;
}

export function BaseWalletButton({ fullWidth }: BaseWalletButtonProps) {
  const { signInWithWallet } = useAuth();

  const handleConnect = useCallback(async () => {
    await signInWithWallet();
  }, [signInWithWallet]);

  return (
    <Wallet>
      <ConnectWallet
        className={fullWidth ? 'w-full h-14 rounded-2xl' : 'h-10 rounded-xl'}
        disconnectedLabel="Sign in with Base Wallet"
        onConnect={handleConnect}
      />
    </Wallet>
  );
}

