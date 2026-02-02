import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CatalogGridProps {
  children: ReactNode;
  className?: string;
}

export function CatalogGrid({ children, className }: CatalogGridProps) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4', className)}>
      {children}
    </div>
  );
}
