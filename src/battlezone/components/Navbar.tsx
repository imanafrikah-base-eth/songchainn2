import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Zap, Menu, X, Home, Radio, Calendar, Trophy, HelpCircle, LogOut, ArrowLeft } from "lucide-react";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";
import NotificationsDropdown from "@/battlezone/components/NotificationsDropdown";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import AppLink from "@/battlezone/components/AppLink";

const navItems = [
  { label: "Home", path: "/", icon: Home },
  { label: "Live Battles", path: "/battles/live", icon: Radio },
  { label: "Upcoming", path: "/battles/upcoming", icon: Calendar },
  { label: "Results", path: "/battles/results", icon: Trophy },
  { label: "How It Works", path: "/how-it-works", icon: HelpCircle },
];

const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
          <AppLink to="/" className="flex items-center gap-2">
            <img src={wavewarzLogo} alt="WaveWarz Africa" className="h-9 w-auto sm:h-10" />
          </AppLink>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <AppLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </AppLink>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Link
              to="/"
              className="hidden md:flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to $ongChainn
            </Link>
            <AppLink
              to="/host/create"
              className="hidden md:flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Zap className="h-4 w-4" /> Host a Battle
            </AppLink>
            
            {/* Profile chip */}
            {profile && (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (target.dataset.fallbackApplied === "true") return;
                        target.dataset.fallbackApplied = "true";
                        target.src = "/placeholder.svg";
                      }}
                    />
                  ) : (
                    (profile.display_name || profile.username || "?").charAt(0)
                  )}
                </div>
                <span className="hidden md:inline text-sm font-medium text-foreground">
                  {profile.display_name || profile.username}
                </span>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <button
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-out menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-card border-l border-border p-6 flex flex-col gap-2">
            <button onClick={() => setMobileOpen(false)} className="self-end p-2 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
            {profile && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10 mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary overflow-hidden">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (target.dataset.fallbackApplied === "true") return;
                        target.dataset.fallbackApplied = "true";
                        target.src = "/placeholder.svg";
                      }}
                    />
                  ) : (
                    (profile.display_name || profile.username || "?").charAt(0)
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{profile.display_name || profile.username}</p>
                  <p className="text-[10px] text-muted-foreground">$ongChainn</p>
                </div>
              </div>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <AppLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    location.pathname === item.path
                      ? "text-primary bg-primary/10 border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </AppLink>
              );
            })}
            <AppLink
              to="/host/create"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
            >
              <Zap className="h-4 w-4" />
              Host a Battle
            </AppLink>
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to $ongChainn
            </Link>
            <button
              onClick={() => { setMobileOpen(false); signOut(); }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
            <div className="mt-auto text-xs text-muted-foreground text-center">Connected to $ongChainn</div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
