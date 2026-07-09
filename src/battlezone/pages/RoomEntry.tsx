import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLink from "@/battlezone/components/AppLink";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";

export default function RoomEntry() {
  const { embedTo } = useEmbedMode();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { data: battle, isLoading } = useBattle(roomId);

  useEffect(() => {
    if (!battle) return;
    if (battle.status === "live") {
      navigate(embedTo(`/room/${battle.id}`), { replace: true });
    } else {
      // Not live (yet, or anymore) -- send them to the battle page, which already
      // renders the right upcoming/ended state instead of a dead end here.
      navigate(embedTo(`/battle/${battle.id}`), { replace: true });
    }
  }, [battle?.id, battle?.status, embedTo, navigate]);

  if (isLoading || battle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Joining the battle room...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground mb-4">Battle not found.</p>
        <AppLink to="/" className="text-primary hover:underline">Go Home</AppLink>
      </div>
    </div>
  );
}
