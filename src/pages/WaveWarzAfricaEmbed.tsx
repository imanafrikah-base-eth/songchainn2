import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { WAVEWARZ_AFRICA_LINKS } from '@/data/wavewarzAfrica';

const BATTLEZONE_ORIGIN = 'https://africabattlezone.songchainn.xyz';

function getBattleZonePath(pathname: string, roomId?: string) {
  if (pathname === '/wavewarz-africa/live') return '/battles/live';
  if (pathname === '/wavewarz-africa/results') return '/battles/results';
  if (pathname.startsWith('/wavewarz-africa/room/') && roomId) return `/room/${roomId}`;
  return '/';
}

function buildEmbedUrl(path: string, accessToken?: string, refreshToken?: string) {
  const url = new URL(path, BATTLEZONE_ORIGIN);
  url.searchParams.set('embed', '1');
  if (accessToken && refreshToken) {
    // Token handoff allows BattleZone iframe to hydrate the same Supabase session.
    url.searchParams.set('songchain_access_token', accessToken);
    url.searchParams.set('songchain_refresh_token', refreshToken);
  }
  return url.toString();
}

export default function WaveWarzAfricaEmbed() {
  const location = useLocation();
  const { roomId } = useParams<{ roomId: string }>();
  const battlePath = useMemo(() => getBattleZonePath(location.pathname, roomId), [location.pathname, roomId]);
  const standaloneHref = useMemo(() => new URL(battlePath, BATTLEZONE_ORIGIN).toString(), [battlePath]);
  const [iframeSrc, setIframeSrc] = useState(() => buildEmbedUrl(battlePath));

  useEffect(() => {
    let cancelled = false;
    const hydrateIframeSrc = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const accessToken = data.session?.access_token;
      const refreshToken = data.session?.refresh_token;
      setIframeSrc(buildEmbedUrl(battlePath, accessToken, refreshToken));
    };
    void hydrateIframeSrc();
    return () => {
      cancelled = true;
    };
  }, [battlePath]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="relative z-10 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] w-full">
        <section className="h-full w-full border-t border-border/40 bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 sm:px-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              WaveWarz Africa BattleZone is running in embedded mode.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 border-primary/30 text-primary">
                <a href={WAVEWARZ_AFRICA_LINKS.learnMore} target="_blank" rel="noreferrer">
                  Learn More
                </a>
              </Button>
              <Button asChild size="sm" className="h-8">
                <a href={standaloneHref} target="_blank" rel="noreferrer">
                  Open Full Battle View
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>

          <iframe
            title="WaveWarz Africa BattleZone"
            src={iframeSrc}
            className="h-[calc(100%-2.75rem)] w-full border-0 bg-background"
            allow="autoplay; clipboard-write; fullscreen; microphone; camera"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </section>
      </main>

      <AudioPlayer />
    </div>
  );
}
