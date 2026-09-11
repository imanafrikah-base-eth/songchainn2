import { songPath } from '@/lib/slugRoutes';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { useSongDetails } from '@/lib/songDetails';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const USES = ['Film or TV', 'Advert', 'Game', 'Podcast or radio', 'Social video', 'Live event', 'Sample or remix', 'Other'];

/**
 * The sync desk.
 *
 * A music supervisor, an agency or a game studio wants to use a record. On
 * every other platform that starts with finding an email. Here it is a form
 * on the song page that lands in the artist's Studio with the sender's
 * address, and the record's own identifiers (ISRC, ISWC, publisher,
 * collecting society) sit right beside it so clearance can start the same
 * day. SONGCHAINN is not the publisher and takes no cut of a licence; it
 * carries the request to the person who can say yes.
 */
export default function Licensing() {
  const { songId } = useParams<{ songId: string }>();
  const { songs: published } = usePublishedCatalog();
  const song = songId ? SONGS.find((s) => s.id === songId) ?? published.find((s) => s.id === songId) : undefined;
  const artistName = song ? (ARTISTS.find((a) => a.id === song.artistId)?.name ?? song.artist) : null;
  const { data: details } = useSongDetails(song?.id);

  const [form, setForm] = useState({ name: '', email: '', company: '', use: USES[0], territory: '', budget: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!song || !isSupabaseConfigured) return;
    if (!form.name.trim() || !/.+@.+\..+/.test(form.email)) {
      toast.error('Your name and a working email are the two things the artist needs to reply.');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('sync_requests' as never).insert({
        song_id: song.id,
        requester_name: form.name.trim().slice(0, 120),
        requester_email: form.email.trim().slice(0, 200),
        company: form.company.trim().slice(0, 120) || null,
        use_type: form.use,
        territory: form.territory.trim().slice(0, 120) || null,
        budget: form.budget.trim().slice(0, 60) || null,
        message: form.message.trim().slice(0, 2000) || null,
      } as never);
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <Link to={song ? songPath(song) : '/'} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <FileText className="mb-3 h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            {song ? `License "${song.title}"` : 'License a song'}
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            {song
              ? `Tell ${artistName} what you want to use it for. The request goes straight to them with your email, and the record's identifiers are below so clearance can start today.`
              : 'Open a song and choose "License this song" to reach its artist directly.'}
          </p>
        </header>

        {song && details && (details.isrc || details.iswc || details.publisher || details.pro) && (
          <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            {details.isrc && (<><dt className="text-muted-foreground">ISRC</dt><dd className="text-right font-mono text-xs text-foreground">{details.isrc}</dd></>)}
            {details.iswc && (<><dt className="text-muted-foreground">ISWC</dt><dd className="text-right font-mono text-xs text-foreground">{details.iswc}</dd></>)}
            {details.publisher && (<><dt className="text-muted-foreground">Publisher</dt><dd className="text-right text-foreground">{details.publisher}</dd></>)}
            {details.pro && (<><dt className="text-muted-foreground">Collecting society</dt><dd className="text-right text-foreground">{details.pro}</dd></>)}
          </dl>
        )}

        {song && !sent && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={label}>Your name</span><input value={form.name} onChange={(e) => set('name', e.target.value)} className={input} maxLength={120} /></label>
              <label className="block"><span className={label}>Email</span><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={input} maxLength={200} /></label>
              <label className="block"><span className={label}>Company</span><input value={form.company} onChange={(e) => set('company', e.target.value)} className={input} maxLength={120} placeholder="Optional" /></label>
              <label className="block">
                <span className={label}>Use</span>
                <select value={form.use} onChange={(e) => set('use', e.target.value)} className={input}>
                  {USES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label className="block"><span className={label}>Territory</span><input value={form.territory} onChange={(e) => set('territory', e.target.value)} className={input} maxLength={120} placeholder="Worldwide, Zambia, online only..." /></label>
              <label className="block"><span className={label}>Budget</span><input value={form.budget} onChange={(e) => set('budget', e.target.value)} className={input} maxLength={60} placeholder="A figure or a range, in any currency" /></label>
            </div>
            <label className="block">
              <span className={label}>What it is for</span>
              <textarea value={form.message} onChange={(e) => set('message', e.target.value)} rows={4} maxLength={2000} className={`${input} resize-y`} placeholder="The project, the scene or spot, how long the cut is, when you need an answer." />
            </label>
            <Button type="button" onClick={submit} disabled={sending} className="h-11 rounded-full px-6">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send to {artistName}
            </Button>
            <p className="text-xs text-muted-foreground">
              SONGCHAINN passes your request to the artist and takes nothing from the licence. Terms are agreed between you and them.
            </p>
          </div>
        )}

        {sent && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
            <p className="font-semibold text-foreground">Sent.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {artistName} has your request in their Studio and your email to reply to. If you do not hear back within a week, write to songchaindao@gmail.com and we will nudge them.
            </p>
          </div>
        )}

        <section className="mt-12 space-y-4 border-t border-border pt-8">
          <h2 className="font-heading text-lg font-semibold text-foreground">Rights, in plain words</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            SONGCHAINN is where the record lives and is heard. It is not a publisher, a collecting society or a distributor, and it does not collect performance royalties for anyone. Here is how the pieces fit.
          </p>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-foreground">The master</dt>
              <dd className="text-muted-foreground">Stays the artist's. Releasing here changes nothing about who owns the recording, and a coin of a song is access to it, not ownership of it.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Performance royalties</dt>
              <dd className="text-muted-foreground">Collected by a collecting society the writer belongs to: ZAMCOPS in Zambia, SAMRO in South Africa, PRS in the UK, ASCAP or BMI in the US, and their equivalents elsewhere. Register your works with yours, and put the society's name on the record here so a desk can see it.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Publishing</dt>
              <dd className="text-muted-foreground">If nobody administers your songs, a publishing administrator can register them worldwide and collect what is owed. Naming your publisher on the record here tells a licensee who to clear with.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Identifiers</dt>
              <dd className="text-muted-foreground">An ISRC names the recording and an ISWC names the composition. Your distributor issues the first; your society or publisher issues the second. Keep both on the record here and every store, society and sync desk is talking about the same song.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Everywhere else</dt>
              <dd className="text-muted-foreground">Release here first, then everywhere. SONGCHAINN sits beside your distributor, not in place of it. The stores reach listeners who have never heard of us; this is where the ones who care can hold, back and reach you.</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
