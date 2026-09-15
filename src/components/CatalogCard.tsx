import { motion } from 'framer-motion';
import { NewBadge } from '@/components/NewBadge';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Catalog } from '@/data/musicData';
import { thumb } from '@/lib/img';

interface CatalogCardProps {
  catalog: Catalog;
  isNew?: boolean;
  className?: string;
}

export function CatalogCard({ catalog, isNew, className }: CatalogCardProps) {
  return (
    <Link to={`/catalog/${catalog.id}`} className="group">
      <motion.div
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          'relative overflow-hidden rounded-xl glass-card transition-shadow',
          className,
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative aspect-square overflow-hidden">
          {catalog.coverImage ? (
            <img
              src={thumb(catalog.coverImage, 240)}
              alt={catalog.title}
              width={240}
              height={240}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-secondary">
              <Music className="w-10 h-10 text-primary/70" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {isNew && (
            <NewBadge className="absolute right-2 top-2" />
          )}
        </div>
        <div className="relative p-3 sm:p-4">
          <h3 className="font-heading text-sm sm:text-base font-semibold text-foreground truncate">
            {catalog.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground truncate"><ArtistName name={catalog.artist} artistId={catalog.artistId} size={12} /></p>
          <div className="mt-2 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
            <span>{catalog.trackCount} tracks</span>
            <span>{catalog.genre}</span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
