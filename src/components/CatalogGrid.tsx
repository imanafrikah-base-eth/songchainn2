import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CatalogGridProps {
  children: ReactNode;
  className?: string;
}

export const CatalogGrid = forwardRef<HTMLDivElement, CatalogGridProps>(function CatalogGrid(
  { children, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4', className)}
    >
      {children}
    </div>
  );
});
