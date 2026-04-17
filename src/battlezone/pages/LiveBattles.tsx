import { useState } from "react";
import { Search } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import BattleCard from "@/battlezone/components/BattleCard";
import { useBattles } from "@/battlezone/hooks/useBattles";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const regions = ["All", "Zambia", "South Africa", "Nigeria", "Zimbabwe"];

const LiveBattles = () => {
  const { isEmbedded } = useEmbedMode();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const { data: liveBattles = [], isLoading } = useBattles("live");

  const filtered = liveBattles.filter((b) => {
    if (region !== "All" && b.region !== region) return false;
    if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Live Battles" /> : <Navbar />}
      <div className={`mx-auto max-w-7xl px-4 ${isEmbedded ? "py-6" : "py-12"} space-y-8`}>
        <div className="text-center">
          <h1 className="text-3xl font-display font-black text-foreground mb-2">ðŸ”´ Live Battles</h1>
          <p className="text-muted-foreground">Jump into a battle happening right now</p>
        </div>

        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search battles..."
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                region === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-surface-3"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">Loading battles...</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-10">No live battles found.</p>
        )}
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default LiveBattles;
