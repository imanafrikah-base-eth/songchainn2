import { Radio, Users, Headphones, MapPin } from "lucide-react";
import { useBattles } from "@/battlezone/hooks/useBattles";

const StatsRow = () => {
  const { data: liveBattles = [] } = useBattles("live");

  const totalListeners = liveBattles.reduce((sum, b) => sum + b.listeners, 0);
  const totalArtists = liveBattles.length * 2;

  const stats = [
    { icon: Radio, label: "Live Rooms", value: String(liveBattles.length), color: "text-live" },
    { icon: Users, label: "Artists Battling", value: String(totalArtists), color: "text-primary" },
    { icon: Headphones, label: "Listeners Active", value: totalListeners.toLocaleString(), color: "text-neon-cyan" },
    { icon: MapPin, label: "Zambia Live", value: "ZM", color: "text-neon-gold" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card/60 px-4 py-5 backdrop-blur">
          <s.icon className={`h-5 w-5 ${s.color}`} />
          <span className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</span>
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
};

export default StatsRow;
