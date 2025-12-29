import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { base } from 'wagmi/chains';

try {
  const WebSocketCtor = (globalThis as any).WebSocket as any;
  const proto = WebSocketCtor?.prototype as any;

  if (proto && typeof proto.close === "function" && typeof proto.disconnect !== "function") {
    try {
      Object.defineProperty(proto, "disconnect", {
        value: proto.close,
        writable: true,
        configurable: true,
      });
    } catch {
      try {
        proto.disconnect = proto.close;
      } catch {
        void 0;
      }
    }
  }

  if (WebSocketCtor && typeof proto?.close === "function" && typeof proto?.disconnect !== "function") {
    const OriginalWebSocket = WebSocketCtor;
    const WrappedWebSocket = function (...args: any[]) {
      const socket = new OriginalWebSocket(...args);
      if (socket && typeof socket.disconnect !== "function" && typeof socket.close === "function") {
        try {
          socket.disconnect = socket.close.bind(socket);
        } catch {
          void 0;
        }
      }
      return socket;
    } as any;

    try {
      WrappedWebSocket.prototype = OriginalWebSocket.prototype;
      Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
      (globalThis as any).WebSocket = WrappedWebSocket;
    } catch {
      void 0;
    }
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
export const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableWalletConnect: false,
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: false,
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
