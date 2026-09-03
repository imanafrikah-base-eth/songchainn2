import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Navigation } from '@/components/Navigation';

/**
 * What a key is, what a song copy is, and what neither of them is.
 *
 * Every screen that offers a key or a copy links here. The page exists so
 * that the word "coin" never has to carry the explanation on its own: a key
 * opens rooms, a copy is a record you hold, and both are said in terms of
 * access and belonging, with the risk stated once, plainly, in the middle
 * of the page rather than in a footnote.
 */
export default function Keys() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <KeyRound className="mb-3 h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">How keys and copies work</h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            Two things on SONGCHAINN can be held: a key to an artist's world, and a copy of a song. Both live in your own wallet on Base. Here is exactly what they do.
          </p>
        </header>

        <div className="space-y-8 text-sm">
          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">A key</h2>
            <p className="mt-2 max-w-prose text-muted-foreground">
              A key is the artist's own creator coin on Zora. Hold enough of it in your wallet and the inner rooms of their world open: the gallery, the studio, the parlour where you can book time with them. Hold less and they close again. That is the whole mechanism. The artist sets nothing about you; the door reads your wallet and nothing else.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">A copy</h2>
            <p className="mt-2 max-w-prose text-muted-foreground">
              A copy is a coin of one song on Base. Holding it means the record plays for you offline and your name is counted among the people who backed it. Every copy bought pays the artist's own wallet directly; SONGCHAINN never holds the money.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-heading text-base font-semibold text-foreground">What neither of them is</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Not an investment, and not sold as one. Nobody here promises a return, a rise, or a market for what you hold.</li>
              <li>Not a share of the music. A key or a copy is access and belonging, not ownership of a recording or its royalties.</li>
              <li>Not money we keep. You buy in your own wallet, from a market we do not run, and you can sell there the same way. Its price can fall to nothing.</li>
              <li>Not needed to listen. Everything on SONGCHAINN streams free. Keys and copies are for people who want to be closer than a stream.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">Fees</h2>
            <p className="mt-2 max-w-prose text-muted-foreground">
              A creator coin's own contract pays the artist a share of every trade; that is Zora's rule, not ours, and it is the same for every artist. SONGCHAINN's own fees on world keys are stated on the artist's world page before you buy anything. Network fees on Base are paid to the network and are usually a few cents.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold text-foreground">Your wallet</h2>
            <p className="mt-2 max-w-prose text-muted-foreground">
              A wallet is yours, not ours. We cannot move what is in it, freeze it, or recover it if you lose it. Nothing on a blockchain can be deleted, including by us, which is worth knowing before you connect one to your profile.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            The <Link to="/terms" className="underline underline-offset-4">Terms of Use</Link> are the full version of this page.
          </p>
        </div>
      </main>
    </div>
  );
}
