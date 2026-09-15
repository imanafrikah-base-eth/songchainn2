import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { reallyBroken, thumb } from '@/lib/img';
import { Link } from 'react-router-dom';
import { X, Play, ChevronLeft, ChevronRight, Coins, ImageIcon, Clapperboard, Images, MoreHorizontal, Pencil, Eye, EyeOff, RefreshCw, Trash2, Loader2, Download, Lock, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useArtistGallery, useMyMedia, useMediaActions, useMediaUpload, type ArtistMediaItem } from '@/hooks/useArtistMedia';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * An artist's visual work, in order.
 *
 * Nothing falls loose on the page. Every piece sits in a section for its
 * kind (the clips together, the pictures together), each section has its
 * name and its count, and inside a section the tiles line up on one grid.
 * The frame is the same shape for every tile in a section; the picture
 * fills it and the full piece opens in the viewer at a tap.
 *
 * On the artist's own page every tile carries its own menu: edit the words,
 * hide it or show it, replace the file, delete it. The same things the
 * Studio can do, right where the work is. Hidden pieces show only to the
 * artist, marked as hidden.
 *
 * The coin pill only appears when a coin address genuinely exists. A piece
 * the artist has not coined says nothing about coins at all.
 */

interface Props {
  artistId: string | null | undefined;
  /** Shown when the artist has published nothing yet. */
  emptyMessage?: string;
}

type SectionKey = 'video' | 'image';

/**
 * How much of a section shows before the artist asks for the rest.
 *
 * A section used to render everything it had. One artist has twenty one
 * published pictures at up to four megabytes each, so her page was a wall of
 * full size photographs decoded into thumbnails, all at once. It read as
 * content pouring down the page with no shape to it, and it made the page
 * heavy enough to stall while scrolling. A preview and a count says what is
 * there in one line; See all opens the rest when somebody actually wants it.
 */
/** How many pieces an artist can lead their page with. */
const FAVOURITE_LIMIT = 3;

const SECTIONS: Array<{
  key: SectionKey; label: string; one: string; icon: typeof Clapperboard;
  grid: string; frame: string; preview: number;
}> = [
  { key: 'video', label: 'Clips', one: 'clip', icon: Clapperboard, grid: 'grid-cols-2 sm:grid-cols-3', frame: 'aspect-video', preview: 6 },
  { key: 'image', label: 'Pictures', one: 'picture', icon: Images, grid: 'grid-cols-3 sm:grid-cols-4', frame: 'aspect-square', preview: 8 },
];

const MAX_IMAGE_MB = 20;
const MAX_VIDEO_MB = 200;

