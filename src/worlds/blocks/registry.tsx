// The stock block set.
//
// This is what an artist who cannot code gets for free, and it is deliberately
// enough to build a complete world without buying anything. The marketplace
// later sells blocks that sit on the same shelf as these and are picked the
// same way; nothing about a bought block is special except who wrote it.
//
// Every block here is declarative. None of them fetch, compute or decide
// access. That is the property that makes the shelf safe to open to strangers.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePlayerActions } from '@/context/PlayerContext';
import { Button } from '@/components/ui/button';
import { WorldDrops } from '../components/WorldDrops';
import {
  bool,
  list,
  num,
  str,
  type BlockProps,
  type BlockTypeDef,
} from './spec';

/* ------------------------------------------------------------------ hero */

function HeroBlock({ props, ctx }: BlockProps) {
  const image = str(props, 'image') || ctx.world.heroImage || '';
  const title = str(props, 'title', ctx.world.artistName);
  const subtitle = str(props, 'subtitle');

  return (
    <section className="relative -mx-4 overflow-hidden sm:-mx-6">
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-40"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
      <div className="relative px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- story */

function StoryBlock({ props }: BlockProps) {
  const heading = str(props, 'heading');
  const paragraphs = list(props, 'body');
  if (!heading && !paragraphs.length) return null;

  return (
    <section className="py-6">
      {heading ? (
        <h3 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">{heading}</h3>
      ) : null}
      <div className="mt-3 space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- catalog list */

function CatalogListBlock({ props, ctx }: BlockProps) {
  const { playQueue } = usePlayerActions();
  const heading = str(props, 'heading', 'The records');
  const limit = Math.max(1, Math.min(50, num(props, 'limit', 8)));

  // Scoped to this world's artist, always. A block cannot reach another
  // artist's catalog, which is enforced by never giving it the ability to ask.
  const songs = useMemo(() => {
    const artist = ARTISTS.find((a) => a.id === ctx.world.artistId);
    const ids = new Set(artist?.songs ?? []);
    const mine = SONGS.filter((s) => ids.has(s.id) || s.artist === ctx.world.artistName);
    return mine.slice(0, limit);
  }, [ctx.world.artistId, ctx.world.artistName, limit]);

  if (!songs.length) return null;

  return (
    <section className="py-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">{heading}</h3>
        <Button
          size="sm"
          variant="secondary"
          className="h-9 rounded-full px-4 text-xs font-semibold"
          onClick={() => playQueue(songs)}
        >
          <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
          Play all
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {songs.map((song, i) => (
          <li key={song.id}>
            <button
              type="button"
              onClick={() => playQueue(songs.slice(i))}
              className="flex w-full items-center gap-3 py-2.5 text-left focus-ring"
            >
              <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              {song.coverImage ? (
                <img src={song.coverImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded bg-secondary" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{song.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{song.artist}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------- gallery grid */

function GalleryGridBlock({ props }: BlockProps) {
  const heading = str(props, 'heading');
  const images = list(props, 'images');
  if (!images.length) return null;

  return (
    <section className="py-6">
      {heading ? (
        <h3 className="mb-3 font-heading text-xl font-semibold text-foreground sm:text-2xl">
          {heading}
        </h3>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="aspect-square w-full rounded-lg object-cover"
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ video wall */

function VideoWallBlock({ props }: BlockProps) {
  const heading = str(props, 'heading');
  const videos = list(props, 'videos');
  if (!videos.length) return null;

  return (
    <section className="py-6">
      {heading ? (
        <h3 className="mb-3 font-heading text-xl font-semibold text-foreground sm:text-2xl">
          {heading}
        </h3>
      ) : null}
      <div className="space-y-3">
        {videos.map((src, i) => (
          <video
            key={i}
            src={src}
            controls
            playsInline
            preload="none"
            className="w-full rounded-lg bg-secondary"
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- countdown */

function CountdownBlock({ props }: BlockProps) {
  const label = str(props, 'label', 'Next');
  const when = str(props, 'when');
  const target = when ? new Date(when) : null;
  const valid = target && !Number.isNaN(target.getTime());

  return (
    <section className="py-6">
      <div className="rounded-lg border border-border bg-card px-5 py-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          {valid
            ? target.toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Date to be announced'}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- credits */

function CreditsBlock({ props }: BlockProps) {
  const heading = str(props, 'heading', 'Credits');
  const lines = list(props, 'lines');
  if (!lines.length) return null;

  return (
    <section className="py-6">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {heading}
      </h3>
      <ul className="mt-3 space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------- link row */

function LinkRowBlock({ props }: BlockProps) {
  // "Label | https://..." per line, so one field covers any number of links.
  const entries = list(props, 'links')
    .map((line) => {
      const [label, href] = line.split('|').map((s) => s.trim());
      return href ? { label: label || href, href } : null;
    })
    .filter((x): x is { label: string; href: string } => x !== null);

  if (!entries.length) return null;

  return (
    <section className="py-6">
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => {
          const internal = e.href.startsWith('/');
          const cls =
            'inline-flex h-10 max-w-full items-center truncate rounded-full border border-border px-4 text-sm text-foreground focus-ring';
          return internal ? (
            <Link key={i} to={e.href} className={cls}>
              {e.label}
            </Link>
          ) : (
            <a key={i} href={e.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {e.label}
            </a>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- note block */

function NoteBlock({ props, ctx }: BlockProps) {
  const text = str(props, 'text');
  const insidersOnly = bool(props, 'insidersOnly');
  if (!text) return null;
  // The block asks the host for a ring and is told yes or no. It never learns
  // a balance, a threshold, or a reason.
  if (insidersOnly && !ctx.rings?.ring2) return null;

  return (
    <section className="py-6">
      <p className="border-l-2 border-border pl-4 text-sm italic leading-relaxed text-muted-foreground sm:text-base">
        {text}
      </p>
    </section>
  );
}

/* ---------------------------------------------------------- collectibles */

function CollectiblesBlock({ props, ctx }: BlockProps) {
  const heading = str(props, 'heading', 'Collectibles');
  const note = str(props, 'note', 'Made here, minted on Base, yours to keep.');
  const limit = Math.max(1, Math.min(24, num(props, 'limit', 6)));
  // Scoped to this world, always. The block cannot name another world.
  return <WorldDrops worldSlug={ctx.world.slug} heading={heading} note={note} limit={limit} />;
}

/* ------------------------------------------------------------- the shelf */

export const BLOCK_TYPES: BlockTypeDef[] = [
  {
    id: 'hero',
    name: 'Hero',
    description: 'A big image with a title over it. Good at the top of a street.',
    category: 'visual',
    component: HeroBlock,
    defaults: { title: '', subtitle: '', image: '' },
    props: [
      { key: 'title', label: 'Title', kind: 'text', placeholder: 'Leave empty to use your name' },
      { key: 'subtitle', label: 'One line under it', kind: 'text', maxLength: 140 },
      { key: 'image', label: 'Background image', kind: 'image', help: 'Yours. Not a stock photo.' },
    ],
  },
  {
    id: 'story',
    name: 'Story',
    description: 'A heading and some paragraphs. The thing people actually read.',
    category: 'words',
    component: StoryBlock,
    defaults: { heading: '', body: '' },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'body', label: 'Paragraphs', kind: 'lines', help: 'One paragraph per line.' },
    ],
  },
  {
    id: 'catalog-list',
    name: 'The records',
    description: 'Your catalog, playable, in one list.',
    category: 'music',
    component: CatalogListBlock,
    defaults: { heading: 'The records', limit: 8 },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'limit', label: 'How many', kind: 'number', min: 1, max: 50 },
    ],
  },
  {
    id: 'gallery-grid',
    name: 'Gallery',
    description: 'A grid of images.',
    category: 'visual',
    component: GalleryGridBlock,
    defaults: { heading: '', images: '' },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'images', label: 'Images', kind: 'images', help: 'One image link per line.' },
    ],
  },
  {
    id: 'video-wall',
    name: 'Video wall',
    description: 'Videos, stacked.',
    category: 'visual',
    component: VideoWallBlock,
    defaults: { heading: '', videos: '' },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'videos', label: 'Videos', kind: 'lines', help: 'One video link per line.' },
    ],
  },
  {
    id: 'countdown',
    name: 'Countdown',
    description: 'A date people are waiting on.',
    category: 'event',
    component: CountdownBlock,
    defaults: { label: 'Next', when: '' },
    props: [
      { key: 'label', label: 'Label', kind: 'text', placeholder: 'Next drop' },
      { key: 'when', label: 'When', kind: 'date' },
    ],
  },
  {
    id: 'credits',
    name: 'Credits',
    description: 'Who did what. One line each.',
    category: 'words',
    component: CreditsBlock,
    defaults: { heading: 'Credits', lines: '' },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'lines', label: 'Lines', kind: 'lines', help: 'One credit per line.' },
    ],
  },
  {
    id: 'link-row',
    name: 'Links',
    description: 'A row of buttons out to anywhere.',
    category: 'people',
    component: LinkRowBlock,
    defaults: { links: '' },
    props: [
      {
        key: 'links',
        label: 'Links',
        kind: 'lines',
        help: 'One per line, as: Label | https://example.com',
      },
    ],
  },
  {
    id: 'collectibles',
    name: 'Collectibles',
    description: 'Your drops, with a Collect button. Made in the Drops step.',
    category: 'music',
    component: CollectiblesBlock,
    defaults: { heading: 'Collectibles', note: 'Made here, minted on Base, yours to keep.', limit: 6 },
    props: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'note', label: 'One line under it', kind: 'text', maxLength: 140 },
      { key: 'limit', label: 'How many', kind: 'number', min: 1, max: 24 },
    ],
  },
  {
    id: 'note',
    name: 'Note',
    description: 'A short aside. Can be set to show only to insiders.',
    category: 'words',
    component: NoteBlock,
    defaults: { text: '', insidersOnly: false },
    props: [
      { key: 'text', label: 'Note', kind: 'longtext' },
      {
        key: 'insidersOnly',
        label: 'Insiders only',
        kind: 'boolean',
        help: 'Hidden from anyone who does not hold enough of the key.',
      },
    ],
  },
];

export const BLOCK_BY_ID = new Map(BLOCK_TYPES.map((b) => [b.id, b]));

export function getBlockType(id: string): BlockTypeDef | undefined {
  return BLOCK_BY_ID.get(id);
}
