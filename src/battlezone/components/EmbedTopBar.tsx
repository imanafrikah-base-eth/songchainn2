import { ExternalLink } from "lucide-react";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";

interface EmbedTopBarProps {
  title?: string;
}

const EmbedTopBar = ({ title }: EmbedTopBarProps) => {
  const { isEmbedded, openStandalone } = useEmbedMode();

  if (!isEmbedded) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/70 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <p className="truncate text-sm font-semibold text-foreground">{title || "WaveWarz Africa"}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openStandalone()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50"
          >
            Open Full Battle View
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <img
            src={wavewarzLogo}
            alt="WaveWarz Africa"
            className="h-7 w-auto opacity-90"
          />
        </div>
      </div>
    </div>
  );
};

export default EmbedTopBar;
