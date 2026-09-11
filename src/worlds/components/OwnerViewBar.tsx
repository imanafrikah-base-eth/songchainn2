import { Link } from 'react-router-dom';
import { Eye, KeyRound, Pencil } from 'lucide-react';

/**
 * The bar an artist sees standing in their own world.
 *
 * Two things were wrong before it. An artist could not get past their own
 * gates unless they held enough of their own coin, which is absurd for the
 * person who built the rooms, and a draft could not be looked at at all. And
 * once that was fixed, they had no way to check what a stranger actually sees,
 * which is the thing they are really asking about when they say "how does my
 * world look".
 *
 * So: it says plainly which of the two views they are in, switches between
 * them in one tap, and puts the builder one tap away. Nobody but the owner
 * ever sees it.
 */
export function OwnerViewBar({
  slug,
  worldId,
  draft,
  asVisitor,
  onAsVisitorChange,
}: {
  slug: string;
  worldId?: string;
  /** A world that has not opened its doors yet. */
  draft?: boolean;
  asVisitor: boolean;
  onAsVisitorChange: (next: boolean) => void;
}) {
  return (
    <div className="pointer-events-auto fixed inset-x-2 bottom-20 z-[55] mx-auto max-w-lg rounded-2xl border border-white/15 bg-black/80 p-2.5 backdrop-blur sm:bottom-24">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 px-1">
          <span className="block text-[11px] font-semibold text-white">
            {asVisitor ? 'Seeing it as a visitor' : draft ? 'Your draft, all doors open to you' : 'Your world, all doors open to you'}
          </span>
          <span className="block text-[11px] leading-snug text-white/60">
            {asVisitor
              ? 'This is what somebody with your real holdings would get.'
              : draft
                ? 'Nobody else can see this yet.'
                : 'Owning it opens every door. Visitors still need the key.'}
          </span>
        </span>

        <button
          type="button"
          onClick={() => onAsVisitorChange(!asVisitor)}
          aria-pressed={asVisitor}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          {asVisitor ? <KeyRound className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {asVisitor ? 'Back to my view' : 'See it as a visitor'}
        </button>

        <Link
          to={worldId ? `/world-builder?id=${worldId}` : '/world-builder'}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
      </div>
    </div>
  );
}

export default OwnerViewBar;