export function ArtistGallery({ artistId, emptyMessage }: Props) {
  const { artistId: myArtistId } = useAuth();
  const canManage = !!artistId && !!myArtistId && String(myArtistId) === String(artistId);
  const pub = useArtistGallery(canManage ? undefined : artistId);
  const mine = useMyMedia();
  const items = (canManage ? mine.data : pub.data) ?? [];
  const isLoading = canManage ? mine.isLoading : pub.isLoading;
  const [openAt, setOpenAt] = useState<number | null>(null);
  /** Which sections the visitor has asked to see in full. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /**
   * Pieces whose file did not load. They drop out of the grid, the counts and
   * the viewer for this visit, and nothing is deleted: the row stays, so a
   * file that comes back shows again on the next load. The artist still sees
   * theirs, so they can replace or delete it.
   */
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const markBroken = useCallback((id: string) => {
    setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  /**
   * Nothing in the grid is fetched until the gallery is close to the screen.
   * It sits below the songs, and most visitors to an artist's page came for
   * the music; the count line above the grid still says what is here.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [near, isLoading, items.length]);

  // Sections in a fixed order, and one flat list in that same order so the
  // viewer walks through the gallery the way the page shows it.
  const { sections, ordered } = useMemo(() => {
    const usable = canManage ? items : items.filter((i) => !broken.has(i.id));
    const sections = SECTIONS.map((s) => ({ ...s, items: usable.filter((i) => i.kind === s.key) })).filter((s) => s.items.length > 0);
    const ordered = sections.flatMap((s) => s.items);
    return { sections, ordered };
  }, [items, broken, canManage]);

  /*
   * The three pieces the page leads with (N3M3SIS, 12 Sep 2026: "my page is too
   * busy, show your fave three pieces"). An artist marks up to three as
   * favourites from the tile menu; a favourite is simply a piece ordered before
   * zero. With none marked, the first three in the artist's order stand in.
   */
  const favourites = useMemo(() => {
    const live = ordered.filter((i) => i.is_published !== false);
    const byOrder = [...live].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const marked = byOrder.filter((i) => (i.sort_order ?? 0) < 0).slice(0, FAVOURITE_LIMIT);
    if (marked.length) return marked;
    // Nothing picked yet: lead with what shows best at a glance, pictures and
    // clips that have a poster, before clips that would be a blank frame.
    const showsWell = (i: ArtistMediaItem) => i.kind !== 'video' || !!i.poster_url;
    return [...byOrder.filter(showsWell), ...byOrder.filter((i) => !showsWell(i))].slice(0, FAVOURITE_LIMIT);
  }, [ordered]);
  const favouriteCount = useMemo(() => ordered.filter((i) => (i.sort_order ?? 0) < 0).length, [ordered]);
  const [showAll, setShowAll] = useState(false);
  const collapsed = !canManage && !showAll && ordered.length > favourites.length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!ordered.length) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {canManage ? 'Nothing here yet. Pictures and clips you add show up here, in order.' : emptyMessage ?? 'No artwork or video here yet.'}
        </p>
        {canManage && (
          <Button asChild size="sm" variant="outline" className="mt-3 rounded-full">
            <Link to="/studio">Add a picture or a clip</Link>
          </Button>
        )}
      </div>
    );
  }

  let offset = 0;
  return (
    <div ref={rootRef}>
      {/* The three the artist leads with, big. */}
      {favourites.length > 0 && (
        <section aria-label="Favourites" className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favourites</h4>
            {canManage && (
              <span className="text-[11px] text-muted-foreground/80">
                {favouriteCount ? `${favouriteCount} of ${FAVOURITE_LIMIT} picked` : 'Pick up to 3 from the menu on any piece'}
              </span>
            )}
          </div>
          <div className="grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
            {favourites.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpenAt(ordered.findIndex((o) => o.id === item.id))}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted"
                aria-label={item.title || (item.kind === 'video' ? 'Play clip' : 'Open picture')}
              >
                {near && (item.kind !== 'video' || item.poster_url) ? (
                  <img
                    src={thumb(item.kind === 'video' ? item.poster_url : item.public_url, 260)}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="block h-full w-full bg-gradient-to-br from-primary/25 via-muted to-background" aria-hidden="true" />
                )}
                {item.kind === 'video' && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                      <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
                    </span>
                  </span>
                )}
                {item.title && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-semibold text-white">
                    <span className="line-clamp-1">{item.title}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {collapsed ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
        >
          See the whole gallery ({ordered.length})
        </button>
      ) : (
      <>
      {/* What is in here, said in one line before any of it has to load. */}
      <p className="mb-3 text-xs text-muted-foreground">
        {sections
          .map((s) => `${s.items.length} ${s.items.length === 1 ? s.one : s.label.toLowerCase()}`)
          .join(' · ')}
      </p>

      <div className="space-y-6">
        {sections.map((section) => {
          const start = offset;
          offset += section.items.length;
          const Icon = section.icon;
          const isOpen = !!expanded[section.key];
          // Sliced from the front, so a tile's place in this list is still its
          // place in the flat list the viewer walks through.
          const shown = isOpen ? section.items : section.items.slice(0, section.preview);
          const hidden = section.items.length - shown.length;
          return (
            <section key={section.key} aria-label={section.label}>
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</h4>
                <span className="text-xs text-muted-foreground/70">{section.items.length}</span>
                {(hidden > 0 || isOpen) && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [section.key]: !isOpen }))}
                    className="ml-auto inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {isOpen ? 'Show less' : `See all ${section.items.length}`}
                  </button>
                )}
              </div>
              <div className={`grid gap-2 ${section.grid}`}>
                {shown.map((item, i) =>
                  near ? (
                    <Tile key={item.id} item={item} frame={section.frame} manage={canManage} onOpen={() => setOpenAt(start + i)} onBroken={markBroken} />
                  ) : (
                    <div key={item.id} className={`rounded-xl border border-border bg-muted ${section.frame}`} />
                  ),
                )}
              </div>
              {hidden > 0 && !isOpen && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [section.key]: true }))}
                  className="mt-2 w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted min-h-10"
                >
                  {hidden} more {hidden === 1 ? section.one : section.label.toLowerCase()}
                </button>
              )}
            </section>
          );
        })}
      </div>
      </>
      )}

      {openAt !== null && ordered[openAt] && (
        <Lightbox items={ordered} index={openAt} onIndex={setOpenAt} onClose={() => setOpenAt(null)} />
      )}
    </div>
  );
}

