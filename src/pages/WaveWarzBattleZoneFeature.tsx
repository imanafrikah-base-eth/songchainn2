import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/battlezone/components/ui/sonner";
import { Toaster } from "@/battlezone/components/ui/toaster";
import { TooltipProvider } from "@/battlezone/components/ui/tooltip";
import { AuthProvider } from "@/battlezone/contexts/AuthContext";
import { EmbedModeProvider } from "@/battlezone/contexts/EmbedModeContext";
import Index from "@/battlezone/pages/Index";
import HowItWorks from "@/battlezone/pages/HowItWorks";
import Learn from "@/battlezone/pages/Learn";
import LiveBattles from "@/battlezone/pages/LiveBattles";
import UpcomingBattles from "@/battlezone/pages/UpcomingBattles";
import Results from "@/battlezone/pages/Results";
import BattleDetail from "@/battlezone/pages/BattleDetail";
import LiveRoom from "@/battlezone/pages/LiveRoom";
import RoomEntry from "@/battlezone/pages/RoomEntry";
import HostCreate from "@/battlezone/pages/HostCreate";
import HostControl from "@/battlezone/pages/HostControl";
import NotFound from "@/battlezone/pages/NotFound";
import "@/battlezone/index.css";

const battleZoneQueryClient = new QueryClient();

export default function WaveWarzBattleZoneFeature() {
  return (
    <QueryClientProvider client={battleZoneQueryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <EmbedModeProvider>
            <Routes>
              <Route index element={<Index />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="learn" element={<Learn />} />
              <Route path="battles/live" element={<LiveBattles />} />
              <Route path="battles/upcoming" element={<UpcomingBattles />} />
              <Route path="battles/results" element={<Results />} />
              <Route path="battle/:battleId" element={<BattleDetail />} />
              <Route path="entry/:roomId" element={<RoomEntry />} />
              <Route path="room/:roomId" element={<LiveRoom />} />
              <Route path="host/create" element={<HostCreate />} />
              <Route path="host/control/:roomId" element={<HostControl />} />
              <Route path="live" element={<Navigate to="/wavewarz-africa/battles/live" replace />} />
              <Route path="create" element={<Navigate to="/wavewarz-africa/host/create" replace />} />
              <Route path="results" element={<Navigate to="/wavewarz-africa/battles/results" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </EmbedModeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
