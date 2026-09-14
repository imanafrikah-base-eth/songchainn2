import Navbar from "@/battlezone/components/Navbar";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import { WalletView } from "@/components/wallet/WalletView";

/**
 * The wallet, inside WaveWarz Africa, wearing the battle zone (founder, 15 Sep
 * 2026). Same holdings and the same rules as the SONGCHAINN wallet page, with
 * $WWAT up front because it is what hosts a battle and turns the voice on.
 */
export default function BattleWallet() {
  const { isEmbedded } = useEmbedMode();
  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Battle wallet" /> : <Navbar />}
      <div className="relative isolate">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96"
          style={{ background: "radial-gradient(70% 100% at 50% 0%, hsl(var(--neon-green) / 0.12), transparent 70%)" }}
        />
        <WalletView look="wavewarz" />
      </div>
    </div>
  );
}
