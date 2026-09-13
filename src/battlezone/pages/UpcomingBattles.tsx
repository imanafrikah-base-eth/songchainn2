import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import BattleCard from "@/battlezone/components/BattleCard";
import AppLink from "@/battlezone/components/AppLink";
import { useBattles } from "@/battlezone/hooks/useBattles";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const UpcomingBattles = () => {
  const { isEmbedded } = useEmbedMode();
  const { data: upcomingBattles = [], isLoading } = useBattles("upcoming");

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Upcoming Battles" /> : <Navbar />}
      <div className={`mx-auto max-w-7xl px-4 ${isEmbedded ? "py-6" : "py-12"} space-y-8`}>
        <div className="text-center">
          <h1 className="text-3xl font-display font-black text-foreground mb-2">📅 Upcoming Battles</h1>
          {(isLoading || upcomingBattles.length > 0) && (
            <p className="text-muted-foreground">Battles scheduled and ready to go</p>
          )}
        </div>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">Loading...</p>
        ) : upcomingBattles.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingBattles.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center">
            <p className="font-semibold text-foreground">Nothing on the calendar yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <AppLink to="/host/create" className="font-semibold text-primary hover:underline">Host a battle</AppLink>
              {" "}or{" "}
              <AppLink to="/battles/results" className="font-semibold text-primary hover:underline">watch how past battles went</AppLink>.
            </p>
          </div>
        )}
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default UpcomingBattles;
