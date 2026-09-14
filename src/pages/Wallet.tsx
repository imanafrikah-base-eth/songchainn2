import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { WalletView } from '@/components/wallet/WalletView';

/**
 * The wallet on SONGCHAINN, in its own bright light (founder, 15 Sep 2026).
 * The page itself lives in WalletView, which the battle zone wears too.
 */
export default function Wallet() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="wallet-theme min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)]">
        <WalletView look="songchainn" />
      </div>
      <AudioPlayer />
    </div>
  );
}
