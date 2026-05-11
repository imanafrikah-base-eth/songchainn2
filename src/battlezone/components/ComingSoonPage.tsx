import { ExternalLink } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";

type ComingSoonPageProps = {
  title: string;
};

export default function ComingSoonPage({ title }: ComingSoonPageProps) {
  const { isEmbedded } = useEmbedMode();

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title={title} /> : <Navbar />}
      <main className={`mx-auto max-w-4xl px-4 ${isEmbedded ? "py-10" : "py-14"}`}>
        <header className="text-center space-y-3">
          <h1 className="text-3xl font-display font-black text-foreground sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Coming soon.</p>
        </header>

        <section className="mt-8 rounded-2xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground sm:text-base">
            You can register your music and country inside $ongChainn. All WaveWarz Africa battle activity happens on WaveWarz.com.
          </p>
          <a
            href="https://www.wavewarz.com"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open WaveWarz.com
          </a>
        </section>
      </main>
      {!isEmbedded && <Footer />}
    </div>
  );
}

