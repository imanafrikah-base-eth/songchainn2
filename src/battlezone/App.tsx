import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/battlezone/components/ui/sonner";
import { Toaster } from "@/battlezone/components/ui/toaster";
import { TooltipProvider } from "@/battlezone/components/ui/tooltip";
import { AuthProvider } from "@/battlezone/contexts/AuthContext";
import { EmbedModeProvider } from "@/battlezone/contexts/EmbedModeContext";
import Index from "./pages/Index";
import HowItWorks from "./pages/HowItWorks";
import LiveBattles from "./pages/LiveBattles";
import UpcomingBattles from "./pages/UpcomingBattles";
import Results from "./pages/Results";
import BattleDetail from "./pages/BattleDetail";
import LiveRoom from "./pages/LiveRoom";
import RoomEntry from "./pages/RoomEntry";
import HostCreate from "./pages/HostCreate";
import HostControl from "./pages/HostControl";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <EmbedModeProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/battles/live" element={<LiveBattles />} />
              <Route path="/battles/upcoming" element={<UpcomingBattles />} />
              <Route path="/battles/results" element={<Results />} />
              <Route path="/battle/:battleId" element={<BattleDetail />} />
              <Route path="/entry/:roomId" element={<RoomEntry />} />
              <Route path="/room/:roomId" element={<LiveRoom />} />
              <Route path="/host/create" element={<HostCreate />} />
              <Route path="/host/control/:roomId" element={<HostControl />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </EmbedModeProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
