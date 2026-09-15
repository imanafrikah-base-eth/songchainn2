import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Zap, Home, Radio, Calendar, Trophy, HelpCircle, LogOut, ArrowLeft, Wallet, Menu, X } from "lucide-react";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.webp";
import NotificationsDropdown from "@/battlezone/components/NotificationsDropdown";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import AppLink from "@/battlezone/components/AppLink";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/battlezone/components/ui/sheet";

const navItems = [
  { label: "Home", path: "/", icon: Home },
  { label: "Live Rooms", path: "/battles/live", icon: Radio },
  { label: "Upcoming", path: "/battles/upcoming", icon: Calendar },
  { label: "Results", path: "/battles/results", icon: Trophy },
  { label: "How It Works", path: "/how-it-works", icon: HelpCircle },
];

/** The router path carries the /wavewarz-africa prefix; the items do not. */
function isHere(pathname: string, path: string): boolean {
  const local = pathname.replace(/^\/wavewarz-africa/, "") || "/";
  return path === "/" ? local === "/" : local === path || local.startsWith(`${path}/`);
}

/**
 * The battle zone's top bar.
 *
 * On a phone the sections, the way back to SONGCHAINN and signing out used to
 * be hidden or pushed off the edge with no menu to find them in (founder,
 * 15 Sep 2026). A phone now gets the logo, the bell, the wallet and a menu
 * button, all on one line, and everything else lives in the menu.
 */
const Navbar = () => {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const onWallet = location.pathname.endsWith("/wallet");

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
          <AppLink to="/" className="flex min-w-0 shrink items-center gap-2">
            <img src={wavewarzLogo} alt="WaveWarz Africa" className="h-9 w-auto max-w-[9rem] object-contain sm:h-10 sm:max-w-none" />
          </AppLink>

          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <AppLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isHere(location.pathname, item.path)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </AppLink>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2">
            <NotificationsDropdown />
            {profile && (
              <AppLink
                to="/wallet"
                aria-label="Your wallet"
                title="Your wallet, the same one you use on SONGCHAINN"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                  onWallet
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                }`}
              >
                <Wallet className="h-4 w-4" />
              </AppLink>
            )}
            <Link
              to="/"
              className="hidden lg:flex items-center gap-2 whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to $ongChainn
            </Link>
            <a
              href="https://www.wavewarz.com"
              target="_blank"
              rel="noreferrer"
              className="hidden xl:flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Zap className="h-4 w-4" /> Open WaveWarz.com
            </a>

            {/* Profile chip */}
            {profile && (
              <div className="hidden lg:flex items-center gap-2">
                <Avatar profile={profile} />
                <span className="hidden xl:inline max-w-[10rem] truncate text-sm font-medium text-foreground">
                  {profile.display_name || profile.username}
                </span>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open the menu"
              aria-expanded={menuOpen}
              className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="wavewarz-theme flex w-[85vw] max-w-xs flex-col gap-0 border-l border-primary/20 p-0 [&>button]:hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <SheetTitle className="font-display text-base font-black text-foreground">WaveWarz Africa</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">The battle zone</SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close the menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {profile && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Avatar profile={profile} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {profile.display_name || profile.username}
              </span>
            </div>
          )}

          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const on = isHere(location.pathname, item.path);
              return (
                <AppLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                    on ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </AppLink>
              );
            })}
            {profile && (
              <AppLink
                to="/wallet"
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  onWallet ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                }`}
              >
                <Wallet className="h-5 w-5" />
                Your wallet
              </AppLink>
            )}

            <div className="my-2 h-px bg-border" />

            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to $ongChainn
            </Link>
            <a
              href="https://www.wavewarz.com"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              <Zap className="h-5 w-5 text-primary" />
              Open WaveWarz.com
            </a>
          </div>

          {profile && (
            <div className="border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void signOut();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

function Avatar({ profile }: { profile: { avatar_url?: string | null; display_name?: string | null; username?: string | null } }) {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
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
  );
}

export default Navbar;
