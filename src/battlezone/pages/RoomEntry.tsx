import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLink from "@/battlezone/components/AppLink";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import { installBattleAudioGestureUnlock } from "@/battlezone/lib/audioUnlock";

/* "Enter the room" is a tap, so it unlocks sound. The automatic redirect is
   not a gesture; if the browser refuses, the room shows its tap overlay. */
installBattleAudioGestureUnlock();

/**
 * The door for a shared battle link, where the battle's status is genuinely
 * unknown until it is fetched.
 *
 * Taps from inside the app no longer come through here. A battle card and the
 * battle page both already know the battle is live, so they link straight to
 * /room/:id; routing them through this page bought a second fetch and nothing
 * else, and that wait was what made one tap feel like no tap.
 *
 * What is left is a page that only ever waits on a fetch it actually needs, and
 * that never becomes a dead end: the redirect fires exactly once, and if it has
 * not happened within a couple of seconds there is a real button to press.
 */
export default function RoomEntry() {
  const { embedTo } = useEmbedMode();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { data: battle, isLoading, isError } = useBattle(roomId);
  const [tookTooLong, setTookTooLong] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTookTooLong(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!battle || sent.current) return;
    sent.current = true;
    // A live battle goes to the room. Anything else goes to the battle page,
    // which already renders the right upcoming or ended state.
    const target = battle.status === "live" ? `/room/${battle.id}` : `/battle/${battle.id}`;
    navigate(embedTo(target), { replace: true });
  }, [battle, embedTo, navigate]);

  if (!isLoading && (isError || !battle)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-foreground font-bold mb-1">That battle is not here.</p>
          <p className="text-muted-foreground text-sm mb-4">
            The link may be old, or the battle was removed.
          </p>
          <AppLink to="/battles/live" className="text-primary hover:underline">
            See what is live now
          </AppLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-muted-foreground">Opening the battle room...</p>
        {tookTooLong && battle && (
          <AppLink
            to={battle.status === "live" ? `/room/${battle.id}` : `/battle/${battle.id}`}
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Enter the room
          </AppLink>
        )}
      </div>
    </div>
  );
}
