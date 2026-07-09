import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const LAST_UPDATED = 'July 8, 2026';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const TermsOfUse = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-10">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Back to $ongChainn
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="font-heading text-3xl font-bold text-foreground">Terms of Use and Privacy Notice</h1>
          </div>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <Section title="1. Accepting these terms">
          <p>
            Welcome to $ongChainn. These terms are an agreement between you and $ongChainn covering the
            $ongChainn app, website, WaveWarz Africa battles, and every feature inside them. By creating an
            account or using $ongChainn, you accept these terms and consent to the data practices described
            below. If you do not agree, please do not use the app.
          </p>
        </Section>

        <Section title="2. What $ongChainn is">
          <p>
            $ongChainn is a music platform where fans stream and support music, artists share and grow their
            catalog, and songs can live onchain as tradeable coins on the Base network. It combines streaming,
            a social community, live battles, and a music marketplace.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            You can join with an email address, a Base wallet, a Farcaster account, or a Facebook account. You
            are responsible for keeping your sign-in method secure. You must provide accurate information and
            you may not impersonate another person or artist. One person per account, and you must be legally
            able to enter this agreement in your country.
          </p>
        </Section>

        <Section title="4. For fans">
          <p>
            As a fan you can stream songs, build playlists, follow artists, post to the community feed, chat,
            join listening rooms and battles, vote, and react. Play counts, votes, and charts must reflect real
            listening: bots, scripted plays, and vote manipulation are not allowed and may lead to removal of
            activity or your account.
          </p>
        </Section>

        <Section title="5. For musicians and artists">
          <p>
            When you submit music to $ongChainn you confirm that you own it or hold every right needed to share
            it, including rights in the recording, the composition, and the artwork. You keep full ownership of
            your music. You grant $ongChainn a non-exclusive license to host, stream, display, and promote your
            music and profile inside the app and in promotion of the platform, for as long as your music stays
            on $ongChainn.
          </p>
          <p>
            If your song is minted as a coin on the Base network, that onchain record is public and permanent
            by nature of the blockchain. Minting only happens as part of the $ongChainn catalog process, and
            removing a song from the app cannot erase what is already onchain.
          </p>
        </Section>

        <Section title="6. Wallets and onchain trading">
          <p>
            $ongChainn is non-custodial. We never hold, see, or store your wallet's private keys, seed phrase,
            or funds. Every onchain action, including buying or selling song coins, is signed by you in your own
            wallet app and executed directly on the Base network through public protocols such as Zora.
          </p>
          <p>
            Onchain transactions are irreversible and carry network fees. Coin prices can go up or down, and
            you can lose the full value of what you trade. Nothing in $ongChainn is financial advice. Trade only
            what you can afford, and always double check the transaction your wallet asks you to sign.
          </p>
        </Section>

        <Section title="7. Your data and your consent">
          <p>By using $ongChainn you consent to us collecting and using the following, for both fans and artists:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Account details: your email or connected identity (wallet address, Farcaster, or Facebook profile).</li>
            <li>Profile information you choose to share: name, photo, bio, location, and social links.</li>
            <li>Activity inside the app: plays, likes, pulses, votes, playlists, follows, posts, and comments.</li>
            <li>Messages you send in community chat, battle rooms, and the Mo$ha inbox.</li>
            <li>Basic technical data needed to run the service, such as device type and connection info.</li>
          </ul>
          <p>We use this data to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Operate the app: your library, feed, rooms, battles, and marketplace.</li>
            <li>Power features like recommendations, charts such as Hot Today, and artist stats.</li>
            <li>Keep the platform safe, prevent fraud and manipulation, and moderate content.</li>
            <li>Tell you about activity that involves you, like battles going live or replies to your posts.</li>
          </ul>
          <p>
            We do not sell your personal data. Your data is stored with our infrastructure providers (Supabase
            and Vercel) and is protected by access rules so that private things stay private: your messages are
            visible only to you, and only you can change your profile. Anything you post publicly (profile,
            posts, votes, comments) is visible to the community. Wallet addresses and onchain trades are public
            on the blockchain by design and are never under our control.
          </p>
          <p>
            Some features connect to outside services: X (for battle audio Spaces), Farcaster, Facebook, the
            Base network, Zora, and LiveKit. When you use those features, the data you share there is also
            governed by those services' own terms.
          </p>
          <p>
            You can update your profile at any time. To delete your account and its data, contact us at
            songchaindao@gmail.com and we will remove your personal data from the app. Onchain records cannot be
            deleted by anyone.
          </p>
        </Section>

        <Section title="8. Your content">
          <p>
            You own what you post. By posting on $ongChainn you give us permission to show and distribute that
            content inside the app so the community can see it. We may remove content that breaks these terms,
            is unlawful, or harms the community, and we may suspend accounts that repeatedly cross the line.
          </p>
        </Section>

        <Section title="9. What is not allowed">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Uploading music or artwork you do not have rights to.</li>
            <li>Impersonating any person, artist, or $ongChainn itself.</li>
            <li>Harassment, hate, threats, or sexual content involving minors.</li>
            <li>Manipulating plays, votes, charts, or coin markets.</li>
            <li>Scraping the platform, attacking our systems, or trying to access other users' data.</li>
          </ul>
        </Section>

        <Section title="10. WaveWarz battles">
          <p>
            Battles are community events. Hosts run them, audiences vote, and results come from real votes.
            Live battle audio may run on an X Space hosted by the battle host; joining that Space happens on X
            under X's terms. Battle results, votes, and room chat are part of the public community experience.
          </p>
        </Section>

        <Section title="11. Disclaimers">
          <p>
            $ongChainn is provided as is, without warranties of any kind. We do our best to keep the app fast,
            safe, and always on, but we cannot promise uninterrupted service, and we are not responsible for
            losses caused by blockchain networks, wallet apps, third-party services, or market movements. To the
            maximum extent the law allows, our total liability to you is limited to the amount you paid us in
            the past twelve months, which for a free app is zero.
          </p>
        </Section>

        <Section title="12. Changes and contact">
          <p>
            We may update these terms as $ongChainn grows. When we make meaningful changes we will update the
            date at the top and let you know in the app. Continuing to use $ongChainn after a change means you
            accept the new terms.
          </p>
          <p>
            Questions, rights requests, or takedown notices: <span className="text-foreground">songchaindao@gmail.com</span>
          </p>
        </Section>

        <div className="border-t border-border pt-6 pb-10">
          <p className="text-xs text-muted-foreground">
            $ongChainn. Built for artists and the fans who move them.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUse;