function Tile({ item, frame, manage, onOpen, onBroken }: { item: ArtistMediaItem; frame: string; manage: boolean; onOpen: () => void; onBroken: (id: string) => void }) {
  const onImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (reallyBroken(e)) onBroken(item.id);
  };
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-border bg-muted ${frame}`}>
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 block h-full w-full text-left"
        aria-label={item.title || (item.kind === 'video' ? 'Play clip' : 'Open picture')}
      >
        {item.kind === 'video' ? (
          <>
            {/* A clip is never downloaded to show its tile: the poster at tile
                size, or a plain dark frame, and the film only when tapped.
                preload="metadata" was pulling megabytes per clip on phones. */}
            {item.poster_url ? (
              <img src={thumb(item.poster_url, 200)} alt="" width={200} height={113} className="h-full w-full object-cover" loading="lazy" decoding="async" onError={onImgError} />
            ) : (
              <span className="block h-full w-full bg-gradient-to-br from-muted to-background" aria-hidden="true" />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
              </span>
            </span>
          </>
        ) : (
          <img
            /* Fetched at tile size: these were full size photographs, up to
               4 MB each, drawn into a third of a phone's width. The viewer
               still opens the original. */
            src={thumb(item.public_url, 140)}
            alt=""
            width={140}
            height={140}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
            onError={onImgError}
          />
        )}

        {item.coin_status === 'minted' && item.zora_coin_address && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Coins className="h-3 w-3" /> Coined
          </span>
        )}
        {manage && (item.sort_order ?? 0) < 0 && (
          <span className="absolute bottom-2 right-2 z-[1] flex h-6 w-6 items-center justify-center rounded-full bg-black/65 backdrop-blur-sm" aria-label="Favourite">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </span>
        )}
        {manage && !item.is_published && (
          <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-black">
            <EyeOff className="h-3 w-3" /> Hidden
          </span>
        )}
        {item.title && (
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-medium text-white">
            <span className="line-clamp-1">{item.title}</span>
          </span>
        )}
      </button>

      {manage && <OwnerMenu item={item} />}
    </div>
  );
}

/** Edit, hide or show, replace, delete: the artist's own menu on every piece. */
function OwnerMenu({ item }: { item: ArtistMediaItem }) {
  const { update, remove } = useMediaActions();
  const upload = useMediaUpload();
  const mine = useMyMedia();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState({ title: item.title ?? '', caption: item.caption ?? '' });
  const [busy, setBusy] = useState<string | null>(null);
  const isFavourite = (item.sort_order ?? 0) < 0;

  /* A favourite is ordered before zero, in the order it was picked, so the page leads with it. */
  const toggleFavourite = async () => {
    const favs = (mine.data ?? []).filter((m) => (m.sort_order ?? 0) < 0 && m.id !== item.id);
    if (!isFavourite && favs.length >= FAVOURITE_LIMIT) {
      toast(`You already have ${FAVOURITE_LIMIT} favourites`, { description: 'Take one off first, then pick this one.' });
      return;
    }
    setBusy('favourite');
    try {
      await update.mutateAsync({ id: item.id, sort_order: isFavourite ? 0 : -100 + favs.length });
      toast(isFavourite ? 'Off your favourites' : 'Now one of your favourites', {
        description: isFavourite ? undefined : 'Your page leads with it.',
      });
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const toggleHidden = async () => {
    setBusy('hide');
    try {
      await update.mutateAsync({ id: item.id, is_published: !item.is_published });
      toast(item.is_published ? 'Hidden from your page' : 'Showing on your page');
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const toggleDownload = async () => {
    setBusy('download');
    try {
      await update.mutateAsync({ id: item.id, allow_download: !item.allow_download });
      toast(item.allow_download ? 'Downloads off. Fans can look, not save.' : 'Downloads on for this piece.');
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    setBusy('edit');
    try {
      await update.mutateAsync({ id: item.id, title: draft.title.trim() || null, caption: draft.caption.trim() || null });
      toast('Saved');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    setBusy('delete');
    try {
      await remove.mutateAsync(item.id);
      toast('Deleted');
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not delete that.');
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  const replace = async (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const cap = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (file.size > cap * 1024 * 1024) {
      toast.error(`That file is too big. ${isVideo ? 'Video' : 'Images'} must be under ${cap} MB.`);
      return;
    }
    setBusy('replace');
    try {
      // The new file takes the old piece's words and place; the old file goes.
      const fresh = await upload.upload(file, { title: item.title ?? undefined, caption: item.caption ?? undefined, private: !item.is_published });
      if (!fresh) throw new Error(upload.error || 'The new file did not land.');
      await update.mutateAsync({ id: fresh.id, sort_order: item.sort_order });
      await remove.mutateAsync(item.id);
      toast('Replaced');
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not replace that.');
    } finally {
      setBusy(null);
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => void replace(e.target.files?.[0])}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${item.title || (item.kind === 'video' ? 'this clip' : 'this picture')}`}
            className="absolute right-1.5 top-1.5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => void toggleFavourite()} className="gap-2">
            <Star className={`h-4 w-4 ${isFavourite ? 'fill-amber-400 text-amber-400' : ''}`} />
            {isFavourite ? 'Not a favourite' : 'Make a favourite'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setDraft({ title: item.title ?? '', caption: item.caption ?? '' }); setEditing(true); }} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void toggleHidden()} className="gap-2">
            {item.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {item.is_published ? 'Hide' : 'Show'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => replaceRef.current?.click()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Replace
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void toggleDownload()} className="gap-2">
            {item.allow_download ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {item.allow_download ? 'Stop downloads' : 'Allow downloads'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirming(true)} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={(v) => !busy && setEditing(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit</DialogTitle>
            <DialogDescription>The words under this piece. Change them any time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Title"
              maxLength={120}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              value={draft.caption}
              onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
              placeholder="Say something about it"
              maxLength={300}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="button" disabled={!!busy} onClick={() => void saveEdit()}>{busy === 'edit' ? 'Saving' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {item.title || (item.kind === 'video' ? 'this clip' : 'this picture')}?</AlertDialogTitle>
            <AlertDialogDescription>It comes off your page for good. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={(e) => { e.preventDefault(); void del(); }}>
              {busy === 'delete' ? 'Deleting' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: ArtistMediaItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];

  // Arrow keys and Escape, because this is a full screen viewer and a keyboard
  // is how anybody on a laptop will try to move through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true" data-protect="" {...(item.allow_download ? { 'data-download-ok': '' } : {})}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-white/60">
          {index + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={item.public_url}
            poster={item.poster_url ?? undefined}
            className="max-h-full max-w-full"
            controls
            controlsList={item.allow_download ? undefined : 'nodownload noremoteplayback'}
            disablePictureInPicture={!item.allow_download}
            autoPlay
            playsInline
          />
        ) : (
          <img key={item.id} src={item.public_url} alt={item.title ?? ''} className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <div className="px-4 pb-6 pt-3">
        {(item.title || item.caption) && (
          <div className="mx-auto max-w-xl text-center">
            {item.title && <p className="text-sm font-semibold text-white">{item.title}</p>}
            {item.caption && <p className="mt-1 text-xs text-white/70">{item.caption}</p>}
          </div>
        )}
        {item.allow_download && (
          <p className="mt-3 text-center">
            <a href={item.public_url} download target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-4 text-xs font-semibold text-white">
              <Download className="h-4 w-4" /> Save
            </a>
          </p>
        )}
        {item.zora_coin_address && item.coin_status === 'minted' && (
          <p className="mt-3 text-center">
            <a
              href={`https://basescan.org/address/${item.zora_coin_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/80"
            >
              <Coins className="h-3 w-3" /> Coined on Base
            </a>
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
            aria-label="Previous"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={index === items.length - 1}
            onClick={() => onIndex(index + 1)}
            aria-label="Next"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
