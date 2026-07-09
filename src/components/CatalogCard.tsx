import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Catalog } from '@/data/musicData';

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
              src={catalog.coverImage}
              alt={catalog.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-cyan-400/10">
              <Music className="w-10 h-10 text-primary/70" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {isNew && (
            <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-glow">
              NEW
            </span>
          )}
        </div>
        <div className="relative p-3 sm:p-4">
          <h3 className="font-heading text-sm sm:text-base font-semibold text-foreground truncate">
            {catalog.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{catalog.artist}</p>
          <div className="mt-2 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
            <span>{catalog.trackCount} tracks</span>
            <span>{catalog.genre}</span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
