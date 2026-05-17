import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { base } from 'wagmi/chains';
import farcasterMiniApp from '@farcaster/miniapp-wagmi-connector';

// WalletConnect internals call socket.disconnect() which doesn't exist on native WebSocket.
// Add it as an alias for close() on the prototype only — no constructor replacement.
try {
  const proto = (globalThis as any).WebSocket?.prototype;
  if (proto && typeof proto.close === 'function' && typeof proto.disconnect !== 'function') {
    Object.defineProperty(proto, 'disconnect', {
      value: proto.close,
      writable: true,
      configurable: true,
    });
  }
} catch {
  void 0;
}

// WalletConnect Project ID
const projectId = '8b68fe8730c4f8ac97065fb052022217';

// Metadata for WalletConnect
const metadata = {
  name: '$ongChainn',
  description: 'Music streaming on Base blockchain',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://songchainn.app',
  icons: ['/favicon.png']
};

// Configure chains - Base mainnet only
const chains = [base] as const;

// Create wagmi config
// The Farcaster connector is appended so that, inside Warpcast / Base App,
// wagmi can resolve `sdk.wallet.getEthereumProvider()` automatically and
// transactions skip the wallet-picker dialog. Outside a miniapp the
// connector simply isn't selectable.
export const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableWalletConnect: false,
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: false,
  connectors: [farcasterMiniApp()],
});

let isWeb3ModalInitialized = false;
let web3Modal: ReturnType<typeof createWeb3Modal> | undefined;

export function ensureWeb3ModalInitialized() {
  if (isWeb3ModalInitialized) return web3Modal;
  if (typeof window === 'undefined') return;
  isWeb3ModalInitialized = true;

  try {
    web3Modal = createWeb3Modal({
      wagmiConfig,
      projectId,
      enableAnalytics: false,
      enableOnramp: false,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#8B5CF6',
        '--w3m-border-radius-master': '12px',
      }
    });
  } catch (err) {
    void err;
  }

  return web3Modal;
}

export { projectId };
