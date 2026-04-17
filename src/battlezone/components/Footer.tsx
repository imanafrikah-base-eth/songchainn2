import { Zap } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";

const Footer = () => (
  <footer className="border-t border-border bg-card/40 backdrop-blur mt-20">
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-foreground">WaveWarz Africa</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <AppLink to="/" className="hover:text-foreground transition-colors">Home</AppLink>
          <AppLink to="/battles/live" className="hover:text-foreground transition-colors">Live Battles</AppLink>
          <AppLink to="/battles/upcoming" className="hover:text-foreground transition-colors">Upcoming</AppLink>
          <AppLink to="/battles/results" className="hover:text-foreground transition-colors">Results</AppLink>
          <AppLink to="/how-it-works" className="hover:text-foreground transition-colors">How It Works</AppLink>
        </div>
        <div className="text-xs text-muted-foreground">
          Powered by <span className="text-primary font-semibold">$ongChainn</span>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
