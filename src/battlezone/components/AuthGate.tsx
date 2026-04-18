import { useEffect } from "react";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import { Zap, ExternalLink, Loader2 } from "lucide-react";
import wavewarzLogo from "@/battlezone/assets/wavewarz-logo-2.png";

const SONGCHAINN_URL = "https://www.songchainn.xyz";
const SONGCHAINN_SSO_URL = import.meta.env.VITE_SONGCHAINN_SSO_URL as string | undefined;
const AUTO_AUTH_ATTEMPT_KEY = "songchainn:auto-auth-attempted";

const buildSongchainAuthUrl = (redirectTo: string) => {
  if (!SONGCHAINN_SSO_URL) return SONGCHAINN_URL;

  try {
    const url = new URL(SONGCHAINN_SSO_URL);
    url.searchParams.set("redirect", redirectTo);
    return url.toString();
  } catch {
    return `${SONGCHAINN_SSO_URL}?redirect=${encodeURIComponent(redirectTo)}`;
  }
};

const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const authUrl = buildSongchainAuthUrl(window.location.href);

  useEffect(() => {
    if (loading || user || profile || !SONGCHAINN_SSO_URL) return;
    if (sessionStorage.getItem(AUTO_AUTH_ATTEMPT_KEY) === "1") return;

    sessionStorage.setItem(AUTO_AUTH_ATTEMPT_KEY, "1");
    window.location.href = buildSongchainAuthUrl(window.location.href);
  }, [loading, user, profile]);

  useEffect(() => {
    if (user && profile) {
      sessionStorage.removeItem(AUTO_AUTH_ATTEMPT_KEY);
    }
  }, [user, profile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <img src={wavewarzLogo} alt="WaveWarz Africa" className="h-20 w-auto animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Checking $ongChainn session...</p>
      </div>
    );
  }

  // Not signed in OR no songchainn audience profile
  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <img src={wavewarzLogo} alt="WaveWarz Africa" className="h-24 w-auto mx-auto float-slow" />
          
          <div className="space-y-3">
            <h1 className="text-3xl font-display font-black text-foreground">
              WaveWarz Africa BattleZone
            </h1>
            <p className="text-muted-foreground">
              Access WaveWarz through your <span className="text-primary font-semibold">$ongChainn</span> account. 
              Only registered $ongChainn users can enter BattleZone.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={authUrl}
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-primary px-6 py-4 font-bold text-primary-foreground text-lg hover:bg-primary/90 transition-all hover:shadow-[0_0_30px_hsl(var(--neon-green)/0.3)]"
            >
              <Zap className="h-5 w-5" /> Sign in to $ongChainn
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              Don't have an account?{" "}
              <a href={SONGCHAINN_URL} className="text-primary hover:underline">
                Join $ongChainn
              </a>{" "}
              to access WaveWarz Africa.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-foreground">Why $ongChainn?</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>- Your $ongChainn profile is your battle identity</li>
              <li>- Only $ongChainn artists and songs are featured</li>
              <li>- Votes and activity sync to your $ongChainn account</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
