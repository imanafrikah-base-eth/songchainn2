import { useAccount, useDisconnect, useBalance } from 'wagmi';
import { base } from 'wagmi/chains';
import { ensureWeb3ModalInitialized } from '@/lib/web3Config';

export function useWeb3Wallet() {
  const { address, isConnected, isConnecting, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  
  const { data: balanceData, isLoading: isBalanceLoading, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: base.id,
  });

  const openConnectModal = async () => {
    const modal = ensureWeb3ModalInitialized();
    await modal?.open({ view: 'Connect' });
  };

  const openAccountModal = async () => {
    const modal = ensureWeb3ModalInitialized();
    await modal?.open({ view: 'Account' });
  };

  const disconnectWallet = () => {
    void disconnectAsync().catch((err) => { if (import.meta.env.DEV) console.warn('[wallet-disconnect]', err); });
  };

  const getWalletName = (): string => {
    if (!connector) return 'Unknown';
    return connector.name || 'Wallet';
  };

  const formatAddress = (addr: string): string => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return {
    address,
    isConnected,
    isConnecting,
    balance: balanceData?.formatted,
    balanceSymbol: balanceData?.symbol,
    isBalanceLoading,
    walletName: getWalletName(),
    openConnectModal,
    openAccountModal,
    disconnect: disconnectWallet,
    refetchBalance,
    formatAddress,
  };
}
