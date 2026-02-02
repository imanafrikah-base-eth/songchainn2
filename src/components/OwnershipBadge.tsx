import { Lock, Unlock, WifiOff, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OwnershipStatus } from '@/hooks/useSongOwnership';

interface OwnershipBadgeProps {
  status: OwnershipStatus;
  offlinePlays?: number;
  previewSecondsRemaining?: number;
  className?: string;
  size?: 'sm' | 'md';
}

export function OwnershipBadge({ 
  status, 
  offlinePlays = 0, 
  previewSecondsRemaining = 0,
  className,
  size = 'sm'
}: OwnershipBadgeProps) {
  if (status === 'free') return null;

  const sizeClasses = size === 'sm' 
    ? 'text-[10px] px-2 py-0.5 gap-1' 
    : 'text-xs px-2.5 py-1 gap-1.5';

  const iconSize = size === 'sm' ? 10 : 12;

  const badges: Record<OwnershipStatus, { label: string; icon: React.ReactNode; color: string } | null> = {
    free: null,
    preview: {
      label: previewSecondsRemaining > 0 ? `${previewSecondsRemaining}s preview` : 'Preview',
      icon: <Clock size={iconSize} />,
      color: 'text-amber-300'
    },
    preview_used: {
      label: 'Locked',
      icon: <Lock size={iconSize} />,
      color: 'text-destructive'
    },
    owned: {
      label: 'Owned',
      icon: <Unlock size={iconSize} />,
      color: 'text-emerald-300'
    },
    offline_ready: {
      label: `Offline (${offlinePlays})`,
      icon: <WifiOff size={iconSize} />,
      color: 'text-primary'
    }
  };

  const badge = badges[status];
  if (!badge) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border border-primary/40 bg-background/80 backdrop-blur-sm shadow-soft',
        sizeClasses,
        badge.color,
        className
      )}
    >
      {badge.icon}
      {badge.label}
    </span>
  );
}
