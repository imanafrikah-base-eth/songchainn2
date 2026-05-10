import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/battlezone/components/ui/sonner";
import { Toaster } from "@/battlezone/components/ui/toaster";
import { TooltipProvider } from "@/battlezone/components/ui/tooltip";
import { AuthProvider } from "@/battlezone/contexts/AuthContext";
import { EmbedModeProvider } from "@/battlezone/contexts/EmbedModeContext";
import ComingSoonPage from "@/battlezone/components/ComingSoonPage";
import Index from "@/battlezone/pages/Index";
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
              <Route path="how-it-works" element={<ComingSoonPage title="How WaveWarz Africa Works" />} />
              <Route path="battles/live" element={<ComingSoonPage title="Live Battles" />} />
              <Route path="battles/upcoming" element={<ComingSoonPage title="Upcoming Battles" />} />
              <Route path="battles/results" element={<ComingSoonPage title="Results" />} />
              <Route path="battle/:battleId" element={<ComingSoonPage title="Battle Details" />} />
              <Route path="entry/:roomId" element={<ComingSoonPage title="Battle Room" />} />
              <Route path="room/:roomId" element={<ComingSoonPage title="Battle Room" />} />
              <Route path="host/create" element={<ComingSoonPage title="Host a Battle" />} />
              <Route path="host/control/:roomId" element={<ComingSoonPage title="Host Control" />} />
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
