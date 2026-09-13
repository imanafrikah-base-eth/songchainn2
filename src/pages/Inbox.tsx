import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Conversations } from '@/components/social/Conversations';

/**
 * Messages. The people you talk to and Mo$ha live in one list now, Mo$ha
 * pinned at the top, and every thread is drawn as the same chat.
 * See Conversations for the layout and dm/useMoshaThread for Mo$ha's line.
 */
export default function Inbox() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-[1400px] px-4 pb-4 pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:pl-28 lg:pt-6">
        <Conversations />
      </main>
      <AudioPlayer />
    </div>
  );
}
